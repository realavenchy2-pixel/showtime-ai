import type { Section, SectionKind } from '@/engine/types';

// Finds the beat grid of a song from its raw audio: tempo, first downbeat, sections and waveform peaks.
// Pure math on Float32Arrays, so it runs the same in the browser, in tests and on a server.

/** Envelope frames per second. 10 ms is fine enough to land cuts on a beat. */
export const ENV_RATE = 100;

export interface Envelopes {
  /** Onset strength across the whole spectrum. */
  onset: Float32Array;
  /** Onset strength of the low end only: kicks and 808s. */
  low: Float32Array;
  /** Loudness per frame, linear. */
  level: Float32Array;
  rate: number;
}

export interface Analysis {
  bpm: number;
  /** Song time of the first bar line. */
  downbeatSec: number;
  durationSec: number;
  sections: Section[];
  peaks: number[];
  /** 0 to 1: how clearly the tempo stood out. Below 0.25 the artist should tap it in. */
  confidence: number;
}

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i];
  const k = 1 / channels.length;
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

/** Splits the signal into low, mid and high bands with one-pole filters and tracks how each one jumps. */
export function envelopes(mono: Float32Array, sampleRate: number, rate = ENV_RATE): Envelopes {
  const hop = sampleRate / rate;
  const frames = Math.floor(mono.length / hop);
  const eLow = new Float32Array(frames);
  const eMid = new Float32Array(frames);
  const eHigh = new Float32Array(frames);
  const level = new Float32Array(frames);
  const aLow = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  const aHigh = 1 - Math.exp((-2 * Math.PI * 2500) / sampleRate);
  let lp1 = 0;
  let lp2 = 0;
  for (let f = 0; f < frames; f++) {
    const from = Math.floor(f * hop);
    const to = Math.min(mono.length, Math.floor((f + 1) * hop));
    let sl = 0;
    let sm = 0;
    let sh = 0;
    let sa = 0;
    for (let i = from; i < to; i++) {
      const x = mono[i];
      lp1 += aLow * (x - lp1);
      lp2 += aHigh * (x - lp2);
      const high = x - lp2;
      const mid = lp2 - lp1;
      sl += lp1 * lp1;
      sm += mid * mid;
      sh += high * high;
      sa += x * x;
    }
    const n = Math.max(1, to - from);
    eLow[f] = sl / n;
    eMid[f] = sm / n;
    eHigh[f] = sh / n;
    level[f] = Math.sqrt(sa / n);
  }
  const flux = (e: Float32Array) => {
    const out = new Float32Array(frames);
    let prev = Math.log1p(e[0] * 1000);
    for (let f = 1; f < frames; f++) {
      const cur = Math.log1p(e[f] * 1000);
      out[f] = Math.max(0, cur - prev);
      prev = cur;
    }
    return out;
  };
  const low = flux(eLow);
  const mid = flux(eMid);
  const high = flux(eHigh);
  const onset = new Float32Array(frames);
  for (let f = 0; f < frames; f++) onset[f] = low[f] + mid[f] + high[f] * 0.6;
  return { onset, low, level, rate };
}

function sampleAt(env: Float32Array, pos: number): number {
  const i = Math.floor(pos);
  if (i < 0 || i + 1 >= env.length) return 0;
  const frac = pos - i;
  return env[i] * (1 - frac) + env[i + 1] * frac;
}

/** Sum of the envelope on a grid of the given period, for the best starting phase. */
function combScore(env: Float32Array, period: number): { score: number; phase: number } {
  let best = -1;
  let bestPhase = 0;
  for (let phase = 0; phase < period; phase += 1) {
    let sum = 0;
    for (let pos = phase; pos < env.length - 1; pos += period) sum += sampleAt(env, pos);
    if (sum > best) {
      best = sum;
      bestPhase = phase;
    }
  }
  return { score: best, phase: bestPhase };
}

