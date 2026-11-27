// What Beeble SwitchX 3.0 accepts and what it costs. Checked against docs.beeble.ai on 2026-11-13.
// The live server reports its own limits at runtime; these are the defaults the simulation uses.

export const SWITCHX = {
  model: 'switchx-3.0' as const,
  /** Most frames in one generation: 15 seconds at 24 fps, 12 seconds at 30 fps. */
  maxFrames: 360,
  maxFps: 60,
  /** Reference images per generation. */
  maxRefs: 4,
  resolutions: [720, 1080, 2160] as const,
  /** Generations that run at once on a self-serve key. */
  concurrency: 5,
  /** Beeble credits per started 30 frames. Finishing an explored shot costs the target tier again. */
  creditsPer30Frames: { 720: 6, 1080: 20, 2160: 80 } as Record<number, number>,
};

/** The public SwitchX API, used when a key does not have 3.0 yet. Checked against developer.beeble.ai. */
export const SWITCHX_PUBLIC = {
  model: 'switchx' as const,
  /** 10 seconds at 24 fps. */
  maxFrames: 240,
  maxRefs: 1,
  resolutions: [720, 1080] as const,
  /** US dollars per started 30 frames. */
  usdPer30Frames: { 720: 0.1, 1080: 0.3 } as Record<number, number>,
};

/** Extra source seconds kept on each side of a shot so the edit can slip a cut. */
export const HANDLE_SEC = 0.25;

/** Frame rate the recorder asks for. 24 gets the full 15 seconds per shot. */
export const RECORD_FPS = 24;

export function maxShotSec(fps: number, maxFrames: number = SWITCHX.maxFrames): number {
  return maxFrames / Math.max(1, fps);
}

export function framesFor(start: number, end: number, fps: number): number {
  return Math.max(1, Math.ceil((end - start) * fps - 1e-6));
}

export function switchCredits(frames: number, resolution: number): number {
  return Math.ceil(frames / 30) * (SWITCHX.creditsPer30Frames[resolution] ?? SWITCHX.creditsPer30Frames[720]);
}

/** Beeble credits per second of generated b-roll at 720p-class output. */
export const BROLL_CREDITS_PER_SEC = { magi: 3, omni: 3, h3: 2 } as const;

/** Beeble credits for one generated reference frame (GPT Image Sunburst, high quality, 1K). */
export const REFERENCE_CREDITS = 5;
