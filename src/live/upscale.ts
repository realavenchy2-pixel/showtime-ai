import type { UpscaleLook } from '@/engine/types';

import { fetchRender, putFile, startUpscale, StudioError, upscaleStatus, upscaleUpload, type ServerConfig } from './client';

// Takes a video rendered on this device to 1440p or 4K with Topaz on the studio server: the file
// goes straight to fal storage, the server starts the upscale, and the finished file comes back here.

export type UpscalePhase = 'upload' | 'waiting' | 'upscaling' | 'download';

export interface UpscaleOptions {
  look: UpscaleLook;
  /** How many times bigger: the long side picked over the long side this device rendered. */
  factor: number;
  filename: string;
  signal?: AbortSignal;
  /** Where the upscale is, and roughly how far along (0 to 1). fal doesn't report progress, so the middle is an estimate. */
  onProgress?: (phase: UpscalePhase, fraction: number) => void;
  /** Puts the song back when the upscaled file comes back without sound. */
  keepAudio?: (upscaled: Blob, original: Blob) => Promise<Blob>;
  pollMs?: number;
  /** Gives up after this long. A 3-minute 4K upscale usually takes a few minutes; this leaves room for a queue. */
  timeoutMs?: number;
  /** Seconds the upscale is expected to take, for the progress estimate. */
  expectSec?: number;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', stop, { once: true });
  });
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

/** fal hands its files out to browsers directly; the server passes them through when it doesn't. */
async function download(cfg: ServerConfig, url: string, signal?: AbortSignal): Promise<Blob> {
  try {
    const res = await fetch(url, { signal });
    if (res.ok) return await res.blob();
  } catch {
    checkCancel(signal);
  }
  return fetchRender(cfg, url);
}

/** The file type fal storage takes, without codec details. */
export function uploadType(blob: Blob): 'video/mp4' | 'video/webm' | 'video/quicktime' {
  const type = blob.type.split(';')[0].trim();
  return type === 'video/webm' || type === 'video/quicktime' ? type : 'video/mp4';
}

/** Upscales `video` and returns the bigger file. Throws with a plain reason when it can't. */
export async function upscaleVideo(cfg: ServerConfig, video: Blob, opts: UpscaleOptions): Promise<Blob> {
  const report = opts.onProgress ?? (() => {});
  const pollMs = opts.pollMs ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const expectSec = Math.max(30, opts.expectSec ?? 120);
  const contentType = uploadType(video);

  report('upload', 0);
  const slot = await upscaleUpload(cfg, { filename: opts.filename, contentType });
  checkCancel(opts.signal);
  await putFile(cfg, slot.uploadUrl, video, contentType);
  checkCancel(opts.signal);
  report('upload', 1);

  const job = await startUpscale(cfg, { videoUrl: slot.fileUrl, factor: opts.factor, look: opts.look });
  const began = Date.now();
  let status = job;
  while (status.status !== 'ready') {
    if (status.status === 'failed') throw new StudioError(status.error || 'Topaz could not upscale it', 502, 'UPSCALE_FAILED');
    if (Date.now() - began > timeoutMs) throw new StudioError('Topaz took too long', 504, 'UPSCALE_TIMEOUT');
    const elapsed = (Date.now() - began) / 1000;
    // Eases toward the end without reaching it, since fal doesn't say how far along it is.
    report(status.status === 'queued' ? 'waiting' : 'upscaling', Math.min(0.95, 1 - Math.exp(-elapsed / expectSec)));
    await wait(pollMs, opts.signal);
    try {
      status = await upscaleStatus(cfg, job.id);
    } catch (err) {
      // One missed check is not a failed upscale: the job keeps running on fal.
      if (err instanceof StudioError && (err.code === 'UNREACHABLE' || err.code === 'TIMEOUT')) continue;
      throw err;
    }
  }
  if (!status.url) throw new StudioError('Topaz sent back no file', 502, 'UPSCALE_FAILED');

  report('download', 0);
  const upscaled = await download(cfg, status.url, opts.signal);
  checkCancel(opts.signal);
  const out = opts.keepAudio ? await opts.keepAudio(upscaled, video) : upscaled;
  report('download', 1);
  return out;
}
