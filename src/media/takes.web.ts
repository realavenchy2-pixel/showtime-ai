import type { Song } from '@/engine/types';

import { envelopes } from './analyze';
import { decodeMono, songOnsets } from './audio.web';
import { saveMedia } from './library';
import { grabStill, type RawRecording } from './recorder.web';
import { alignTake } from './sync';
import type { ImportedVideo, Recording } from './types';

// Turns raw footage into takes: saves the file, grabs a still, and lines it up with the song.

/** Files bigger than this are not decoded for sync on a phone; they would not fit in memory. */
const MAX_SYNC_BYTES = 350 * 1024 * 1024;

/**
 * Saves a take that was just recorded.
 * `clockSongStartSec` is where the song was when the first frame was written, by the recorder's clock.
 * When the mic heard the song, the take is lined up by ear instead, which also removes speaker lag.
 */
export async function saveRecording(raw: RawRecording, song: Song, clockSongStartSec: number, still: { thumb?: string; brightness?: number }): Promise<Recording> {
  const mediaId = await saveMedia(raw.blob, 'take');
  let songStartSec = clockSongStartSec;
  let lagMs = 0;
  let sync: Recording['sync'] = 'clock';
  if (raw.heard && raw.heard.pcm.length > raw.heard.sampleRate * 3) {
    try {
      const songEnv = await songOnsets(song);
      if (songEnv.length) {
        const heardEnv = envelopes(raw.heard.pcm, raw.heard.sampleRate).onset;
        const res = alignTake(songEnv, heardEnv, 100, { centerSec: clockSongStartSec, radiusSec: 0.8 });
        if (res.locked) {
          songStartSec = res.offsetSec;
          lagMs = Math.round((clockSongStartSec - res.offsetSec) * 1000);
          sync = 'audio';
        }
      }
    } catch {
      // Fall back to the clock.
    }
  }
  return { mediaId, durationSec: raw.durationSec, width: raw.width, height: raw.height, fps: raw.fps, songStartSec, lagMs, sync, ...still };
}

function once(el: HTMLMediaElement, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    el.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
    el.addEventListener('error', () => (clearTimeout(timer), reject(new Error('This file could not be read as a video.'))), { once: true });
  });
}

async function frameRate(file: Blob): Promise<number | undefined> {
  try {
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny');
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) return undefined;
      const stats = await track.computePacketStats(120);
      const fps = stats.averagePacketRate;
      return fps > 1 && fps < 240 ? Math.round(fps * 100) / 100 : undefined;
    } finally {
      input.dispose();
    }
  } catch {
    return undefined;
  }
}

/** Reads a video the artist picked from their camera roll and, when it has the song in it, finds where it starts. */
export async function importVideo(file: File, song?: Song): Promise<ImportedVideo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadedmetadata');
    let durationSec = video.duration;
    if (!Number.isFinite(durationSec)) {
      // Screen recordings and some WebM files only learn their length after a seek to the end.
      video.currentTime = 1e7;
      await once(video, 'seeked').catch(() => {});
      durationSec = video.duration;
    }
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('This video has no readable length.');
    video.currentTime = Math.min(1, durationSec / 2);
    await once(video, 'seeked').catch(() => {});
    const still = grabStill(video);
    const width = video.videoWidth;
    const height = video.videoHeight;

    const [fps, songStartSec] = await Promise.all([frameRate(file), song ? findInSong(file, song) : Promise.resolve(undefined)]);
    const mediaId = await saveMedia(file, songStartSec === undefined ? 'clip' : 'take');
    return {
      mediaId,
      name: file.name.replace(/\.[a-z0-9]+$/i, ''),
      durationSec: Math.round(durationSec * 1000) / 1000,
      width,
      height,
      fps: fps ?? 30,
      songStartSec,
      ...still,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function findInSong(file: Blob, song: Song): Promise<number | undefined> {
  if (file.size > MAX_SYNC_BYTES) return undefined;
  try {
    const [songEnv, heard] = await Promise.all([songOnsets(song), file.arrayBuffer().then(decodeMono)]);
    if (!songEnv.length) return undefined;
    const res = alignTake(songEnv, envelopes(heard.mono, heard.sampleRate).onset, 100);
    return res.locked ? res.offsetSec : undefined;
  } catch {
    // No audio track, or a codec the browser can't decode.
    return undefined;
  }
}
