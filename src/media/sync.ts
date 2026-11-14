// Lines a take up with the song by ear: slides the take's sound along the song until the hits match.
// Works on onset envelopes (see analyze.ts), so room echo, voice and phone-mic tone don't matter much.

export interface SyncResult {
  /** Song time, in seconds, at the first sample of the take. Negative when the take started before the song. */
  offsetSec: number;
  /** How closely the take's hits follow the song's at that spot, 0 to 1. */
  match: number;
  /** How far the best spot stands above the rest of the song, in standard deviations. */
  confidence: number;
  /** True when the match is strong enough to trust over the recorder clock. */
  locked: boolean;
}

/** Thresholds for a lock: the hits have to line up, and the spot has to stand out. */
export const SYNC_MATCH = 0.3;
export const SYNC_LOCK = 3.5;

function centered(env: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= Math.max(1, env.length);
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) out[i] = env[i] - mean;
  return out;
}

/** In-place radix-2 FFT. `invert` gives the unscaled inverse. */
function fft(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? -2 : 2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** dot[lag] = sum of song[i + lag] * take[i], for every lag from -(take.length - 1) to song.length - 1. */
function crossCorrelate(song: Float32Array, take: Float32Array): { at: (lag: number) => number } {
  let n = 1;
  while (n < song.length + take.length) n <<= 1;
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  ar.set(song);
  br.set(take);
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const m = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = r;
    ai[i] = m;
  }
  fft(ar, ai, true);
  return { at: (lag: number) => ar[lag >= 0 ? lag : n + lag] / n };
}

function prefixSquares(x: Float32Array): Float64Array {
  const out = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) out[i + 1] = out[i] + x[i] * x[i];
  return out;
}

/**
 * Finds where in the song the take starts.
 * `around` narrows the search to a window (seconds) when the recorder already knows roughly where it began.
 */
export function alignTake(songEnv: Float32Array, takeEnv: Float32Array, rate: number, around?: { centerSec: number; radiusSec: number }): SyncResult {
  if (takeEnv.length < rate || songEnv.length < rate) return { offsetSec: around?.centerSec ?? 0, match: 0, confidence: 0, locked: false };
  const song = centered(songEnv);
  const take = centered(takeEnv);
  const S = song.length;
  const T = take.length;

  // At least a quarter of the take, and two seconds, must overlap the song.
  const minOverlap = Math.min(T, Math.max(rate * 2, Math.floor(T / 4)));
  let lo = -(T - minOverlap);
  let hi = S - minOverlap;
  if (around) {
    lo = Math.max(lo, Math.round((around.centerSec - around.radiusSec) * rate));
    hi = Math.min(hi, Math.round((around.centerSec + around.radiusSec) * rate));
  }
  if (hi < lo) return { offsetSec: around?.centerSec ?? 0, match: 0, confidence: 0, locked: false };

  const dots = crossCorrelate(song, take);
  const songSq = prefixSquares(song);
  const takeSq = prefixSquares(take);
  const score = (lag: number): number => {
    const from = Math.max(0, -lag);
    const to = Math.min(T, S - lag);
    if (to - from < minOverlap) return 0;
    const a = songSq[to + lag] - songSq[from + lag];
    const b = takeSq[to] - takeSq[from];
    if (a <= 0 || b <= 0) return 0;
    // Favor spots that use more of the take.
    return (dots.at(lag) / Math.sqrt(a * b)) * Math.sqrt((to - from) / T);
  };

  let best = { lag: lo, score: -Infinity };
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let lag = lo; lag <= hi; lag++) {
    const s = score(lag);
    sum += s;
    sumSq += s * s;
    count += 1;
    if (s > best.score) best = { lag, score: s };
  }

  // Sub-frame precision from the parabola through the peak and its neighbors.
  const left = score(best.lag - 1);
  const right = score(best.lag + 1);
  const denom = left - 2 * best.score + right;
  const shift = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (left - right)) / denom)) : 0;

  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sumSq / count - mean * mean)) || 1e-9;
  const confidence = (best.score - mean) / std;
  const match = Math.max(0, Math.min(1, best.score));
  return {
    offsetSec: Math.round(((best.lag + shift) / rate) * 1000) / 1000,
    match: Math.round(match * 100) / 100,
    confidence: Math.round(confidence * 10) / 10,
    // A narrow window has nothing to stand out from, so there the match alone decides.
    locked: match >= SYNC_MATCH && (around ? true : confidence >= SYNC_LOCK),
  };
}
