import { useState } from 'react';

import { rangeFor, videoRange } from '@/engine/actions';
import { scenesOf } from '@/engine/production';
import type { Project } from '@/engine/types';

/** Snaps a moment to the nearest beat, so a take starts where the music does. */
function onBeat(p: Project, t: number): number {
  const song = p.song!;
  const beat = 60 / song.bpm;
  return song.downbeatSec + Math.round((t - song.downbeatSec) / beat) * beat;
}

/**
 * Where the next take starts and stops. The artist picks the start right before recording:
 * tap the song, or listen and hit "Start here". The first take places the video in the song
 * (a snippet runs about 30 seconds from there); later takes stay inside it.
 */
export function useTakeRange(p: Project | undefined, sceneIndex?: number) {
  const [startAt, setStartAt] = useState<number | undefined>();
  const song = p?.song;
  const placing = !!p && !!song && !!p.length && p.takes.length === 0 && !p.partPicked;
  // Shooting one scene: the take covers that scene. Before the video is placed, scene 1 starts wherever the artist picks.
  const scene = p && sceneIndex !== undefined ? scenesOf(p)[sceneIndex] : undefined;
  const sceneLen = scene ? scene.section.end - scene.section.start : 0;
  const bounds = !p || !song ? { start: 0, end: 0 } : placing ? { start: 0, end: song.durationSec } : scene ? { start: scene.section.start, end: scene.section.end } : videoRange(p);
  const latest = Math.max(bounds.start, bounds.end - 2);
  const from = Math.round(Math.max(bounds.start, Math.min(latest, startAt ?? bounds.start)) * 1000) / 1000;
  const to =
    placing && scene && song
      ? Math.min(song.durationSec, from + sceneLen)
      : placing && p?.length && song
        ? (rangeFor(song, from, p.length)?.end ?? song.durationSec)
        : bounds.end;

  const startFrom = (t: number) => {
    if (!p?.song) return;
    const clamped = Math.max(bounds.start, Math.min(latest, onBeat(p, t)));
    setStartAt(Math.round(clamped * 1000) / 1000);
  };

  return {
    /** True until the first take: where it starts is where the video starts. */
    placing,
    /** The stretch of song the strip shows and the artist can start in. */
    bounds,
    from,
    to,
    /** The artist moved the start away from the top. */
    custom: startAt !== undefined && from > bounds.start + 0.05,
    /** Back to the top of the song, or of the video once it's placed. */
    fromTop: () => setStartAt(undefined),
    /** Start the take at song time `t`, on the beat. */
    startFrom,
    /** "Start here" while the song plays. A tap lands a moment after the spot the artist heard, so it backs off first. */
    startHere: (t: number) => startFrom(t - 0.25),
  };
}
