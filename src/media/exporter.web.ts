import { Compositor } from './compositor.web';
import type { Composition } from './composition';
import { frameSize, sourceUrls } from './player.web';
import { recordingMime } from './recorder.web';

// Renders the finished video on this device: plays the composition into a canvas at full size,
// with the master song as its sound, and records the result. It runs in real time.

export interface ExportOptions {
  /** Longest side in pixels. */
  size: number;
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  /** File extension that matches what this browser can write: mp4 where it can, webm otherwise. */
  extension: 'mp4' | 'webm';
  width: number;
  height: number;
}

export function canExport(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!recordingMime() && 'captureStream' in HTMLCanvasElement.prototype;
}

export async function exportComposition(comp: Composition, songUrl: string, opts: ExportOptions): Promise<ExportResult> {
  const mime = recordingMime();
  if (!mime) throw new Error('This browser cannot save video. Try Chrome or Safari.');
  const fps = opts.fps ?? 30;
  const { width, height } = frameSize(comp.aspect, opts.size);
  const canvas = document.createElement('canvas');
  const compositor = new Compositor(canvas);
  compositor.resize(width, height);
  compositor.setComposition(comp, await sourceUrls(comp));

  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.src = songUrl;
  audio.preload = 'auto';
  await new Promise<void>((resolve, reject) => {
    audio.addEventListener('canplaythrough', () => resolve(), { once: true });
    audio.addEventListener('error', () => reject(new Error('The song could not be loaded for the export.')), { once: true });
    audio.load();
  });

  // The song goes straight into the file, not to the speakers.
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ac = new Ctor();
  const dest = ac.createMediaStreamDestination();
  ac.createMediaElementSource(audio).connect(dest);

  const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const pixels = width * height;
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: pixels >= 1920 * 1080 ? 14_000_000 : pixels >= 1280 * 720 ? 9_000_000 : 5_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  let raf = 0;
  const cleanup = () => {
    cancelAnimationFrame(raf);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    stream.getTracks().forEach((t) => t.stop());
    compositor.dispose();
    void ac.close().catch(() => {});
  };

  return new Promise<ExportResult>((resolve, reject) => {
    const fail = (err: Error) => {
      cleanup();
      reject(err);
    };
    recorder.onerror = () => fail(new Error('The export stopped. Keep this tab open and on screen while it renders.'));
    recorder.onstop = () => {
      cleanup();
      if (opts.signal?.aborted) return reject(new DOMException('Export cancelled', 'AbortError'));
      resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mime }), extension: mime.includes('mp4') ? 'mp4' : 'webm', width, height });
    };
    opts.signal?.addEventListener('abort', () => recorder.state !== 'inactive' && recorder.stop(), { once: true });

    const end = comp.durationSec;
    const draw = () => {
      const t = audio.currentTime;
      compositor.render(Math.min(t, end), true);
      opts.onProgress?.(Math.min(1, t / end));
      if (t >= end - 0.02 || audio.ended) {
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    // Draw the first frame before recording starts so the file doesn't open on black.
    compositor.render(0, false);
    const begin = () => {
      recorder.start(1000);
      void ac.resume();
      audio.play().then(() => (raf = requestAnimationFrame(draw)), () => fail(new Error('The export could not start playing the song.')));
    };
    // Give the first footage file a moment to decode its opening frame.
    const waitStart = performance.now();
    const wait = () => {
      compositor.render(0, false);
      if (compositor.ready(0) || performance.now() - waitStart > 4000) begin();
      else raf = requestAnimationFrame(wait);
    };
    wait();
  });
}
