import { barSec, brollShots } from './samples';
import { framesFor, HANDLE_SEC } from './switchx';
import type { BrollIdea, Project, SavedRender, Shot } from './types';

// Organizing b-roll around the switch.
//
// The order is switch, then b-roll, then edit, but where every cutaway lands is decided before the
// switch: a second of performance that sits under a cutaway is never on screen, so it never goes to
// SwitchX. The organizer lays the kept cutaways on the cut:
//   1. Stretches no take reaches get covered first, so the video never goes black.
//   2. The artist's own clips and ideas come before the director's pitches.
//   3. The rest spread out over the video on cut points, never back to back, and b-roll stays
//      a minority of the runtime so the video is about the artist.
// If a planned cutaway is dropped or fails to render, the switch renders just that stretch of
// performance afterwards (see `missingShots` in actions.ts).

/** At most this share of the video is b-roll, gap covers included where possible. */
export const BROLL_SHARE = 0.25;
/** The video opens on the artist for this many bars before the first cutaway. */
const OPEN_BARS = 2;
/** Bars of performance between two cutaways. */
const SPACE_BARS = 2;
/** Bars of performance before the video ends. */
const TAIL_BARS = 1;
/** Longest cutaway the video models make in one go. */
export const CUTAWAY_MAX_SEC = 15;
/** Performance shorter than this between a cutaway and a cut is a flash, not a shot. */
const SLIVER_SEC = 1;

