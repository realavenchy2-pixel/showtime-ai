import { useState } from 'react';

import { videoRange } from '@/engine/actions';
import type { Project, SectionKind } from '@/engine/types';

export interface TakePart {
  id: string;
  label: string;
  from: number;
  to: number;
  kind?: SectionKind;
}

/** What the artist can record: the whole video, or any one part of it. */
export function takeParts(p: Project): TakePart[] {
  const song = p.song;
  if (!song) return [];
  const range = videoRange(p);
  const all: TakePart = { id: 'all', label: p.range ? 'Whole snippet' : 'Full song', from: range.start, to: range.end };
  const parts = song.sections
    .filter((s) => s.end > range.start + 0.5 && s.start < range.end - 0.5)
    .map((s) => ({ id: s.id, label: s.label, from: Math.max(s.start, range.start), to: Math.min(s.end, range.end), kind: s.kind }));
  // One part covering the whole video is the same thing as the whole video.
  return parts.length > 1 ? [all, ...parts] : [all];
}

/** The stretch of song the next take covers: a part, or anywhere the artist taps on the song. */
export function useTakeRange(p: Project | undefined) {
  const [partId, setPartId] = useState('all');
  const [startAt, setStartAt] = useState<number | undefined>();
  const parts = p ? takeParts(p) : [];
  const part = parts.find((x) => x.id === partId) ?? parts[0];
  const range = p ? videoRange(p) : { start: 0, end: 0 };
  const custom = startAt !== undefined;
  const from = custom ? startAt : (part?.from ?? 0);
  const to = custom ? range.end : (part?.to ?? 0);
  return {
    parts,
    partId: custom ? 'custom' : (part?.id ?? 'all'),
    from,
    to,
    hookOnly: !custom && part?.kind === 'hook',
    pick: (id: string) => {
      setPartId(id);
      setStartAt(undefined);
    },
    /** Start the take at song time `t`, on the beat, running to the end of the video. */
    startFrom: (t: number) => {
      const song = p?.song;
      if (!song) return;
      const beat = 60 / song.bpm;
      const snapped = song.downbeatSec + Math.round((t - song.downbeatSec) / beat) * beat;
      const clamped = Math.max(range.start, Math.min(range.end - 2, snapped));
      setStartAt(Math.round(clamped * 1000) / 1000);
    },
  };
}
