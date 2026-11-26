import { videoRange } from '@/engine/actions';
import { cutawayWindows, performancePieces, type CutawayWindow } from '@/engine/broll';
import { cameraLook } from '@/engine/cameraLooks';
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
  /** Performance a finished SwitchX shot covers (the file itself, or its stand-in in demo mode). */
  switched?: boolean;
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
  /** Song time where the video starts: 0 for the full song, later for a snippet. */
  startSec: number;
  /** Song time where the video ends. */
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
  return format === '16:9' ? 16 / 9 : format === '9:16' ? 9 / 16 : format === '4:5' ? 4 / 5 : 1;
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

/**
 * Splits a stretch of one take over the switched shots that cover it. A stretch can span two shots
 * (the first pass and a fill-in for a dropped cutaway); parts no finished shot covers come back without one.
 */
function overShots(shots: Shot[], takeId: string, start: number, end: number): { start: number; end: number; shot?: Shot }[] {
  const mine = shots.filter((s) => s.takeId === takeId && (s.status === 'ready' || s.status === 'approved'));
  const out: { start: number; end: number; shot?: Shot }[] = [];
  let t = start;
  while (t < end - 0.01) {
    const here = mine.filter((s) => s.start <= t + 0.02 && s.end > t + 0.02).sort((a, b) => b.end - a.end)[0];
    if (here) {
      const to = Math.min(end, here.end);
      out.push({ start: t, end: to, shot: here });
      t = to;
    } else {
      const next = mine.filter((s) => s.start > t + 0.02).sort((a, b) => a.start - b.start)[0];
      const to = Math.min(end, next ? next.start : end);
      out.push({ start: t, end: to });
      t = to;
    }
  }
  return out;
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
    // The cutaways go in first (a stand-in until the clip is back); the performance fills the rest,
    // from the switched shot where one is back.
    const windows = cutawayWindows(p, 'planned');
    for (const seg of p.cut.segments) {
      const take = takes.get(seg.takeId);
      if (!take) {
        segments.push({ start: seg.start, end: seg.end, kind: 'gap' });
        continue;
      }
      const look = p.looks[seg.sectionId];
      for (const piece of performancePieces({ ...p, cut: { ...p.cut, segments: [seg] } }, windows)) {
        for (const part of overShots(p.shots, take.id, piece.start, piece.end)) {
          const shot = part.shot;
          if (shot?.renderUrl) {
            // The real switched shot: its file starts at the shot's own start, handles included.
            const id = `shot:${shot.id}`;
            if (!sources.has(id)) sources.set(id, { id, mediaId: shot.renderMediaId, url: shot.renderUrl, angle: take.angle });
            segments.push({ start: part.start, end: part.end, kind: 'take', switched: true, source: { id, mediaAt: part.start - shot.start } });
          } else {
            segments.push({
              start: part.start,
              end: part.end,
              kind: 'take',
              switched: !!shot || undefined,
              source: { id: takeSource(take).id, mediaAt: take.mediaOffsetSec + (part.start - take.start) },
              grade: shot && look && look.location !== 'custom' ? LOOK_GRADE[look.location] : undefined,
            });
          }
        }
      }
    }
    segments = withBroll(p, windows, segments, sources);
  } else if (p.takes.length) {
    // Before the cut exists: the latest take that covers each moment.
    const last = p.takes[p.takes.length - 1];
    segments = [{ start: last.start, end: last.end, kind: 'take', source: { id: takeSource(last).id, mediaAt: last.mediaOffsetSec } }];
  }

  const effects = opts.effects ?? p.final.builds > 0;
  const pack = effects ? fxPack(p.fx.pack, p.fx) : undefined;
  const range = videoRange(p);
  return {
    title: p.title,
    startSec: range.start,
    durationSec: range.end,
    bpm: song.bpm,
    downbeatSec: song.downbeatSec,
    aspect: aspectOf(opts.format ?? previewFormat(p)),
    segments,
    sources: [...sources.values()],
    cues: effects ? buildCues(song, p.fx) : [],
    // The camera look the artist picked, or the effects pack's grade on projects from before camera looks.
    grade: effects && p.cameraLook ? cameraLook(p.cameraLook).grade : (pack?.grade ?? NEUTRAL_GRADE),
    letterbox: !!pack?.letterbox && (opts.format ?? previewFormat(p)) === '16:9',
    lyrics: song.lyrics,
    kineticLyrics: effects && !!p.fx.effects.kineticLyrics && song.lyrics.length > 0,
  };
}

/** Puts the cutaways into the gaps the performance left for them, and over stretches no take reaches. */
function withBroll(p: Project, windows: CutawayWindow[], segments: CompSegment[], sources: Map<string, CompSource>): CompSegment[] {
  if (!windows.length) return segments;
  let out = segments;
  for (const w of windows) {
    const idea = p.broll.ideas.find((i) => i.id === w.ideaId);
    if (!idea) continue;
    const own = idea.clipId ? p.clips.find((c) => c.id === idea.clipId) : undefined;
    let source: CompSegment['source'];
    if (own?.mediaId || idea.mediaId || idea.url) {
      const id = `broll:${idea.id}`;
      sources.set(id, { id, mediaId: own?.mediaId ?? idea.mediaId, url: idea.url, angle: 'Wide' });
      source = { id, mediaAt: 0 };
    }
    // Performance never sits under a cutaway now, but gaps can: trim whatever overlaps.
    const next: CompSegment[] = [];
    for (const seg of out) {
      if (seg.end <= w.start || seg.start >= w.end) {
        next.push(seg);
        continue;
      }
      if (seg.start < w.start) next.push({ ...seg, end: w.start });
      if (seg.end > w.end) next.push({ ...seg, start: w.end, source: seg.source ? { ...seg.source, mediaAt: seg.source.mediaAt + (w.end - seg.start) } : undefined });
    }
    next.push({ start: w.start, end: w.end, kind: 'broll', source, caption: idea.shot });
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
