import { Platform } from 'react-native';

import { deliverAt, exportCost, exportVideo, failJob, finishJob, needsUpscale, setExportFiles, setJobProgress, upscaleFailed } from '@/engine/actions';
import { useApp } from '@/engine/store';
import type { Format, Resolution, Version } from '@/engine/types';
import { versionSlug } from '@/engine/versions';
import { upscaleServer } from '@/live/session';
import { upscaleVideo, type UpscalePhase } from '@/live/upscale';
import { songUrl } from '@/media/audio';
import { aspectOf, buildComposition } from '@/media/composition';
import { canExport, exportComposition, type ExportAudio } from '@/media/exporter';
import { keepAudio } from '@/media/keepAudio';
import { saveMedia } from '@/media/library';

// Renders the finished video on this device, one format at a time, then for 1440p and 4K has Topaz
// upscale each one on the studio server. It lives outside any screen, so the render keeps going if
// the artist looks at something else in the app.

const running = new Map<string, AbortController>();

const FORMAT_FILE: Record<Format, string> = { '16:9': 'youtube', '9:16': 'reels', '1:1': 'square', '4:5': 'feed' };

/** Longest side this device renders at. Phones render 720p so the picture stays smooth while it records. */
export function deviceExportSize(): number {
  const phone = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  return phone ? 1280 : 1920;
}

/** Longest side for each resolution (its short side is the name: 1080p is 1080 on the short side). */
const LONG_SIDE: Record<Resolution, number> = { '720p': 1280, '1080p': 1920, '1440p': 2560, '4K': 3840 };

/** The size a long side renders as on this device. */
function renderedResolution(longSide: number): Resolution {
  return longSide >= LONG_SIDE['1080p'] ? '1080p' : '720p';
}

/** True when the picked size is bigger than this device renders, so Topaz finishes it on the studio server. */
export function upscalesOnServer(resolution: Resolution): boolean {
  return needsUpscale(resolution) && LONG_SIDE[resolution] > Math.min(LONG_SIDE[resolution], deviceExportSize());
}

export function exportDimensions(format: Format, resolution: Resolution = '1080p'): { width: number; height: number } {
  const aspect = aspectOf(format);
  // What this device renders: up to its own limit. 1440p and 4K are upscaled from it on the studio server.
  const longest = Math.min(LONG_SIDE[resolution], deviceExportSize());
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return aspect >= 1 ? { width: even(longest), height: even(longest / aspect) } : { width: even(longest * aspect), height: even(longest) };
}

/** The size the file comes out at: the size picked when Topaz upscales it, otherwise what this device renders. */
export function deliveredDimensions(format: Format, resolution: Resolution): { width: number; height: number } {
  return upscalesOnServer(resolution) ? targetDimensions(format, resolution) : exportDimensions(format, resolution);
}

/** The size the artist picked, before any device limit. */
export function targetDimensions(format: Format, resolution: Resolution): { width: number; height: number } {
  const aspect = aspectOf(format);
  const longest = LONG_SIDE[resolution];
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return aspect >= 1 ? { width: even(longest), height: even(longest / aspect) } : { width: even(longest * aspect), height: even(longest) };
}

/** "keef-v2-full-song-reels.mp4": the version is in every file name, so files sort in order and never overwrite. */
export function exportFileName(title: string, format: Format, extension: string, version?: Pick<Version, 'n' | 'part'>): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'showtime';
  return `${version ? versionSlug(title, version) : slug}-${FORMAT_FILE[format]}.${extension}`;
}

export function cancelExport(projectId: string): void {
  running.get(projectId)?.abort();
}

export type ExportOutcome = 'done' | 'needCredits' | 'needServer' | 'failed' | 'cancelled' | 'busy';