/** Tempo in the range artists count in: half-time trap comes back as 140, not 70. */
export function estimateTempo(env: Float32Array, rate = ENV_RATE): { bpm: number; confidence: number } {
  const n = env.length;
  if (n < rate * 4) return { bpm: 120, confidence: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const limit = Math.min(n, rate * 100); // the first 100 seconds are plenty
  const x = new Float32Array(limit);
  for (let i = 0; i < limit; i++) x[i] = env[i] - mean;

  // Autocorrelation out to two bars of the slowest tempo.
  const minBpm = 60;
  const maxBpm = 200;
  const maxLag = Math.min(limit - rate, Math.ceil(((rate * 60) / minBpm) * 8) + 2);
  const ac = new Float32Array(maxLag + 2);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < limit; i++) sum += x[i] * x[i + lag];
    ac[lag] = sum / (limit - lag);
  }
  let energy = 0;
  for (let i = 0; i < limit; i++) energy += x[i] * x[i];
  energy = Math.max(1e-12, energy / limit);
  const at = (lag: number) => {
    const i = Math.floor(lag);
    if (i + 1 > maxLag) return 0;
    const f = lag - i;
    return (ac[i] * (1 - f) + ac[i + 1] * f) / energy;
  };

  // Loop-based music repeats every bar. Score each tempo by how well the song matches itself one and
  // two bars later (a wrong tempo's "bar" lands mid-pattern), then lean toward 85 to 165 BPM.
  let best = { bpm: 120, score: -Infinity, raw: 0 };
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const beat = (rate * 60) / bpm;
    const raw = at(beat * 4) + 0.8 * at(beat * 8) + 0.5 * at(beat * 2) + 0.5 * at(beat);
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.5, 2));
    const score = raw * prior;
    if (score > best.score) best = { bpm, score, raw };
  }

  // Refine the beat period to a fraction of a frame: over a whole song a 1% tempo error drifts by seconds.
  const coarse = (rate * 60) / best.bpm;
  let period = coarse;
  let bestComb = combScore(env, period).score;
  for (let p = coarse * 0.99; p <= coarse * 1.01; p += 0.005) {
    const s = combScore(env, p).score;
    if (s > bestComb) {
      bestComb = s;
      period = p;
    }
  }
  let bpm = (rate * 60) / period;
  // Released music is almost always on a whole (or half) BPM. Snap when it costs nothing.
  for (const snapped of [Math.round(bpm), Math.round(bpm * 2) / 2]) {
    if (Math.abs(snapped - bpm) < 0.3 && combScore(env, (rate * 60) / snapped).score >= bestComb * 0.985) {
      bpm = snapped;
      break;
    }
  }
  if (Math.abs(bpm - Math.round(bpm)) < 0.06) bpm = Math.round(bpm);
  const confidence = Math.max(0, Math.min(1, best.raw / 2.8));
  return { bpm: Math.round(bpm * 100) / 100, confidence: Math.round(confidence * 100) / 100 };
}

