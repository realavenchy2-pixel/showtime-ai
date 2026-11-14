import type { Song } from '@/engine/types';

import { analyzeTrack, envelopes, mixToMono, type Analysis } from './analyze';
import { demoAudioUrl, mediaBlob, mediaUrl, mediaUrlNow, saveMedia } from './library';
import type { ImportedSong } from './types';

// Browser audio: decoding files, mapping an imported song, and the one shared AudioContext.

/** Rate everything is analyzed at. Plenty for beats, and a quarter of the memory of 44.1 kHz stereo. */
const ANALYSIS_RATE = 22050;

let ctx: AudioContext | undefined;

/** The shared context. Browsers start it suspended; call from a tap so `resume` is allowed. */
export function audioContext(): AudioContext {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

export async function decodeMono(data: ArrayBuffer): Promise<{ mono: Float32Array; sampleRate: number }> {
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const off = new Offline(1, 1, ANALYSIS_RATE);
  const buffer = await off.decodeAudioData(data);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return { mono: mixToMono(channels), sampleRate: buffer.sampleRate };
}

function titleFromFile(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base || 'Untitled';
}

const onsetCache = new Map<string, Promise<Float32Array>>();
const analysisCache = new Map<string, Analysis>();

/** Reads a song file the artist picked: saves it, finds the tempo and bar grid. */
export async function importSong(file: File): Promise<ImportedSong & { analysis: Analysis }> {
  const data = await file.arrayBuffer();
  const { mono, sampleRate } = await decodeMono(data.slice(0));
  const analysis = analyzeTrack(mono, sampleRate);
  const audioId = await saveMedia(file, 'song');
  onsetCache.set(audioId, Promise.resolve(envelopes(mono, sampleRate).onset));
  analysisCache.set(audioId, analysis);
  return {
    audioId,
    title: titleFromFile(file.name),
    durationSec: analysis.durationSec,
    bpm: analysis.bpm,
    downbeatSec: analysis.downbeatSec,
    confidence: analysis.confidence,
    peaks: analysis.peaks,
    sections: analysis.sections,
    analysis,
  };
}

export async function songUrl(song: Song): Promise<string | undefined> {
  if (!song.audioId) return undefined;
  return song.source === 'demo' ? demoAudioUrl(song.audioId) : mediaUrl(song.audioId);
}

async function songData(song: Song): Promise<ArrayBuffer | undefined> {
  if (!song.audioId) return undefined;
  if (song.source === 'demo') {
    const url = demoAudioUrl(song.audioId);
    if (!url) return undefined;
    const res = await fetch(url);
    return res.ok ? res.arrayBuffer() : undefined;
  }
  return (await mediaBlob(song.audioId))?.arrayBuffer();
}

/** The song's hits over time, for lining takes up by ear. Decoded once per song. */
export function songOnsets(song: Song): Promise<Float32Array> {
  const key = song.audioId ?? song.id;
  let cached = onsetCache.get(key);
  if (!cached) {
    cached = songData(song).then(async (data) => {
      if (!data) return new Float32Array(0);
      const { mono, sampleRate } = await decodeMono(data);
      return envelopes(mono, sampleRate).onset;
    });
    cached.catch(() => onsetCache.delete(key));
    onsetCache.set(key, cached);
  }
  return cached;
}

/** Waveform peaks for a song that does not carry its own (the demo beats). */
export async function songPeaks(song: Song, count = 240): Promise<number[]> {
  if (song.peaks?.length) return song.peaks;
  const data = await songData(song);
  if (!data) return [];
  const { mono } = await decodeMono(data);
  const { peaks } = await import('./analyze');
  return peaks(mono, count);
}

/** A short click for the count-in, scheduled on the audio clock so it lands exactly on the beat. */
export function scheduleClick(atCtxTime: number, accent: boolean): void {
  const ac = audioContext();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = accent ? 1568 : 1046;
  gain.gain.setValueAtTime(0.0001, atCtxTime);
  gain.gain.exponentialRampToValueAtTime(0.5, atCtxTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, atCtxTime + 0.09);
  osc.connect(gain).connect(ac.destination);
  osc.start(atCtxTime);
  osc.stop(atCtxTime + 0.12);
}

const priming = new WeakMap<HTMLMediaElement, number>();

/**
 * Call from a tap. Phones only let a song start later on its own (after a count-in, during an export)
 * if the same player was first started inside a tap. This starts it silently and stops it again.
 */
export function primeElement(el: HTMLMediaElement): void {
  const id = (priming.get(el) ?? 0) + 1;
  priming.set(el, id);
  el.muted = true;
  const settle = (started: boolean) => {
    if (priming.get(el) !== id) return;
    if (started) el.pause();
    el.muted = false;
  };
  try {
    void el.play().then(
      () => settle(true),
      () => settle(false),
    );
  } catch {
    settle(false);
  }
}

/** Starts a player that was primed earlier, with sound. */
export function playPrimed(el: HTMLMediaElement): Promise<void> {
  priming.set(el, (priming.get(el) ?? 0) + 1);
  el.muted = false;
  return el.play();
}

/** The song's URL when it is already known, without waiting. Lets a tap handler prime a player right away. */
export function songUrlNow(song: Song): string | undefined {
  if (!song.audioId) return undefined;
  return song.source === 'demo' ? demoAudioUrl(song.audioId) : mediaUrlNow(song.audioId);
}
