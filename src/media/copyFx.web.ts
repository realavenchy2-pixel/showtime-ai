import type { CopiedFx, FxEffectId } from '@/engine/types';

/**
 * Watches a video the artist uploads and copies its effects: the color grade (warmth, tint,
 * contrast, saturation, crushed blacks), how fast it cuts, and its flashes and shakes.
 * Everything runs in the browser on small frames; the video never leaves the device.
 */
export async function copyFxFromVideo(): Promise<CopiedFx | null> {
  const file = await pickFile();
  if (!file) return null;
  const url = URL.createObjectURL(file);
  try {
    return await analyze(url, file.name.replace(/\.[^.]+$/, ''));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

async function analyze(url: string, name: string): Promise<CopiedFx> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('That video could not be read.'));
  });
  const duration = Math.min(video.duration || 0, 30);
  if (!duration) throw new Error('That video has no length.');
  const W = 64;
  const H = 36;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot read video frames.');

  const fps = 6;
  const frames = Math.max(8, Math.floor(duration * fps));
  let prev: Uint8ClampedArray | undefined;
  const diffs: number[] = [];
  const lumas: number[] = [];
  let r = 0, g = 0, b = 0, sat = 0, lumaSq = 0, n = 0;
  const darks: number[] = [];
  for (let i = 0; i < frames; i++) {
    await seek(video, (i / frames) * duration);
    ctx.drawImage(video, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    let fl = 0, diff = 0;
    const frameL: number[] = [];
    for (let k = 0; k < px.length; k += 4) {
      const R = px[k] / 255, G = px[k + 1] / 255, B = px[k + 2] / 255;
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      r += R; g += G; b += B; sat += mx > 0 ? (mx - mn) / mx : 0; lumaSq += L * L; n += 1;
      fl += L;
      frameL.push(L);
      if (prev) diff += Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]);
    }
    frameL.sort((x, y) => x - y);
    darks.push(frameL[Math.floor(frameL.length * 0.05)]);
    lumas.push(fl / (px.length / 4));
    if (prev) diffs.push(diff / (px.length * 0.75 * 255));
    prev = new Uint8ClampedArray(px);
  }
  const mR = r / n, mG = g / n, mB = b / n, mL = (mR * 0.299 + mG * 0.587 + mB * 0.114);
  const std = Math.sqrt(Math.max(0, lumaSq / n - mL * mL));
  const meanSat = sat / n;
  const sorted = diffs.slice().sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const cuts = diffs.filter((d) => d > Math.max(0.12, median * 3)).length;
  const cutsPerSec = cuts / duration;
  let flashes = 0;
  for (let i = 1; i < lumas.length - 1; i++) if (lumas[i] - lumas[i - 1] > 0.18 && lumas[i] - lumas[i + 1] > 0.12) flashes++;
  const jitter = median;
  const dark = darks.reduce((a, x) => a + x, 0) / Math.max(1, darks.length);

  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const effects: FxEffectId[] = ['punchIn'];
  if (cutsPerSec > 0.8) effects.push('stutter');
  if (cutsPerSec > 1.4) effects.push('glitch');
  if (flashes > 0) effects.push('flash');
  if (jitter > 0.06) effects.push('shake');
  if (meanSat > 0.45 && cutsPerSec > 1) effects.push('rgbSplit');
  if (meanSat < 0.12 && std > 0.2) effects.push('vhs');
  const bars = 8;
  const density = Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i / bars) * diffs.length);
    const to = Math.floor(((i + 1) / bars) * diffs.length);
    const hits = diffs.slice(from, to).filter((d) => d > Math.max(0.12, median * 3)).length;
    return clamp(1 + hits, 1, 4);
  });
  const bw = meanSat < 0.1;
  const feel = [
    bw ? 'Black and white' : mR - mB > 0.04 ? 'Warm grade' : mB - mR > 0.04 ? 'Cool grade' : 'Neutral grade',
    cutsPerSec > 1.4 ? 'fast cuts' : cutsPerSec > 0.6 ? 'steady cuts' : 'long takes',
    flashes ? 'flashes' : '',
    jitter > 0.06 ? 'camera shake' : '',
  ].filter(Boolean).join(', ');
  return {
    title: `Copied: ${name.slice(0, 24) || 'your video'}`,
    feel,
    effects,
    density,
    grade: {
      temp: clamp((mR - mB) * 3, -0.5, 0.5),
      tint: clamp(((mR + mB) / 2 - mG) * 3, -0.3, 0.3),
      contrast: clamp(0.3 + std * 1.4, 0.3, 0.85),
      saturation: bw ? 0 : clamp(meanSat * 1.3, 0.15, 0.8),
      crush: clamp(0.25 - dark * 1.5, 0, 0.4),
      grain: 0.12,
      vignette: 0.3,
    },
    letterbox: false,
    cutsPerSec: Math.round(cutsPerSec * 100) / 100,
  };
}