/** `audio` is the song player woken up inside the tap; one player carries every format. */
export async function runExport(projectId: string, audio?: ExportAudio): Promise<ExportOutcome> {
  const app = useApp.getState();
  const project = app.projects[projectId];
  if (!project || !project.song || project.job || running.has(projectId)) return 'busy';

  if (!canExport()) {
    // No renderer on this device: the simulated export stands in until the studio server renders it.
    return app.exportVideo(projectId) === 'started' ? 'done' : 'needCredits';
  }

  const resolution = project.exportState.resolution;
  const look = project.exportState.upscaler ?? 'clean';
  const renderLong = Math.min(LONG_SIDE[resolution] ?? LONG_SIDE['1080p'], deviceExportSize());
  const upscale = upscalesOnServer(resolution);
  const server = upscale ? upscaleServer(look) : undefined;
  // 1440p and 4K are only promised when a server can upscale them; nothing is charged without one.
  if (upscale && !server) return 'needServer';

  const plan = app.plan;
  const cost = app.chargeExport(projectId);
  if (cost === null) return 'needCredits';
  const formats = project.exportState.formats;
  const controller = new AbortController();
  running.set(projectId, controller);
  app.apply(projectId, (p) => exportVideo(p, cost, { external: true }));

  let lastReport = 0;
  let lastLabel = '';
  const report = (fraction: number, label: string) => {
    const now = Date.now();
    // A new step always shows; within a step, a few updates a second is plenty.
    if (now - lastReport < 250 && fraction < 1 && label === lastLabel) return;
    lastReport = now;
    lastLabel = label;
    useApp.getState().apply(projectId, (p) => setJobProgress(p, fraction, label));
  };
  // Rendering is the first part of the bar; with an upscale, Topaz takes the rest.
  const renderShare = upscale ? 0.4 : 1;

  try {
    const url = await songUrl(project.song);
    if (!url) throw new Error('The song file is missing on this device.');
    const rendered: { format: Format; blob: Blob; extension: string }[] = [];
    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const comp = buildComposition(project, { format, effects: true });
      if (!comp) throw new Error('There is nothing to render yet.');
      const label = formats.length === 1 ? 'Rendering your video. Keep this tab open.' : `Rendering format ${i + 1} of ${formats.length}. Keep this tab open.`;
      const result = await exportComposition(comp, url, {
        size: renderLong,
        audio,
        signal: controller.signal,
        onProgress: (f) => report(((i + f) / formats.length) * renderShare, label),
      });
      rendered.push({ format, blob: result.blob, extension: result.extension });
    }

    let delivered = rendered;
    let upscaleError: string | undefined;
    if (upscale && server) {
      const range = project.range ?? { start: 0, end: project.song.durationSec };
      const seconds = Math.max(5, range.end - range.start);
      const phaseLabel = (phase: UpscalePhase, i: number) => {
        const which = formats.length === 1 ? '' : ` (${i + 1} of ${formats.length})`;
        if (phase === 'upload') return `Sending it to the upscaler${which}. Keep this tab open.`;
        if (phase === 'waiting') return `Waiting for the upscaler${which}. Keep this tab open.`;
        if (phase === 'upscaling') return `Upscaling to ${resolution}${which}. Keep this tab open.`;
        return `Bringing back the ${resolution} file${which}.`;
      };
      const phaseStart: Record<UpscalePhase, number> = { upload: 0, waiting: 0.15, upscaling: 0.15, download: 0.9 };
      const phaseSpan: Record<UpscalePhase, number> = { upload: 0.15, waiting: 0.75, upscaling: 0.75, download: 0.1 };
      try {
        const out: typeof rendered = [];
        for (let i = 0; i < rendered.length; i++) {
          const r = rendered[i];
          const blob = await upscaleVideo(server, r.blob, {
            look,
            factor: LONG_SIDE[resolution] / renderLong,
            filename: `${FORMAT_FILE[r.format]}.${r.extension}`,
            signal: controller.signal,
            // A rough guess for the bar: Starlight rebuilds every frame and takes several times longer.
            expectSec: seconds * (look === 'detail' ? 4 : 1.5),
            keepAudio,
            onProgress: (phase, f) => report(renderShare + ((i + phaseStart[phase] + phaseSpan[phase] * f) / rendered.length) * (1 - renderShare), phaseLabel(phase, i)),
          });
          out.push({ format: r.format, blob, extension: 'mp4' });
        }
        delivered = out;
      } catch (err) {
        if (controller.signal.aborted) throw err;
        // The render on this device is still good: deliver it, and hand back what the upscale cost.
        upscaleError = (err as Error)?.message || 'the upscale stopped';
      }
    }

    const files: { format: Format; mediaId: string; extension: string }[] = [];
    for (const d of delivered) files.push({ format: d.format, mediaId: await saveMedia(d.blob, 'export'), extension: d.extension });
    const state = useApp.getState();
    // What came out without an upscale is what this device rendered: a phone's 1080p is 720p.
    if (!upscale) state.apply(projectId, (p) => deliverAt(p, LONG_SIDE[resolution] > renderLong ? renderedResolution(renderLong) : resolution));
    if (upscaleError) {
      const smaller = renderedResolution(renderLong);
      const refund = Math.max(0, cost - exportCost({ ...project, exportState: { ...project.exportState, resolution: smaller } }, plan));
      if (refund > 0) state.addCredits(refund);
      state.apply(projectId, (p) => upscaleFailed(p, smaller, upscaleError!, refund));
    }
    state.apply(projectId, (p) => setExportFiles(p, files));
    state.apply(projectId, finishJob);
    return 'done';
  } catch (err) {
    const cancelled = controller.signal.aborted;
    const state = useApp.getState();
    state.addCredits(cost);
    state.apply(projectId, (p) => failJob(p, cancelled ? 'the export was cancelled. Your credit is back.' : `${(err as Error)?.message ?? 'the render stopped.'} Your credit is back.`));
    return cancelled ? 'cancelled' : 'failed';
  } finally {
    running.delete(projectId);
  }
}
