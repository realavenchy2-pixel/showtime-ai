import type { Song } from '@/engine/types';

import { demoAudioUrl, mediaUrl } from './library';

// Phone build: songs play from their file. Mapping the beat from audio runs in the web app
// (and later on the studio server); here the artist taps the tempo in.

export async function songUrl(song: Song): Promise<string | undefined> {
  if (!song.audioId) return undefined;
  return song.source === 'demo' ? demoAudioUrl(song.audioId) : mediaUrl(song.audioId);
}

export async function songPeaks(song: Song): Promise<number[]> {
  return song.peaks ?? [];
}
