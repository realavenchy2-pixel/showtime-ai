import { failJob, finishJob, setJobProgress, switchProgress, updateBroll, updateShot } from '@/engine/actions';
import { brollPrompt } from '@/engine/broll';
import type { Project } from '@/engine/types';
import { mediaBlob, saveMedia } from '@/media/library';

import { brollStatus, createUpload, fetchRender, putFile, startBroll, startSwitch, switchStatus, type RemoteJob, type ServerConfig } from './client';
import { trimShot } from './trim';

// Runs a project's live jobs against the studio server and reports back through the engine.
// The engine starts a job marked `external`; this picks it up, does the provider work,
// and finishes it with the same transitions the simulation uses.

export interface RunnerHost {
  project: (id: string) => Project | undefined;
  apply: (id: string, fn: (p: Project) => Project) => void;
}

/** Shots sent to the provider at once from this device. Uploads are the bottleneck, not the provider. */
const SHOT_WORKERS = 3;
const POLL_MS = 4000;
/** Frames kept free under the provider's cap, in case a phone's frame rate wobbles. */
const FRAME_MARGIN = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const words = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
    }),
  );
}

/** Asks for a job's status until it is ready or failed. A few dropped answers in a row are tolerated. */
async function waitFor(read: () => Promise<RemoteJob>, alive: () => boolean, onProgress: (fraction: number) => void, pollMs: number): Promise<RemoteJob | undefined> {
  let misses = 0;
  let guess = 0;
  while (alive()) {
    await sleep(pollMs);
    if (!alive()) return undefined;
    let status: RemoteJob;
    try {
      status = await read();
      misses = 0;
    } catch (err) {
      misses += 1;
      if (misses >= 5) throw err;
      continue;
    }
    if (status.status === 'failed') throw new Error(status.error ?? 'The render failed.');
    if (status.status === 'ready') return status;
    // Providers that don't report progress still get a bar that creeps forward.
    guess = Math.min(0.9, guess + 0.04);
    onProgress(status.progress ?? guess);
  }
  return undefined;
}

export async function runSwitch(host: RunnerHost, cfg: ServerConfig, projectId: string, jobId: string, pollMs = POLL_MS): Promise<void> {
  const get = () => host.project(projectId);
  const alive = () => get()?.job?.id === jobId;
  const report = (shotId: string, patch: Parameters<typeof updateShot>[2]) => host.apply(projectId, (p) => switchProgress(updateShot(p, shotId, patch)));
  const refUploads = new Map<string, Promise<string | undefined>>();

  const uploadRef = (mediaId: string | undefined): Promise<string | undefined> => {
    if (!mediaId) return Promise.resolve(undefined);
    let pending = refUploads.get(mediaId);
    if (!pending) {
      pending = (async () => {
        const blob = await mediaBlob(mediaId);
        if (!blob) return undefined;
        const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
        const slot = await createUpload(cfg, `reference.${ext}`);
        await putFile(cfg, slot.uploadUrl, blob, blob.type || 'image/jpeg');
        return slot.uri;
      })();
      refUploads.set(mediaId, pending);
    }
    return pending;
  };

  const runShot = async (shotId: string) => {
    const p = get();
    const shot = p?.shots.find((s) => s.id === shotId);
    if (!p || !shot || !alive()) return;
    let remoteId = shot.remoteId;

    if (!remoteId) {
      report(shotId, { status: 'rendering', progress: 0.02 });
      const take = p.takes.find((t) => t.id === shot.takeId);
      const look = p.looks[shot.sectionId];
      const source = take?.mediaId ? await mediaBlob(take.mediaId) : undefined;
      if (!take || !source) throw new Error('The footage for this shot is not on this device.');
      if (!look) throw new Error('This shot has no look.');

      const from = take.mediaOffsetSec + (shot.start - take.start);
      const seconds = Math.min(shot.end - shot.start, (p.switchSettings.maxFrames - FRAME_MARGIN) / shot.fps);
      const clip = await trimShot(source, from, from + seconds, shot.fps, `shot-${shot.n}`);
      if (!alive()) return;
      report(shotId, { progress: 0.08 });

      const slot = await createUpload(cfg, clip.filename);
      await putFile(cfg, slot.uploadUrl, clip.blob, clip.contentType);
      const refs = (await Promise.all(look.refs.slice(0, p.switchSettings.maxRefs).map((r) => (r.remoteUri ? Promise.resolve(r.remoteUri) : uploadRef(r.mediaId))))).filter((x): x is string => !!x);
      if (!alive()) return;
      report(shotId, { progress: 0.16 });

      // Pointing at a subject and custom mattes need a matte upload, which the app does not have yet.
      const alphaMode = p.switchSettings.alphaMode === 'fill' ? 'fill' : 'auto';
      const started = await startSwitch(cfg, {
        sourceUri: slot.uri,
        prompt: look.prompt,
        referenceUris: refs,
        alphaMode,
        resolution: p.switchSettings.resolution,
        idempotencyKey: `${projectId}:${shotId}:${jobId}`,
      });
      remoteId = started.id;
      report(shotId, { remoteId, progress: 0.2 });
    }

    const id = remoteId;
    const done = await waitFor(() => switchStatus(cfg, id), alive, (f) => report(shotId, { progress: 0.2 + 0.72 * f }), pollMs);
    if (!done) return;
    if (!done.renderUrl) throw new Error('The switch finished without a video.');
    report(shotId, { progress: 0.95 });
    const render = await fetchRender(cfg, done.renderUrl);
    const renderMediaId = await saveMedia(render, 'clip');
    report(shotId, { status: 'ready', progress: 1, renderUrl: done.renderUrl, alphaUrl: done.alphaUrl, renderMediaId, error: undefined });
  };

  const waiting = (get()?.shots ?? []).filter((s) => s.status === 'queued' || s.status === 'rendering').map((s) => s.id);
  await pool(waiting, SHOT_WORKERS, async (shotId) => {
    try {
      await runShot(shotId);
    } catch (err) {
      if (alive()) report(shotId, { status: 'failed', error: words(err) });
    }
  });
  // If every shot was already settled, this still closes the job.
  if (alive()) host.apply(projectId, (p) => switchProgress(p));
}

