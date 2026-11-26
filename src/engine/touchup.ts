import { addDirectorMessage, revisit, videoRange } from './actions';
import { arrangeBroll } from './broll';
import { formatTime } from './director';
import { guideFor, makeLocations, reviseLocation, sceneName, scenesOf, unlockLocation, unlockScene } from './production';
import { pitchBroll, scenesFor, suggestedLooks } from './samples';
import { isStageDone } from './stages';
import type { BrollIdea, Project, Section } from './types';
import { latestVersion } from './versions';

// Touch-ups: the video is never finished for good. At any point after the first export the artist
// can come back and change one thing: the edit, the b-roll, a scene's background, a scene's takes,
// or how much of the song the video covers. Each touch-up reopens only the stage it needs, and
// everything already paid for is kept: switch renders that still fit are reused, b-roll clips stay
// made. The next export becomes the next version.

/** A touch-up opens something that already ran once. */
export function canTouchUp(p: Project): boolean {
  return !p.job && !!p.song && p.planApproved && p.takes.length > 0;
}

/** Scene numbers start at 1 for the artist. */
function sceneLabel(p: Project, index: number): string {
  const scene = scenesOf(p)[index];
  return scene ? sceneName(scene) : `Scene ${index + 1}`;
}

/** Effects, cut timing and the camera look. Nothing gets switched again. */
export function touchUpEdit(p: Project): Project {
  if (!canTouchUp(p) || !isStageDone(p, 'edit')) return p;
  const builds = Math.max(1, p.final.builds);
  const next = revisit(p, 'edit', { quiet: true });
  return addDirectorMessage({ ...next, final: { builds, locked: false } }, 'The edit is open. Change the effects or the look, then lock it. Nothing gets switched again.', { stage: 'edit' });
}

/** Keep the cutaways you like, drop the rest, describe new ones. Only new clips get made. */
export function touchUpBroll(p: Project): Project {
  if (!canTouchUp(p) || !(isStageDone(p, 'broll') || p.skipped.includes('broll'))) return p;
  const next = revisit(p, 'broll', { quiet: true });
  return addDirectorMessage(next, "B-roll is open. Keep what you like, turn off what you don't, or describe new ones. Only the new ones get made.", { stage: 'broll' });
}

/** A clip that came back wrong gets made again from the same idea. */
export function remakeBroll(p: Project, ideaId: string): Project {
  if (p.broll.approved || p.job) return p;
  const idea = p.broll.ideas.find((i) => i.id === ideaId);
  if (!idea || idea.status !== 'clip' || idea.clipId) return p;
  const ideas = p.broll.ideas.map((i) => (i.id === ideaId ? { ...i, status: 'idea' as const, keep: true, remoteId: undefined, url: undefined, mediaId: undefined } : i));
  return { ...p, broll: { ...p.broll, ideas } };
}

/**
 * Opens one scene's background again: pick another option, type a change, or use your own image.
 * Only that scene goes through the switch again; every other shot is reused.
 */
export function newBackground(p: Project, sceneIndex: number, note?: string): Project {
  if (!canTouchUp(p) || !isStageDone(p, 'switch') || !scenesOf(p)[sceneIndex]) return p;
  let next = unlockLocation(revisit(p, 'switch', { quiet: true }), sceneIndex);
  const id = scenesOf(next)[sceneIndex].section.id;
  next = { ...next, looks: { ...next.looks, [id]: { ...next.looks[id], reopened: true } } };
  if (note?.trim()) next = reviseLocation(next, sceneIndex, note);
  const name = sceneLabel(next, sceneIndex);
  return addDirectorMessage(next, `${name} is open. Pick a new background or type a change, then lock it. Only this scene gets switched again.`, { stage: 'switch' });
}

/** Back to the camera for one scene. The editor picks the best take, old or new. */
export function reshootScene(p: Project, sceneIndex: number): Project {
  if (!canTouchUp(p) || !isStageDone(p, 'shoot') || !scenesOf(p)[sceneIndex]) return p;
  const next = unlockScene(revisit(p, 'shoot', { quiet: true }), sceneIndex);
  const name = sceneLabel(next, sceneIndex);
  return addDirectorMessage(next, `${name} is open. Shoot it again with the same guide. My editor picks the best take, old or new, and every other scene stays as it is.`, { stage: 'shoot' });
}

/** A sliver of song shorter than this joins the scene next to it instead of being its own scene. */
const MIN_NEW_SCENE_SEC = 8;

/**
 * Turns a snippet into the full song (or a bigger part of it). Scenes already shot keep their takes,
 * backgrounds and renders; the new stretches get scenes of their own, with backgrounds to lock and
 * set guides, and the shoot opens on the first new one.
 */