/** Ideas the organizer brings in on its own to cover a gap carry this id prefix. */
const MADE = 'cover';
let counter = 0;
const session = Date.now().toString(36);
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${session}${counter.toString(36)}`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function span(p: Project): { start: number; end: number } {
  const duration = p.song?.durationSec ?? 0;
  return p.range ?? { start: 0, end: duration };
}

/** How long a cutaway runs: whole bars, at least two and at least three seconds. */
export function cutawaySec(bpm: number): number {
  const bar = barSec(bpm);
  return round(Math.max(2, Math.ceil(3 / bar - 1e-6)) * bar);
}

export interface CutawayWindow {
  start: number;
  end: number;
  ideaId: string;
}

/**
 * Where cutaways cover the performance. `planned`: every kept cutaway with a place, used to decide
 * what goes to the switch. `shown`: only cutaways with a clip to show, used by the edit.
 */
export function cutawayWindows(p: Project, which: 'planned' | 'shown' = 'planned'): CutawayWindow[] {
  if (p.skipped.includes('broll')) return [];
  const r = span(p);
  return p.broll.ideas
    .filter((i) => i.keep && i.at !== undefined && (which === 'planned' || i.status === 'clip' || i.status === 'approved'))
    .map((i) => ({ start: round(Math.max(r.start, i.at!)), end: round(Math.min(r.end, i.at! + i.durationSec)), ideaId: i.id }))
    .filter((w) => w.end - w.start > 0.01)
    .sort((a, b) => a.start - b.start);
}

export interface PerformancePiece {
  start: number;
  end: number;
  takeId: string;
  sectionId: string;
}

/** The performance on screen: every cut segment with a take, minus the cutaways. */
export function performancePieces(p: Project, windows: CutawayWindow[]): PerformancePiece[] {
  const out: PerformancePiece[] = [];
  for (const seg of p.cut.segments) {
    if (!seg.takeId) continue;
    let parts: [number, number][] = [[seg.start, seg.end]];
    for (const w of windows) {
      parts = parts.flatMap(([s, e]): [number, number][] => {
        if (w.end <= s + 1e-6 || w.start >= e - 1e-6) return [[s, e]];
        const keep: [number, number][] = [];
        if (w.start - s > 0.01) keep.push([s, w.start]);
        if (e - w.end > 0.01) keep.push([w.end, e]);
        return keep;
      });
    }
    for (const [s, e] of parts) out.push({ start: round(s), end: round(e), takeId: seg.takeId, sectionId: seg.sectionId });
  }
  return out;
}

/** Stretches of the video no take covers, merged. */
export function uncovered(p: Project): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const seg of p.cut.segments) {
    if (seg.takeId) continue;
    const last = out[out.length - 1];
    if (last && seg.start - last.end < 0.05) last.end = seg.end;
    else out.push({ start: seg.start, end: seg.end });
  }
  return out;
}

/** Who goes first when there isn't room for every cutaway. Lower is sooner. */
function rank(i: BrollIdea, prefer?: string): number {
  if (i.id === prefer) return 0;
  if (i.clipId) return 1;
  if (i.mine || i.fromInbox) return 2;
  if (i.cover) return 3;
  return 4;
}

/**
 * Lays the kept cutaways on the video. Safe to call after any change to the cut, the range or the
 * ideas: the same project always comes out the same. `prefer` is an idea the artist just turned on
 * or added; it gets a place even if another one has to give up its spot.
 *
 * Before the switch starts everything can move. After that, placed cutaways stay put (the switch
 * already skipped their seconds) and only new ones are placed, in the room that's left.
 */
export function arrangeBroll(p: Project, prefer?: string): Project {
  const song = p.song;
  if (!song || p.broll.approved) return p;
  const r = span(p);
  const length = r.end - r.start;
  if (length <= 0) return p;
  const bar = barSec(song.bpm);
  const beat = bar / 4;
  const dur = cutawaySec(song.bpm);
  const frozen = p.shots.length > 0;
  const ideas = p.broll.ideas;
  const index = new Map(ideas.map((i, k) => [i.id, k]));
  const cuts = p.cut.segments.map((s) => s.start);
  const onCut = (t: number) => cuts.length === 0 || cuts.some((c) => Math.abs(c - t) < 0.05);
  // The video's own grid: scenes and the cut count bars from where the video starts.
  const beatUp = (t: number) => r.start + Math.ceil((t - r.start) / beat - 1e-6) * beat;
  const sectionAt = (t: number) => song.sections.find((s) => t >= s.start - 1e-6 && t < s.end - 1e-6)?.id;
  const lengthOf = (i: BrollIdea) => {
    const clip = i.clipId ? p.clips.find((c) => c.id === i.clipId) : undefined;
    return clip ? round(Math.max(beat, Math.min(dur, clip.durationSec))) : dur;
  };

  const windows: { start: number; end: number }[] = [];
  const placed = new Map<string, { at: number; durationSec: number }>();
  const created: BrollIdea[] = [];

  if (frozen) {
    for (const i of ideas) {
      if (i.keep && i.at !== undefined) {
        windows.push({ start: i.at, end: i.at + i.durationSec });
        placed.set(i.id, { at: i.at, durationSec: i.durationSec });
      }
    }
  }

  // Everything that wants a place, best first. An idea the artist turned off stays off.
  const wanting = ideas
    .filter((i) => (i.keep || i.bumped || i.id === prefer) && !placed.has(i.id) && (i.status === 'idea' || !frozen))
    .sort((a, b) => rank(a, prefer) - rank(b, prefer) || index.get(a.id)! - index.get(b.id)!);
  const used = new Set<string>();
  const covering = new Set<string>();

  // 1. Stretches no take reaches: covered no matter what, so the video never goes black.
  if (!frozen) {
    const spans: { start: number; end: number }[] = [];
    for (const gap of uncovered(p)) {
      // A gap starts on a cut, so the cover does too.
      const start = Math.max(r.start, gap.start);
      const end = Math.min(r.end, beatUp(Math.max(gap.end, start + dur)));
      const last = spans[spans.length - 1];
      // Two gaps close together share one cover rather than leaving a flash of performance between them.
      if (last && start < last.end + SPACE_BARS * bar) last.end = Math.max(last.end, end);
      else spans.push({ start, end });
    }
    let filler = 0;
    for (const sp of spans) {
      // A long stretch gets several cutaways of the usual length, not one long static clip.
      for (let s = sp.start; s < sp.end - 0.01; ) {
        let e = Math.min(sp.end, s + dur);
        if (sp.end - e < dur * 0.5 && sp.end - s <= CUTAWAY_MAX_SEC) e = sp.end;
        let idea = wanting.find((i) => !used.has(i.id));
        if (!idea) {
          // Nobody asked for one here, so the director brings its own, starting with shots not in the video yet.
          const shots = brollShots(p.vibe);
          const inUse = new Set([...ideas, ...created].map((i) => i.shot));
          const fresh = shots.filter((x) => !inUse.has(x));
          idea = {
            id: uid(MADE),
            lyric: 'Covers a stretch no take reaches',
            shot: fresh[0] ?? shots[filler % shots.length],
            durationSec: round(e - s),
            status: 'idea',
            keep: true,
            cover: true,
            model: ideas[0]?.model ?? 'omni',
          };
          filler += 1;
          created.push(idea);
        }
        used.add(idea.id);
        covering.add(idea.id);
        placed.set(idea.id, { at: round(s), durationSec: round(e - s) });
        windows.push({ start: s, end: e });
        s = e;
      }
    }
  }

  // 2. The rest, as many as fit: spread over the video, on cut points, with room to breathe.
  const taken = windows.reduce((sum, w) => sum + (w.end - w.start), 0);
  const budget = BROLL_SHARE * length - taken;
  const rest = wanting.filter((i) => !used.has(i.id));
  const count = Math.max(Math.floor(budget / dur + 1e-6), rest.length && rest[0].id === prefer ? 1 : 0);
  const chosen = rest
    .slice(0, Math.max(0, count))
    .sort((a, b) => index.get(a.id)! - index.get(b.id)!);
  const lo = r.start + OPEN_BARS * bar;
  chosen.forEach((idea, k) => {
    const d = lengthOf(idea);
    const hi = r.end - TAIL_BARS * bar - d;
    if (hi < lo - 1e-6) return;
    const target = Math.min(hi, Math.max(lo, r.start + (length * (k + 0.5)) / chosen.length - d / 2));
    const room = SPACE_BARS * bar - 0.01;
    // In songs marked by verse and hook, the hook stays on the artist.
    const hooks = song.sections.filter((s) => s.kind === 'hook');
    let best: { at: number; score: number } | undefined;
    // Cut points first; bar lines of the video when a shot is long enough to interrupt.
    const first = r.start + Math.ceil((lo - r.start) / bar - 1e-6) * bar;
    const spots: number[] = cuts.filter((c) => c >= lo - 0.01 && c <= hi + 0.01);
    for (let t = first; t <= hi + 1e-6; t += bar) if (!spots.some((c) => Math.abs(c - t) < 0.05)) spots.push(t);
    for (const t of spots) {
      if (windows.some((w) => t < w.end + room && t + d > w.start - room)) continue;
      if (hooks.some((h) => t < h.end - 0.01 && t + d > h.start + 0.01)) continue;
      const score = Math.abs(t - target) + (onCut(t) ? 0 : bar * 0.5);
      if (!best || score < best.score || (score === best.score && t < best.at)) best = { at: t, score };
    }
    if (!best) return;
    let end = best.at + d;
    // Don't leave a flash of performance between the cutaway and the next cut.
    const next = cuts.find((c) => c > end + 0.01);
    if (next !== undefined && next - end < SLIVER_SEC && next - best.at <= CUTAWAY_MAX_SEC && !windows.some((w) => w.start < next && w.start >= end)) end = next;
    windows.push({ start: best.at, end });
    placed.set(idea.id, { at: round(best.at), durationSec: round(end - best.at) });
    used.add(idea.id);
  });

  const all = [...ideas, ...created];
  const out: BrollIdea[] = [];
  for (const i of all) {
    const spot = placed.get(i.id);
    if (spot) {
      out.push({ ...i, at: spot.at, durationSec: spot.durationSec, sectionId: sectionAt(spot.at), keep: true, bumped: undefined, cover: frozen ? i.cover : covering.has(i.id) || undefined });
    } else if (i.id.startsWith(`${MADE}-`) && !frozen) {
      // One the director brought in for a gap that's gone now.
      continue;
    } else if (frozen && i.status !== 'idea') {
      out.push(i);
    } else if (i.keep || i.bumped || i.id === prefer) {
      out.push({ ...i, at: undefined, sectionId: undefined, keep: false, bumped: true, cover: undefined });
    } else {
      out.push({ ...i, at: undefined, sectionId: undefined, cover: undefined });
    }
  }
  const same = out.length === ideas.length && out.every((i, k) => JSON.stringify(i) === JSON.stringify(ideas[k]));
  return same ? p : { ...p, broll: { ...p.broll, ideas: out } };
}

/** The prompt for a generated cutaway: the shot, in the same world as the scene it cuts away from. */
export function brollPrompt(p: Project, idea: BrollIdea): string {
  const look = idea.sectionId ? p.looks[idea.sectionId] : undefined;
  const world = look?.prompt?.trim().split(/(?<=[.!?])\s+/)[0];
  if (!world || idea.clipId) return idea.shot;
  return `${idea.shot.replace(/[.\s]+$/, '')}. Light and color to match the scene it cuts away from: ${world}`;
}

// ---------- What goes to the switch ----------

/** Neighboring pieces from the same take in the same scene go up as one shot, with handles. */
function shotsFrom(p: Project, pieces: PerformancePiece[], maxFrames: number, firstN: number, fill: boolean): Shot[] {
  const takes = new Map(p.takes.map((t) => [t.id, t]));
  const runs: PerformancePiece[] = [];
  for (const piece of pieces) {
    const take = takes.get(piece.takeId);
    if (!take) continue;
    const limit = maxFrames / take.fps - 2 * HANDLE_SEC;
    const last = runs[runs.length - 1];
    if (last && last.takeId === piece.takeId && last.sectionId === piece.sectionId && Math.abs(last.end - piece.start) < 0.01 && piece.end - last.start <= limit) {
      last.end = piece.end;
    } else {
      runs.push({ ...piece });
    }
  }
  return runs.map((run, i) => {
    const take = takes.get(run.takeId)!;
    const start = Math.max(take.start, run.start - HANDLE_SEC);
    let end = Math.min(take.end, run.end + HANDLE_SEC);
    let frames = framesFor(start, end, take.fps);
    if (frames > maxFrames) {
      frames = maxFrames;
      end = start + frames / take.fps;
    }
    const n = firstN + i;
    const sample = p.isSample || take.source === 'sample';
    return {
      id: uid('shot'),
      n,
      sectionId: run.sectionId,
      takeId: run.takeId,
      start: round(start),
      end: round(end),
      frames,
      fps: take.fps,
      status: 'queued' as const,
      progress: 0,
      workMs: 900 + ((i * 337) % 700),
      pendingFlag: !sample || fill ? undefined : i === 3 ? 'Hand blur on the mic, check the edge' : i === 11 ? 'Flicker in the hair outline' : undefined,
      fill: fill || undefined,
    };
  });
}

/**
 * The switch jobs for the cut: only performance that will be on screen. Seconds under a planned
 * cutaway are skipped, which is where most of the savings come from.
 */
export function buildShots(p: Project, maxFrames: number = p.switchSettings.maxFrames): Shot[] {
  const pieces = performancePieces(p, cutawayWindows(p, 'planned'));
  const reused = reusedShots(p, pieces, []);
  const fresh = shotsFrom(p, notCovered(pieces, reused), maxFrames, 1, false);
  return numbered([...reused, ...fresh]);
}

/**
 * Performance the edit needs that no shot covers: a planned cutaway was dropped, didn't render,
 * or b-roll was skipped. These go through the switch after the b-roll so the video has no holes.
 * A render kept from an earlier version fills the spot for free when it still fits.
 */
export function missingShots(p: Project): Shot[] {
  const need = notCovered(performancePieces(p, cutawayWindows(p, 'shown')), p.shots);
  const reused = reusedShots(p, need, p.shots);
  const fresh = shotsFrom(p, notCovered(need, reused), p.switchSettings.maxFrames, 1, true);
  const n = p.shots.length;
  return [...reused, ...fresh].sort((a, b) => a.start - b.start).map((s, i) => ({ ...s, n: n + i + 1 }));
}

// ---------- Renders kept across touch-ups ----------

/**
 * What a switch render depends on besides the footage: the scene's look (place, prompt, references)
 * and the switch settings. Two renders with the same take, time and key come out the same.
 */
export function lookKey(p: Project, sectionId: string): string {
  const look = p.looks[sectionId];
  if (!look) return '';
  const s = p.switchSettings;
  return JSON.stringify([look.location, look.prompt.trim(), look.refs.map((r) => r.id), s.model, s.alphaMode, s.resolution]);
}

/** Finished shots worth keeping when the switch reopens: approved, with their look. */
export function saveRenders(p: Project): SavedRender[] {
  const kept = [...(p.renders ?? [])];
  const madeFor = p.versions?.length ? p.versions[p.versions.length - 1].n : undefined;
  const same = (a: Shot, b: Shot, key: string, bKey: string) => a.takeId === b.takeId && Math.abs(a.start - b.start) < 0.01 && Math.abs(a.end - b.end) < 0.01 && key === bKey;
  for (const shot of p.shots) {
    if (shot.status !== 'approved') continue;
    const key = lookKey(p, shot.sectionId);
    if (!key || kept.some((r) => same(r, shot, r.lookKey, key))) continue;
    const { reused: _reused, fill: _fill, pendingFlag: _pending, ...rest } = shot;
    kept.push({ ...rest, status: 'approved', progress: 1, flag: undefined, lookKey: key, madeFor });
  }
  return kept.slice(-400);
}

/** Kept renders that cover part of what's needed now, for the same take, scene and look. */
function reusedShots(p: Project, need: PerformancePiece[], have: Shot[]): Shot[] {
  const out: Shot[] = [];
  for (const r of p.renders ?? []) {
    if (r.lookKey !== lookKey(p, r.sectionId)) continue;
    if (!need.some((x) => x.takeId === r.takeId && x.sectionId === r.sectionId && x.start < r.end - 0.05 && x.end > r.start + 0.05)) continue;
    if ([...have, ...out].some((s) => s.takeId === r.takeId && Math.abs(s.start - r.start) < 0.01 && Math.abs(s.end - r.end) < 0.01)) continue;
    const { lookKey: _key, madeFor: _made, ...shot } = r;
    out.push({ ...shot, id: uid('shot'), status: 'approved', progress: 1, reused: true, flag: undefined, pendingFlag: undefined, fill: undefined, workMs: 0 });
  }
  return out;
}

/** What's left of `pieces` once `shots` cover what they can, per take. */
function notCovered(pieces: PerformancePiece[], shots: Shot[]): PerformancePiece[] {
  const out: PerformancePiece[] = [];
  for (const piece of pieces) {
    let parts: [number, number][] = [[piece.start, piece.end]];
    for (const shot of shots) {
      if (shot.takeId !== piece.takeId) continue;
      parts = parts.flatMap(([a, b]): [number, number][] => {
        if (shot.end <= a + 1e-6 || shot.start >= b - 1e-6) return [[a, b]];
        const keep: [number, number][] = [];
        if (shot.start - a > 0.05) keep.push([a, shot.start]);
        if (b - shot.end > 0.05) keep.push([shot.end, b]);
        return keep;
      });
    }
    for (const [a, b] of parts) out.push({ ...piece, start: round(a), end: round(b) });
  }
  return out;
}

/** Shots in the order they play, numbered from 1. */
function numbered(shots: Shot[]): Shot[] {
  return shots.slice().sort((a, b) => a.start - b.start).map((s, i) => ({ ...s, n: i + 1 }));
}

/** Seconds of performance that never go to the switch because a cutaway covers them. */
export function skippedSeconds(p: Project): number {
  const all = performancePieces(p, []).reduce((sum, x) => sum + (x.end - x.start), 0);
  const shown = performancePieces(p, cutawayWindows(p, 'planned')).reduce((sum, x) => sum + (x.end - x.start), 0);
  return round(Math.max(0, all - shown));
}
