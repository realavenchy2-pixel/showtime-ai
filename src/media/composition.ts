import { buildCues, fxPack, LOOK_GRADE, NEUTRAL_GRADE, type Grade } from '@/engine/fx';
import type { Format, FxCue, LyricLine, Project, Shot, Take, TakeAngle } from '@/engine/types';

// Turns a project into what the player draws: which footage is on screen at every moment of the song,
// what color it wears, and which effects hit when. The same description drives the preview and the export.

export interface CompSegment {
  start: number;
  end: number;
  /** Footage to draw. Missing for stretches of the song no take covers. */
  source?: {
    /** Key into `Composition.sources`. */
    id: string;
    /** Seconds into the file at song time `start`. */
    mediaAt: number;
  };
  /** Stand-in color for the look, until a real switched shot replaces the footage. */
  grade?: Grade;
  /** Shown over generated stand-ins: which cutaway this is. */
  caption?: string;
  kind: 'take' | 'broll' | 'gap';
}

export interface CompSource {
  id: string;
  /** The media file. Stand-ins (sample projects) have none and are drawn instead. */
  mediaId?: string;
  /** A remote file, e.g. a switched shot from the server. */
  url?: string;
  angle: TakeAngle;
}

export interface Composition {
  title: string;
  durationSec: number;
  bpm: number;
  downbeatSec: number;
  /** Width over height of the frame. */
  aspect: number;
  segments: CompSegment[];
  sources: CompSource[];
  cues: FxCue[];
  grade: Grade;
  letterbox: boolean;
  lyrics: LyricLine[];
  kineticLyrics: boolean;
}

export function aspectOf(format: Format): number {
  return format === '16:9' ? 16 / 9 : format === '9:16' ? 9 / 16 : 1;
}

/** The format the studio previews in: wide when the artist posts wide, otherwise the first one picked. */
export function previewFormat(p: Project): Format {
  return p.formats.includes('16:9') || p.formats.length === 0 ? '16:9' : p.formats[0];
}

export interface CompositionOptions {
  format?: Format;
  /** Draw effects and the pack's grade. Off for raw footage review. */
  effects?: boolean;
  /** Show only this take, start to finish. */
  soloTakeId?: string;
}

function shotFor(shots: Shot[], takeId: string, start: number, end: number): Shot | undefined {
  return shots.find((s) => s.takeId === takeId && s.start <= start + 0.02 && s.end >= end - 0.02);
}

export function buildComposition(p: Project, opts: CompositionOptions = {}): Composition | null {
  const song = p.song;
  if (!song) return null;
  const takes = new Map<string, Take>(p.takes.map((t) => [t.id, t]));
  const sources = new Map<string, CompSource>();
  const takeSource = (t: Take): CompSource => {
    const existing = sources.get(t.id);
    if (existing) return existing;
    const src: CompSource = { id: t.id, mediaId: t.mediaId, angle: t.angle };
    sources.set(t.id, src);
    return src;
  };

  let segments: CompSegment[] = [];
  const solo = opts.soloTakeId ? takes.get(opts.soloTakeId) : undefined;
  if (solo) {
    segments = [{ start: solo.start, end: solo.end, kind: 'take', source: { id: takeSource(solo).id, mediaAt: solo.mediaOffsetSec } }];
  } else if (p.cut.segments.length) {
    for (const seg of p.cut.segments) {
      const take = takes.get(seg.takeId);
      if (!take) {
        segments.push({ start: seg.start, end: seg.end, kind: 'gap' });
        continue;
      }
      const shot = shotFor(p.shots, take.id, seg.start, seg.end);
      const back = shot && (shot.status === 'ready' || shot.status === 'approved');
      const look = p.looks[seg.sectionId];
      if (back && shot.renderUrl) {
        // The real switched shot: its file starts at the shot's own start, handles included.
        const id = `shot:${shot.id}`;
        if (!sources.has(id)) sources.set(id, { id, mediaId: shot.renderMediaId, url: shot.renderUrl, angle: take.angle });
        segments.push({ start: seg.start, end: seg.end, kind: 'take', source: { id, mediaAt: seg.start - shot.start } });
      } else {
        segments.push({
          start: seg.start,
          end: seg.end,
          kind: 'take',
          source: { id: takeSource(take).id, mediaAt: take.mediaOffsetSec + (seg.start - take.start) },
          grade: back && look && look.location !== 'custom' ? LOOK_GRADE[look.location] : undefined,
        });
      }
    }
    segments = withBroll(p, segments, sources);
  } else if (p.takes.length) {
    // Before the cut exists: the latest take that covers each moment.
    const last = p.takes[p.takes.length - 1];
    segments = [{ start: last.start, end: last.end, kind: 'take', source: { id: takeSource(last).id, mediaAt: last.mediaOffsetSec } }];
  }

  const effects = opts.effects ?? p.final.builds > 0;
  const pack = effects ? fxPack(p.fx.pack) : undefined;
  return {
    title: p.title,
    durationSec: song.durationSec,
    bpm: song.bpm,
    downbeatSec: song.downbeatSec,
    aspect: aspectOf(opts.format ?? previewFormat(p)),
    segments,
    sources: [...sources.values()],
    cues: effects ? buildCues(song, p.fx) : [],
    grade: pack?.grade ?? NEUTRAL_GRADE,
    letterbox: !!pack?.letterbox && (opts.format ?? previewFormat(p)) === '16:9',
    lyrics: song.lyrics,
    kineticLyrics: effects && !!p.fx.effects.kineticLyrics && song.lyrics.length > 0,
  };
}

/** Lays approved cutaways over the performance. */
function withBroll(p: Project, segments: CompSegment[], sources: Map<string, CompSource>): CompSegment[] {
  const clips = p.broll.ideas.filter((i) => i.keep && (i.status === 'clip' || i.status === 'approved') && i.at !== undefined);
  if (!clips.length) return segments;
  let out = segments;
  for (const idea of clips) {
    const from = idea.at!;
    const to = Math.min(p.song!.durationSec, from + idea.durationSec);
    const own = idea.clipId ? p.clips.find((c) => c.id === idea.clipId) : undefined;
    let source: CompSegment['source'];
    if (own?.mediaId || idea.mediaId || idea.url) {
      const id = `broll:${idea.id}`;
      sources.set(id, { id, mediaId: own?.mediaId ?? idea.mediaId, url: idea.url, angle: 'Wide' });
      source = { id, mediaAt: 0 };
    }
    const next: CompSegment[] = [];
    for (const seg of out) {
      if (seg.end <= from || seg.start >= to) {
        next.push(seg);
        continue;
      }
      if (seg.start < from) next.push({ ...seg, end: from });
      if (seg.end > to) {
        next.push({ ...seg, start: to, source: seg.source ? { ...seg.source, mediaAt: seg.source.mediaAt + (to - seg.start) } : undefined });
      }
    }
    next.push({ start: from, end: to, kind: 'broll', source, caption: idea.shot });
    out = next.sort((a, b) => a.start - b.start);
  }
  return out;
}

/** The segment on screen at song time `t`. */
export function segmentAt(segments: CompSegment[], t: number): CompSegment | undefined {
  // Segments are sorted and few; a scan is fine at 60 frames a second.
  for (const s of segments) if (t >= s.start && t < s.end) return s;
  return undefined;
}

/** The next segment after `t` that draws from a different file, for warming up its decoder. */
export function nextSource(segments: CompSegment[], t: number, currentId?: string): CompSegment | undefined {
  for (const s of segments) if (s.start > t && s.source && s.source.id !== currentId) return s;
  return undefined;
}
