/// <reference types="node" />
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { analyzeTrack, envelopes, estimateDownbeat, estimateTempo, peaks, sectionsForTempo } from '../analyze';
import { alignTake } from '../sync';

const SR = 22050;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A drum loop with a known tempo. `layout` is [bars, loudness, kick on?] per section. */
function beat(bpm: number, layout: [number, number, boolean][], leadIn = 0, seed = 1): Float32Array {
  const rand = rng(seed);
  const beatSec = 60 / bpm;
  const bars = layout.reduce((s, [n]) => s + n, 0);
  const out = new Float32Array(Math.ceil((leadIn + bars * 4 * beatSec + 0.5) * SR));
  const hit = (at: number, gain: number, kind: 'kick' | 'snare' | 'hat') => {
    const start = Math.round(at * SR);
    const len = Math.round((kind === 'kick' ? 0.14 : kind === 'snare' ? 0.09 : 0.02) * SR);
    for (let i = 0; i < len && start + i < out.length; i++) {
      const t = i / SR;
      const env = Math.exp(-t / (kind === 'kick' ? 0.05 : kind === 'snare' ? 0.03 : 0.006));
      const v = kind === 'kick' ? Math.sin(2 * Math.PI * (55 + 80 * Math.exp(-t / 0.02)) * t) : rand() * 2 - 1;
      out[start + i] += v * env * gain;
    }
  };
  let bar = 0;
  for (const [n, loud, kick] of layout) {
    for (let b = 0; b < n; b++, bar++) {
      const t0 = leadIn + bar * 4 * beatSec;
      if (kick) {
        hit(t0, 0.9 * loud, 'kick');
        hit(t0 + 2.5 * beatSec, 0.7 * loud, 'kick');
        hit(t0 + 2 * beatSec, 0.6 * loud, 'snare');
      }
      for (let h = 0; h < 8; h++) hit(t0 + h * 0.5 * beatSec, 0.25 * loud, 'hat');
      // A melody that never plays the same bar twice, like a real song.
      for (let k = 0; k < 4; k++) {
        if (rand() < 0.35) continue;
        const at = t0 + (k + (rand() < 0.4 ? 0.5 : 0)) * beatSec;
        const freq = 220 * Math.pow(2, Math.floor(rand() * 12) / 12);
        const gain = (0.25 + 0.3 * rand()) * loud;
        const start = Math.round(at * SR);
        const len = Math.round(0.18 * SR);
        for (let i = 0; i < len && start + i < out.length; i++) out[start + i] += Math.sin((2 * Math.PI * freq * i) / SR) * Math.exp(-i / (0.06 * SR)) * gain;
      }
    }
  }
  return out;
}

const SONG: [number, number, boolean][] = [
  [4, 0.35, false],
  [8, 0.7, true],
  [8, 1, true],
  [8, 0.7, true],
  [8, 1, true],
  [4, 0.3, false],
];

describe('beat mapping', () => {
  it.each([142, 92, 128, 140])('finds %i BPM', (bpm) => {
    const env = envelopes(beat(bpm, SONG), SR);
    const found = estimateTempo(env.onset, env.rate);
    expect(Math.abs(found.bpm - bpm)).toBeLessThan(0.35);
    expect(found.confidence).toBeGreaterThan(0.25);
  });

  it('puts bar lines on the kick, even when the song starts late', () => {
    const leadIn = 0.37;
    const env = envelopes(beat(140, SONG, leadIn), SR);
    const bar = 240 / 140;
    const downbeat = estimateDownbeat(env, 140);
    const off = Math.abs(((downbeat - leadIn + bar / 2) % bar) - bar / 2);
    expect(off).toBeLessThan(0.05);
    expect(downbeat).toBeLessThan(bar);
  });

  it('guesses intro, verses, hooks and outro from how loud each part is', () => {
    const a = analyzeTrack(beat(142, SONG), SR);
    expect(a.sections.map((s) => s.kind)).toEqual(['intro', 'verse', 'hook', 'verse', 'hook', 'outro']);
    expect(a.sections.map((s) => s.label)).toEqual(['Intro', 'Verse 1', 'Hook', 'Verse 2', 'Hook', 'Outro']);
    expect(a.sections[0].start).toBe(0);
    expect(a.sections.at(-1)!.end).toBeCloseTo(a.durationSec, 2);
    for (let i = 1; i < a.sections.length; i++) expect(a.sections[i].start).toBeCloseTo(a.sections[i - 1].end, 3);
    const bar = 240 / 142;
    expect(a.sections[1].start).toBeCloseTo(4 * bar, 1);
    expect(a.sections[2].start).toBeCloseTo(12 * bar, 1);
  });

  it('falls back to a verse and hook layout for a tempo that was tapped in', () => {
    const s = sectionsForTempo(100, 0, 180);
    expect(s[0].kind).toBe('intro');
    expect(s.at(-1)!.kind).toBe('outro');
    expect(s.some((x) => x.kind === 'hook')).toBe(true);
    expect(s.at(-1)!.end).toBe(180);
  });

  it('draws peaks between 0 and 1', () => {
    const p = peaks(beat(120, SONG), 120);
    expect(p).toHaveLength(120);
    expect(Math.max(...p)).toBe(1);
    expect(Math.min(...p)).toBeGreaterThanOrEqual(0);
  });
});

