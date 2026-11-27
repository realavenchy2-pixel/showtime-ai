import type { Format } from '@/engine/types';

// The math behind the pro viewfinder, kept free of any screen so it can be tested:
// timecode, where the recorded frame sits on screen, what each post format will keep,
// the exposure histogram, the mic meter, the horizon and how much recording space is left.

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** "00:01:12:08": hours, minutes, seconds and frames, the way a cinema camera counts. */
export function timecode(sec: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.floor(sec * rate + 1e-6));
  const frames = totalFrames % rate;
  const whole = Math.floor(totalFrames / rate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}:${pad(frames)}`;
}

/**
 * Where a picture of `media` size lands inside `box`. `contain` shows the whole frame (what is
 * actually recorded); `cover` fills the box and crops the overflow.
 */
export function fitRect(box: Size, media: Size, mode: 'contain' | 'cover'): Rect {
  if (box.w <= 0 || box.h <= 0 || media.w <= 0 || media.h <= 0) return { x: 0, y: 0, w: box.w, h: box.h };
  const scale = mode === 'contain' ? Math.min(box.w / media.w, box.h / media.h) : Math.max(box.w / media.w, box.h / media.h);
  const w = media.w * scale;
  const h = media.h * scale;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

/** The centered part of a frame a format keeps when the edit fills it, as fractions of the frame. */
export function cropOf(frame: Size, aspect: number): Rect {
  const frameAspect = frame.w / Math.max(1, frame.h);
  if (Math.abs(frameAspect - aspect) < 0.01) return { x: 0, y: 0, w: 1, h: 1 };
  if (aspect < frameAspect) {
    const w = aspect / frameAspect;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }
  const h = frameAspect / aspect;
  return { x: 0, y: (1 - h) / 2, w: 1, h };
}

const FORMAT_ASPECT: Record<Format, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 };
const FORMAT_NAME: Record<Format, string> = { '16:9': 'YouTube 16:9', '9:16': 'Reels 9:16', '1:1': 'Square 1:1', '4:5': 'Feed 4:5' };

export interface FormatGuide {
  format: Format;
  label: string;
  /** In screen points, inside the recorded frame. */
  rect: Rect;
}

/**
 * A box for every format the video posts to that keeps less than the whole frame, so the artist
 * stays inside what YouTube or Reels will actually show. Formats that match the frame need no box.
 */
export function formatGuides(formats: Format[], frame: Size, onScreen: Rect): FormatGuide[] {
  const out: FormatGuide[] = [];
  for (const format of formats) {
    const c = cropOf(frame, FORMAT_ASPECT[format]);
    if (c.w > 0.995 && c.h > 0.995) continue;
    out.push({
      format,
      label: FORMAT_NAME[format],
      rect: { x: onScreen.x + c.x * onScreen.w, y: onScreen.y + c.y * onScreen.h, w: c.w * onScreen.w, h: c.h * onScreen.h },
    });
  }
  return out;
}

/** Brightness of every pixel, bucketed. `rgba` is canvas image data; the result is scaled so the tallest bar is 1. */
export function lumaHistogram(rgba: ArrayLike<number>, bins = 64): Float32Array {
  const counts = new Float32Array(bins);
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    counts[Math.min(bins - 1, Math.floor((y / 256) * bins))] += 1;
  }
  let max = 0;
  for (const c of counts) max = Math.max(max, c);
  if (max > 0) for (let i = 0; i < bins; i++) counts[i] /= max;
  return counts;
}

/** Share of pixels at or above `level` (0 to 1 of full white): how much of the picture is blown out. */
export function clippedShare(rgba: ArrayLike<number>, level = 0.98): number {
  let n = 0;
  let over = 0;
  const cut = level * 255;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    n += 1;
    if (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2] >= cut) over += 1;
  }
  return n ? over / n : 0;
}

/** Decibels relative to full scale for a linear amplitude (1 is 0 dBFS). Silence floors at -96. */
export function dbfs(amplitude: number): number {
  return amplitude <= 0.0000158 ? -96 : Math.max(-96, 20 * Math.log10(amplitude));
}

/** Where a level sits on a meter that reads -60 to 0 dBFS. */
export function meterFill(db: number): number {
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

/** Peak hold: jumps up at once, falls back at `dbPerSec`. */
export function holdPeak(held: number, now: number, dtSec: number, dbPerSec = 20): number {
  return now >= held ? now : Math.max(now, held - dbPerSec * dtSec);
}

/**
 * How far the phone is rolled off level, in degrees, from the browser's orientation reading.
 * Upright portrait uses gamma; held sideways, the roll is the tilt toward the screen (beta).
 */
export function rollDegrees(beta: number, gamma: number, screenAngle: number): number {
  const a = ((screenAngle % 360) + 360) % 360;
  if (a === 90) return -beta;
  if (a === 270) return beta;
  if (a === 180) return -gamma;
  return gamma;
}

/** Recording time left in `free` bytes at the take's bitrate, in whole minutes. */
export function minutesLeft(freeBytes: number, bitsPerSecond: number): number {
  if (freeBytes <= 0 || bitsPerSecond <= 0) return 0;
  return Math.floor(freeBytes / (bitsPerSecond / 8) / 60);
}

/** "2h 14m" or "38m". */
export function formatMinutes(min: number): string {
  if (min >= 600) return `${Math.floor(min / 60)}h`;
  if (min >= 60) return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
  return `${Math.max(0, min)}m`;
}

/** "1080p", "4K": the short side, the way cameras name it. */
export function resolutionName(width: number, height: number): string {
  const short = Math.min(width, height);
  if (short >= 2100) return '4K';
  if (short >= 1400) return '1440p';
  return `${short}p`;
}