export function makeFullSong(p: Project, target?: { start: number; end: number }, now = Date.now()): Project {
  const song = p.song;
  if (!song || !p.planApproved || p.job) return p;
  const old = videoRange(p);
  const want = target ?? { start: 0, end: song.durationSec };
  const range = { start: Math.max(0, Math.min(want.start, old.start)), end: Math.min(song.durationSec, Math.max(want.end, old.end)) };
  if (range.start > old.start - 0.05 && range.end < old.end + 0.05) return p;

  // Everything paid for is kept: going back to the shoot banks the switch renders under today's looks.
  let next = isStageDone(p, 'shoot') ? revisit(p, 'shoot', { quiet: true }) : p;
  const oldScenes = scenesOf(p);

  const scened = song.sections.some((s) => s.scene);
  let sections = song.sections;
  const added: Section[] = [];
  if (scened) {
    const shot = song.sections.filter((s) => s.scene).map((s) => ({ ...s }));
    let head = range.start < old.start - 0.05 ? scenesFor(song, { start: range.start, end: old.start }).filter((s) => s.scene) : [];
    let tail = range.end > old.end + 0.05 ? scenesFor(song, { start: old.end, end: range.end }).filter((s) => s.scene) : [];
    if (head.length && old.start - range.start < MIN_NEW_SCENE_SEC && shot.length) {
      shot[0].start = range.start;
      head = [];
    }
    if (tail.length && range.end - old.end < MIN_NEW_SCENE_SEC && shot.length) {
      shot[shot.length - 1].end = range.end;
      tail = [];
    }
    let top = Math.max(0, ...song.sections.map((s) => Number(/^scene-(\d+)$/.exec(s.id)?.[1] ?? 0)));
    const fresh = [...head, ...tail].map((s) => ({ ...s, id: `scene-${++top}` }));
    added.push(...fresh);
    const inside = [...shot, ...fresh].sort((a, b) => a.start - b.start).map((s, i) => ({ ...s, label: `Scene ${i + 1}` }));
    sections = [
      ...(range.start > 0.05 ? [{ id: 'before', kind: 'intro' as const, label: 'Before', start: 0, end: range.start }] : []),
      ...inside,
      ...(range.end < song.durationSec - 0.05 ? [{ id: 'after', kind: 'outro' as const, label: 'After', start: range.end, end: song.durationSec }] : []),
    ];
  }

  // New scenes get the director's picks until the artist changes them; shot scenes keep theirs.
  const suggested = suggestedLooks(sections);
  const looks = { ...next.looks };
  for (const s of sections) if (!looks[s.id]) looks[s.id] = suggested[s.id];

  const whole = range.start < 0.05 && range.end > song.durationSec - 0.05;
  next = { ...next, song: { ...song, sections }, looks, range: whole ? undefined : range, length: 'full', partPicked: true };

  // Scene numbers moved: takes, locks, guides and library items follow their scene, not its number.
  const newScenes = scenesOf(next);
  const indexOf = new Map(newScenes.map((s) => [s.section.id, s.index]));
  const moved = (old?: number) => (old === undefined ? undefined : (indexOf.get(oldScenes[old]?.section.id ?? '') ?? old));
  const locks: Record<number, boolean> = {};
  for (const [k, v] of Object.entries(next.sceneLocks ?? {})) {
    const to = moved(Number(k));
    if (v && to !== undefined) locks[to] = true;
  }
  next = {
    ...next,
    takes: next.takes.map((t) => (t.scene === undefined ? t : { ...t, scene: moved(t.scene) })),
    sceneLocks: locks,
    guides: newScenes.map((scene) => {
      const was = oldScenes.findIndex((o) => o.section.id === scene.section.id);
      const guide = was >= 0 ? p.guides?.[was] : undefined;
      return guide ? { ...guide, scene: scene.index } : guideFor(scene);
    }),
    library: next.library?.map((item) => (item.scene === undefined ? item : { ...item, scene: moved(item.scene) })),
  };
  next = makeLocations(next, now);

  // Songs laid out by verse and hook already had every part; the new ones just come into the video.
  const oldIds = new Set(oldScenes.map((o) => o.section.id));
  if (!scened) added.push(...newScenes.filter((s) => !oldIds.has(s.section.id)).map((s) => s.section));

  // A couple of cutaways for the new stretches; the organizer places them once the cut is in.
  if (added.length) {
    const taken = new Set(next.broll.ideas.map((i) => i.shot));
    const pitched: BrollIdea[] = pitchBroll({ ...song, sections: added }, next.vibe, next.broll.ideas[0]?.model ?? 'omni')
      .filter((i) => !taken.has(i.shot))
      .map((i, k) => ({ ...i, id: `broll-full-${now.toString(36)}-${k}` }));
    next = arrangeBroll({ ...next, broll: { ...next.broll, ideas: [...next.broll.ideas, ...pitched] } });
  }

  const kept = oldScenes.length;
  const count = added.length;
  const what = count
    ? `${count} new ${count === 1 ? 'scene' : 'scenes'}: lock ${count === 1 ? 'its background' : 'their backgrounds'}, then shoot ${count === 1 ? 'it' : 'them one at a time'}.`
    : 'The new seconds join the scenes next to them.';
  return addDirectorMessage(next, `Full song it is, ${formatTime(range.end - range.start)}. Your ${kept} ${kept === 1 ? 'scene stays' : 'scenes stay'} as you shot ${kept === 1 ? 'it' : 'them'}. ${what}`, { stage: 'shoot' });
}

/** What the touch-up menu offers right now. */
export interface TouchUpOptions {
  edit: boolean;
  broll: boolean;
  background: boolean;
  reshoot: boolean;
  full: boolean;
  /** The version the next export will be. */
  nextVersion: number;
}

export function touchUpOptions(p: Project): TouchUpOptions {
  const ok = canTouchUp(p);
  const song = p.song;
  const r = videoRange(p);
  return {
    edit: ok && isStageDone(p, 'edit'),
    broll: ok && (isStageDone(p, 'broll') || p.skipped.includes('broll')),
    background: ok && isStageDone(p, 'switch'),
    reshoot: ok && isStageDone(p, 'shoot'),
    full: ok && !!song && (r.start > 0.5 || r.end < song.durationSec - 0.5),
    nextVersion: (latestVersion(p)?.n ?? 0) + 1,
  };
}