/** Where bar lines fall. Bars start where the low end hits hardest. */
export function estimateDownbeat(env: Envelopes, bpm: number): number {
  const beat = (env.rate * 60) / bpm;
  const { phase } = combScore(env.onset, beat);
  // Four candidates for "beat one". Score each by low-end hits on it, minus hits on beat three.
  let best = 0;
  let bestScore = -Infinity;
  for (let m = 0; m < 4; m++) {
    let score = 0;
    for (let pos = phase + m * beat; pos < env.low.length - 1; pos += beat * 4) {
      score += windowMax(env.low, pos, 3) - 0.5 * windowMax(env.low, pos + 2 * beat, 3);
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  const bar = beat * 4;
  let first = phase + best * beat;
  while (first - bar >= -0.5) first -= bar;
  return Math.max(0, Math.round((first / env.rate) * 1000) / 1000);
}

function windowMax(env: Float32Array, pos: number, radius: number): number {
  let m = 0;
  const from = Math.max(0, Math.round(pos) - radius);
  const to = Math.min(env.length - 1, Math.round(pos) + radius);
  for (let i = from; i <= to; i++) if (env[i] > m) m = env[i];
  return m;
}

/** Loudness of every bar, 0 to 1 against the loudest bar. */
export function barLevels(env: Envelopes, bpm: number, downbeatSec: number): number[] {
  const bar = (env.rate * 240) / bpm;
  const start = downbeatSec * env.rate;
  const out: number[] = [];
  for (let from = start; from + bar * 0.5 < env.level.length; from += bar) {
    let sum = 0;
    let n = 0;
    for (let i = Math.max(0, Math.floor(from)); i < Math.min(env.level.length, Math.floor(from + bar)); i++) {
      sum += env.level[i] * env.level[i];
      n += 1;
    }
    out.push(Math.sqrt(sum / Math.max(1, n)));
  }
  const max = Math.max(1e-9, ...out);
  return out.map((v) => v / max);
}

/**
 * A first guess at the song's sections from how loud each 4-bar block is: quiet edges are the intro
 * and outro, the loudest stretches are hooks, the rest are verses. The artist can relabel any of them.
 */
export function guessSections(levels: number[], bpm: number, downbeatSec: number, durationSec: number): Section[] {
  const bar = 240 / bpm;
  const bars = levels.length;
  if (bars < 8) {
    return [{ id: 'sec-1', kind: 'verse', label: 'Verse 1', start: 0, end: round(durationSec) }];
  }
  const blocks: number[] = [];
  for (let b = 0; b < bars; b += 4) {
    const slice = levels.slice(b, b + 4);
    blocks.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  const sorted = [...blocks].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const top = sorted[Math.floor(sorted.length * 0.85)];
  const quiet = median * 0.72;
  const spread = top - median;

  const kinds: SectionKind[] = blocks.map((v) => (v < quiet ? 'bridge' : spread > 0.06 && v >= median + spread * 0.55 ? 'hook' : 'verse'));
  // Quiet blocks at the edges are the intro and outro; quiet blocks in the middle stay bridges.
  for (let i = 0; i < kinds.length && kinds[i] === 'bridge'; i++) kinds[i] = 'intro';
  for (let i = kinds.length - 1; i >= 0 && kinds[i] === 'bridge'; i--) kinds[i] = 'outro';
  // With no loud/quiet contrast, fall back to the common layout: verse 16, hook 8.
  if (!kinds.includes('hook')) {
    let i = kinds.indexOf('verse');
    let run = 0;
    for (; i >= 0 && i < kinds.length; i++) {
      if (kinds[i] !== 'verse') continue;
      if (run >= 4 && run < 6) kinds[i] = 'hook';
      run = (run + 1) % 6;
    }
  }

  const sections: Section[] = [];
  let verse = 0;
  let from = 0;
  for (let i = 1; i <= kinds.length; i++) {
    if (i < kinds.length && kinds[i] === kinds[from]) continue;
    const kind = kinds[from];
    const start = sections.length === 0 ? 0 : downbeatSec + from * 4 * bar;
    const end = i === kinds.length ? durationSec : downbeatSec + i * 4 * bar;
    const label = kind === 'verse' ? `Verse ${++verse}` : kind === 'hook' ? 'Hook' : kind === 'intro' ? 'Intro' : kind === 'outro' ? 'Outro' : 'Bridge';
    sections.push({ id: `sec-${sections.length + 1}`, kind, label, start: round(start), end: round(end) });
    from = i;
  }
  // A sliver left after the last bar line (a fade-out tail) belongs to the section before it.
  const last = sections[sections.length - 1];
  if (sections.length > 1 && last.end - last.start < 2 * bar) {
    sections.pop();
    sections[sections.length - 1].end = last.end;
  }
  return sections;
}

/** Peak loudness in `count` slices, 0 to 1, for drawing the waveform. */
export function peaks(mono: Float32Array, count = 240): number[] {
  const out: number[] = [];
  const step = mono.length / count;
  let max = 1e-9;
  for (let i = 0; i < count; i++) {
    let m = 0;
    const from = Math.floor(i * step);
    const to = Math.min(mono.length, Math.floor((i + 1) * step));
    const stride = Math.max(1, Math.floor((to - from) / 400));
    for (let j = from; j < to; j += stride) {
      const v = Math.abs(mono[j]);
      if (v > m) m = v;
    }
    out.push(m);
    if (m > max) max = m;
  }
  return out.map((v) => Math.round((v / max) * 100) / 100);
}

export function analyzeTrack(mono: Float32Array, sampleRate: number): Analysis {
  const durationSec = mono.length / sampleRate;
  const env = envelopes(mono, sampleRate);
  const { bpm, confidence } = estimateTempo(env.onset, env.rate);
  const downbeatSec = estimateDownbeat(env, bpm);
  const sections = guessSections(barLevels(env, bpm, downbeatSec), bpm, downbeatSec, durationSec);
  return { bpm, downbeatSec, durationSec: round(durationSec), sections, peaks: peaks(mono), confidence };
}

/** Sections for a tempo the artist tapped in: the common rap layout on that bar grid. */
export function sectionsForTempo(bpm: number, downbeatSec: number, durationSec: number): Section[] {
  const bars = Math.max(1, Math.floor((durationSec - downbeatSec) / (240 / bpm)));
  const levels = Array.from({ length: bars }, (_, i) => (i < 4 || i >= bars - 4 ? 0.3 : 1));
  return guessSections(levels, bpm, downbeatSec, durationSec);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