export async function runBroll(host: RunnerHost, cfg: ServerConfig, projectId: string, jobId: string, pollMs = POLL_MS): Promise<void> {
  const get = () => host.project(projectId);
  const alive = () => get()?.job?.id === jobId;
  const p0 = get();
  if (!p0) return;
  // Only cutaways with a place in the video: anything else would be paid for and never shown.
  const ideas = p0.broll.ideas.filter((i) => i.keep && i.status === 'idea' && !i.clipId && i.at !== undefined);
  const aspect = p0.formats.includes('16:9') || p0.formats.length === 0 ? '16:9' : p0.formats[0];
  let finished = 0;
  const failures: string[] = [];

  await pool(ideas, 2, async (idea) => {
    if (!alive()) return;
    try {
      let job = await startBroll(cfg, { model: idea.model, prompt: brollPrompt(p0, idea), durationSec: idea.durationSec, aspect });
      if (job.status !== 'ready') {
        const id = job.id;
        const done = await waitFor(() => brollStatus(cfg, id), alive, () => undefined, pollMs);
        if (!done) return;
        job = done;
      }
      const address = job.url ?? job.dataUrl;
      if (!address) throw new Error('The clip came back empty.');
      const mediaId = await saveMedia(await fetchRender(cfg, address), 'clip');
      host.apply(projectId, (p) => updateBroll(p, idea.id, { mediaId, url: job.url, remoteId: job.id }));
    } catch (err) {
      failures.push(words(err));
      host.apply(projectId, (p) => updateBroll(p, idea.id, { keep: false }));
    }
    finished += 1;
    if (alive()) host.apply(projectId, (p) => setJobProgress(p, finished / ideas.length, `Generating b-roll, ${finished} of ${ideas.length} back`));
  });

  if (!alive()) return;
  if (ideas.length > 0 && failures.length === ideas.length) host.apply(projectId, (p) => failJob(p, `the b-roll did not render (${failures[0]}). Cutting without it.`));
  else host.apply(projectId, (p) => finishJob(p));
}

const running = new Map<string, string>();

/**
 * Looks at one project and, if it has a live job nobody is working on, starts working on it.
 * Safe to call on every store change.
 */
export function pickUp(host: RunnerHost, cfg: ServerConfig | undefined, p: Project): void {
  const job = p.job;
  if (!job?.external || p.pipeline !== 'live' || (job.stage !== 'switch' && job.stage !== 'broll')) return;
  if (running.get(p.id) === job.id) return;
  if (!cfg) {
    host.apply(p.id, (x) => failJob(x, 'the studio server is not connected. Check it under Account, then redo.'));
    return;
  }
  running.set(p.id, job.id);
  const work = job.stage === 'switch' ? runSwitch(host, cfg, p.id, job.id) : runBroll(host, cfg, p.id, job.id);
  void work
    .catch((err) => {
      if (host.project(p.id)?.job?.id === job.id) host.apply(p.id, (x) => failJob(x, words(err)));
    })
    .finally(() => {
      if (running.get(p.id) === job.id) running.delete(p.id);
    });
}
