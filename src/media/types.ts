// Shapes shared by the web and native media code.

import type { Section } from '@/engine/types';

export type MediaKind = 'song' | 'take' | 'clip' | 'ref' | 'export';

/** What the recorder hands back when a take stops. */
export interface Recording {
  mediaId: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  thumb?: string;
  /** Song time at the first frame of the take. */
  songStartSec: number;
  /** How far the song as heard ran behind the song as played (speaker and Bluetooth lag). */
  lagMs: number;
  sync: 'clock' | 'audio';
  /** Average brightness of the frame, 0 to 1. */
  brightness?: number;
}

/** What comes back from picking a video file. */
export interface ImportedVideo {
  mediaId: string;
  name: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  thumb?: string;
  brightness?: number;
  /** Where in the song the clip starts, when its sound matched the song. */
  songStartSec?: number;
}

/** What comes back from picking a song file. */
export interface ImportedSong {
  audioId: string;
  title: string;
  durationSec: number;
  bpm: number;
  downbeatSec: number;
  /** 0 to 1. Low, or zero on the phone build, means the artist should tap the tempo in. */
  confidence: number;
  peaks: number[];
  /** A first guess at the song's layout, when the audio could be read. */
  sections?: Section[];
}