describe('lining a take up with the song', () => {
  const song = beat(142, SONG, 0, 3);
  const songEnv = envelopes(song, SR).onset;

  /** What a phone mic hears: a slice of the song, quieter, with room noise and a voice-like wobble on top. */
  function heard(fromSec: number, seconds: number, noise = 0.08): Float32Array {
    const rand = rng(99);
    const from = Math.round(fromSec * SR);
    const out = new Float32Array(Math.round(seconds * SR));
    for (let i = 0; i < out.length; i++) {
      const s = from + i >= 0 && from + i < song.length ? song[from + i] : 0;
      out[i] = s * 0.5 + (rand() * 2 - 1) * noise + Math.sin(i / 37) * 0.05 * Math.sin(i / 9000);
    }
    return out;
  }

  it('finds where an uploaded take starts anywhere in the song', () => {
    for (const start of [0, 13.37, 41.9]) {
      const res = alignTake(songEnv, envelopes(heard(start, 18), SR).onset, 100);
      expect(Math.abs(res.offsetSec - start)).toBeLessThan(0.03);
      expect(res.locked).toBe(true);
    }
  });

  it('measures speaker lag on a recorded take', () => {
    // The recorder thinks the take starts at 10.0; a Bluetooth speaker played the song 180 ms late.
    const res = alignTake(songEnv, envelopes(heard(9.82, 12), SR).onset, 100, { centerSec: 10, radiusSec: 1 });
    expect(res.offsetSec).toBeCloseTo(9.82, 1);
    expect(Math.abs(res.offsetSec - 9.82)).toBeLessThan(0.03);
  });

  it('handles a take that started before the song did', () => {
    const res = alignTake(songEnv, envelopes(heard(-2.5, 15), SR).onset, 100);
    expect(Math.abs(res.offsetSec + 2.5)).toBeLessThan(0.03);
    expect(res.locked).toBe(true);
  });

  it('does not lock onto footage that has no song in it', () => {
    const rand = rng(5);
    const talk = new Float32Array(15 * SR);
    for (let i = 0; i < talk.length; i++) talk[i] = (rand() * 2 - 1) * 0.3 * (0.5 + 0.5 * Math.sin(i / 4000));
    const res = alignTake(songEnv, envelopes(talk, SR).onset, 100);
    expect(res.locked).toBe(false);
  });
});

// The shipped demo beats, when their WAVs are around (scripts/make-demo-beats.py <dir> writes them).
const WAV_DIR = process.env.SHOWTIME_WAV_DIR;
describe.skipIf(!WAV_DIR || !existsSync(WAV_DIR))('demo beats', () => {
  function readWav(path: string): { mono: Float32Array; sampleRate: number } {
    const buf = readFileSync(path);
    const sampleRate = buf.readUInt32LE(24);
    const channels = buf.readUInt16LE(22);
    let at = 12;
    while (buf.toString('ascii', at, at + 4) !== 'data') at += 8 + buf.readUInt32LE(at + 4);
    const bytes = buf.readUInt32LE(at + 4);
    const frames = Math.floor(bytes / 2 / channels);
    const mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += buf.readInt16LE(at + 8 + (i * channels + c) * 2);
      mono[i] = s / channels / 32768;
    }
    return { mono, sampleRate };
  }

  it.each([
    ['out-the-mud', 142],
    ['late-night', 92],
    ['windy-city', 140],
  ])('maps %s at %i BPM with the downbeat at zero', (id, bpm) => {
    const { mono, sampleRate } = readWav(join(WAV_DIR!, `${id}.wav`));
    const a = analyzeTrack(mono, sampleRate);
    expect(Math.abs(a.bpm - bpm)).toBeLessThan(0.3);
    const bar = 240 / bpm;
    expect(Math.min(a.downbeatSec, bar - a.downbeatSec)).toBeLessThan(0.06);
  });
});
