import { cameraLook } from './cameraLooks';
import { locationPreset, locationTitle } from './samples';
import type {
  Autonomy,
  CameraLookId,
  CreativePath,
  Framing,
  LibraryItem,
  LocationKind,
  Look,
  PlanIdea,
  Project,
  RefImage,
  Section,
  SetGuide,
  Song,
  Take,
} from './types';

// The production side of the plan: how the artist wants to work, the directions pitched for the
// video, the empty locations generated before the shoot, the set guide for every scene, shooting
// scene by scene, and the library of everything generated.
// Pure functions, no UI. `actions.ts` calls `prepareShoot` when the plan locks.

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

// ---------- Path ----------

/**
 * How the artist wants to work. "Let AI direct" runs on its own unless the artist asks to approve
 * each step; "Work with my vision" is hands-on, so every step waits for them.
 */
export function setPath(p: Project, path: CreativePath, approveEachStep = false): Project {
  const autonomy: Autonomy = path === 'ai' && !approveEachStep ? 'auto' : 'ask';
  return { ...p, path, autonomy };
}

export function pathTitle(p: Pick<Project, 'path' | 'autonomy'>): string {
  if (p.path === 'vision') return 'Your vision';
  return p.autonomy === 'ask' ? 'AI directs, you approve each step' : 'AI directs';
}

// ---------- Scenes ----------

export interface Scene {
  /** 0-based, in order. */
  index: number;
  section: Section;
  look?: Look;
}

function rangeOf(p: Project): { start: number; end: number } {
  const song = p.song;
  if (!song) return { start: 0, end: 0 };
  return p.range ?? { start: 0, end: song.durationSec };
}

/** The scenes inside the video, in order. */
export function scenesOf(p: Project): Scene[] {
  const range = rangeOf(p);
  const sections = (p.song?.sections ?? []).filter((s) => s.end > range.start + 0.01 && s.start < range.end - 0.01);
  return sections.map((section, index) => ({ index, section, look: p.looks[section.id] }));
}

export function sceneName(scene: Scene): string {
  const look = scene.look;
  const where = !look ? 'Scene' : look.location === 'custom' ? firstWords(look.prompt, 4) : locationTitle(look.location);
  return `Scene ${scene.index + 1} · ${where}`;
}

function firstWords(text: string, n: number): string {
  const words = text.replace(/[.,!?].*$/, '').trim().split(/\s+/).slice(0, n).join(' ');
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Your location';
}

// ---------- Plan ideas ----------

const SONG_IDEAS: Record<'fast' | 'mid' | 'slow', { title: string; pitch: string }[]> = {
  fast: [
    { title: 'Night city run', pitch: 'Open on a rooftop at night with the skyline behind you, then the alley with wet brick and neon. Cutaways of the city and your chain.' },
    { title: 'Exotic lot', pitch: 'A parking lot full of exotic cars at night with security behind you, then a dark room with one hard light for the hook.' },
    { title: 'Big stage', pitch: 'A stage with the lights hitting you and a crowd you can feel, then the hanging mic in a black room for the verse.' },
  ],
  mid: [
    { title: 'Rooftop to the room', pitch: 'A rooftop at night for the hook, a white room with one light for the verse. Cutaways of the skyline.' },
    { title: 'Warehouse grit', pitch: 'A warehouse with corrugated metal walls in black and white, then the alley with neon for the hook.' },
    { title: 'Sunset drive', pitch: 'The beach at sunset for the verse, then a parking garage at night with headlights for the hook. Cutaways of the car.' },
  ],
  slow: [
    { title: 'One light', pitch: 'The hanging mic in a black room, one spotlight, nothing else. Slow push-ins on the hook.' },
    { title: 'Golden hour', pitch: 'The beach at golden hour for the verse, then a white room for the hook. Cutaways of the waves.' },
    { title: 'Penthouse at night', pitch: 'A penthouse with the city through the glass, then a dark room with a rim light for the hook.' },
  ],
};

function tempoBand(song: Song): 'fast' | 'mid' | 'slow' {
  if (song.bpm >= 125) return 'fast';
  if (song.bpm <= 95) return 'slow';
  return 'mid';
}

/**
 * The director listens to the song and pitches three directions: from the tempo, how many scenes
 * the video has, and where the hook lands. Claude replaces these when the studio server is on.
 */
export function pitchIdeas(p: Project): Project {
  const song = p.song;
  if (!song || p.planApproved) return p;
  const scenes = scenesOf(p).length;
  const hook = song.sections.find((s) => s.kind === 'hook');
  const band = tempoBand(song);
  const tail = hook ? ` The hook at ${Math.floor(hook.start / 60)}:${String(Math.round(hook.start % 60)).padStart(2, '0')} gets the biggest look.` : '';
  const fromSong: PlanIdea[] = SONG_IDEAS[band].map((idea) => ({
    id: uid('idea'),
    title: idea.title,
    pitch: `${idea.pitch}${scenes > 1 ? ` ${scenes} scenes.` : ''}${tail}`,
    source: 'song',
  }));
  const kept = (p.planIdeas ?? []).filter((i) => i.source !== 'song');
  return { ...p, planIdeas: [...fromSong, ...kept] };
}

/** One of the artist's own ideas, in their words. */
export function addMyIdea(p: Project, text: string): Project {
  const pitch = text.trim().slice(0, 600);
  if (!pitch || p.planApproved) return p;
  const idea: PlanIdea = { id: uid('idea'), title: firstWords(pitch, 5), pitch, source: 'mine' };
  return { ...p, planIdeas: [...(p.planIdeas ?? []), idea] };
}

export function removeIdea(p: Project, id: string): Project {
  if (p.planApproved) return p;
  return { ...p, planIdeas: (p.planIdeas ?? []).filter((i) => i.id !== id) };
}

/**
 * A video the artist wants it to feel like. Without the studio server the director can't watch it,
 * so it pitches from what links usually are; with Claude on, the server describes the real video.
 */
export function setInspiration(p: Project, url: string): Project {
  const link = url.trim().slice(0, 500);
  if (p.planApproved) return p;
  const others = (p.planIdeas ?? []).filter((i) => i.source !== 'inspiration');
  if (!link) return { ...p, inspiration: undefined, planIdeas: others };
  const idea: PlanIdea = {
    id: uid('idea'),
    title: 'Like the video you shared',
    pitch: 'Same energy as the video you shared: its locations, its pace, its color. I match the cuts to your song and keep your performance front and center.',
    source: 'inspiration',
  };
  return { ...p, inspiration: link, planIdeas: [...others, idea] };
}

/** The idea the plan is built from. It becomes the brief the director reads into scenes. */
export function pickIdea(p: Project, id: string): Project {
  const idea = (p.planIdeas ?? []).find((i) => i.id === id);
  if (!idea || p.planApproved) return p;
  const brief = idea.source === 'inspiration' && p.inspiration ? `${idea.pitch} Reference: ${p.inspiration}` : idea.pitch;
  return { ...p, brief: brief.slice(0, 1200) };
}

// ---------- Locations, generated before the shoot ----------

/** The prompt for the empty location: the scene's world with nobody in it, framed for where the artist will stand. */
export function locationPrompt(look: Look, guide?: SetGuide): string {
  const base = look.location === 'custom' ? look.prompt : locationPreset(look.location as LocationKind).prompt;
  const clean = base.replace(/The camera stays with the performer\.?/i, '').trim();
  const framing = guide ? ` ${guide.framing === 'wide' ? 'Wide shot' : guide.framing === 'medium' ? 'Medium shot' : 'Close shot'} at ${guide.camera.height.toFixed(1)} m camera height, ${guide.lensMm}mm lens.` : '';
  return `${clean} Empty, nobody in the frame: leave clear space in the center where the artist will stand.${framing} Photoreal, 16:9, sharp, high detail.`;
}

/**
 * Makes the empty location for every scene. These are made before anything is shot, so they never
 * show the artist; they are where the artist gets switched into, so each one is the scene's first
 * reference for SwitchX. Simulated here; the studio server makes real ones.
 */
export function makeLocations(p: Project, now = Date.now()): Project {
  let looks = { ...p.looks };
  const library = [...(p.library ?? [])];
  for (const scene of scenesOf(p)) {
    const look = looks[scene.section.id];
    if (!look || look.refs.some((r) => r.location)) continue;
    const guide = p.guides?.[scene.index];
    const ref: RefImage = { id: uid('ref'), label: `${sceneName(scene)}, empty location`, source: 'generated', location: true, prompt: locationPrompt(look, guide) };
    looks = { ...looks, [scene.section.id]: { ...look, refs: [ref, ...look.refs].slice(0, Math.max(1, p.switchSettings.maxRefs)) } };
    library.push({ id: uid('lib'), kind: 'location', label: sceneName(scene), scene: scene.index, art: look.location, refId: ref.id, at: now });
  }
  return { ...p, looks, library };
}

/** A new take on one scene's location. The old one stays in the library. */
export function remakeLocation(p: Project, sceneIndex: number, now = Date.now()): Project {
  const scene = scenesOf(p)[sceneIndex];
  if (!scene?.look || p.shots.length > 0) return p;
  const look = scene.look;
  const guide = p.guides?.[sceneIndex];
  const ref: RefImage = { id: uid('ref'), label: `${sceneName(scene)}, empty location`, source: 'generated', location: true, prompt: locationPrompt(look, guide) };
  const refs = [ref, ...look.refs.filter((r) => !r.location)].slice(0, Math.max(1, p.switchSettings.maxRefs));
  const item: LibraryItem = { id: uid('lib'), kind: 'location', label: `${sceneName(scene)}, new version`, scene: sceneIndex, art: look.location, refId: ref.id, at: now };
  return { ...p, looks: { ...p.looks, [scene.section.id]: { ...look, refs } }, library: [...(p.library ?? []), item] };
}

/** Swaps a scene's location for one of the artist's own images. Quality in, quality out. */
export function setOwnLocation(p: Project, sceneIndex: number, image: { label: string; uri?: string; mediaId?: string }, now = Date.now()): Project {
  const scene = scenesOf(p)[sceneIndex];
  if (!scene?.look || p.shots.length > 0) return p;
  const ref: RefImage = { id: uid('ref'), label: image.label, source: 'upload', location: true, uri: image.uri, mediaId: image.mediaId };
  const refs = [ref, ...scene.look.refs.filter((r) => !r.location)].slice(0, Math.max(1, p.switchSettings.maxRefs));
  const item: LibraryItem = { id: uid('lib'), kind: 'location', label: `${sceneName(scene)}, your image`, scene: sceneIndex, uri: image.uri, mediaId: image.mediaId, at: now };
  return { ...p, looks: { ...p.looks, [scene.section.id]: { ...scene.look, refs } }, library: [...(p.library ?? []), item] };
}

/** Location images the studio server still has to make: generated, with a prompt, no picture yet. */
export function locationsToMake(p: Project): RefImage[] {
  return Object.values(p.looks).flatMap((look) => look.refs.filter((r) => r.location && r.source === 'generated' && r.prompt && !r.uri));
}

/** A generated location came back: show it, and hand the provider's copy to the switch. */
export function setLocationImage(p: Project, refId: string, image: { uri: string; remoteUri?: string }): Project {
  let found = false;
  const looks = Object.fromEntries(
    Object.entries(p.looks).map(([id, look]) => [
      id,
      {
        ...look,
        refs: look.refs.map((r) => {
          if (r.id !== refId) return r;
          found = true;
          return { ...r, uri: image.uri, remoteUri: image.remoteUri };
        }),
      },
    ]),
  );
  if (!found) return p;
  const library = (p.library ?? []).map((i) => (i.refId === refId ? { ...i, uri: image.uri } : i));
  return { ...p, looks, library };
}

export function locationRef(look: Look | undefined): RefImage | undefined {
  return look?.refs.find((r) => r.location);
}

/** Said wherever the artist picks a location. */
export const REF_QUALITY_NOTE =
  'Your new background will only look as good as this image. If it looks off here, it will look off in the video, so remake it or use your own before you shoot.';

// ---------- Set guides ----------

const FRAMINGS: Framing[] = ['wide', 'medium', 'close'];

/** Where the phone goes for each framing: distance from the artist, height, lens. */
const RIG: Record<Framing, { distance: number; height: number; lensMm: number; backroomM: number }> = {
  wide: { distance: 3.2, height: 1.2, lensMm: 24, backroomM: 1.5 },
  medium: { distance: 2.0, height: 1.45, lensMm: 35, backroomM: 1.2 },
  close: { distance: 1.1, height: 1.55, lensMm: 50, backroomM: 1.0 },
};

/** The guide for one scene. Hooks go low and wide; verses move in. */
export function guideFor(scene: Scene): SetGuide {
  const hook = scene.section.kind === 'hook';
  const framing: Framing = hook ? 'wide' : FRAMINGS[(scene.index + 1) % FRAMINGS.length];
  const rig = RIG[framing];
  const height = hook ? 0.6 : rig.height;
  const side = scene.index % 2 === 0 ? 0 : scene.index % 4 === 1 ? 0.6 : -0.6;
  const light: SetGuide['light'] = hook ? 'behind camera' : scene.index % 2 === 0 ? 'left' : 'right';
  const steps = [
    `Stand on your mark with at least ${rig.backroomM.toFixed(1)} m of clear space behind you. Plain walls switch cleanest.`,
    `Phone ${rig.distance.toFixed(1)} m away${side ? `, a step to the ${side > 0 ? 'right' : 'left'}` : ', straight on'}, at ${height < 1 ? 'knee' : height < 1.5 ? 'chest' : 'eye'} height (${height.toFixed(1)} m).`,
    `${framing === 'wide' ? 'Head to toe in frame' : framing === 'medium' ? 'Waist up in frame' : 'Chest up in frame'}, ${rig.lensMm === 24 ? '1x lens' : rig.lensMm === 35 ? '1.5x zoom' : '2x zoom'}.`,
    light === 'behind camera' ? 'Main light behind the phone, pointing at you.' : `Main light on your ${light}, so the background stays clean.`,
  ];
  return { scene: scene.index, framing, camera: { x: side, z: rig.distance, height }, lensMm: rig.lensMm, backroomM: rig.backroomM, light, steps };
}

export function makeGuides(p: Project): Project {
  return { ...p, guides: scenesOf(p).map(guideFor) };
}

/** Everything the shoot needs, made when the plan locks: a set guide and an empty location for every scene. */
export function prepareShoot(p: Project, now = Date.now()): Project {
  if (!p.song) return p;
  return makeLocations(makeGuides(p), now);
}

// ---------- Shooting scene by scene ----------

export function takesFor(p: Project, sceneIndex: number): Take[] {
  return p.takes.filter((t) => t.scene === sceneIndex);
}

export function isSceneLocked(p: Project, sceneIndex: number): boolean {
  return !!p.sceneLocks?.[sceneIndex];
}

/** The artist is happy with a scene. The AI editor will pick the best take from what's there. */
export function lockScene(p: Project, sceneIndex: number): Project {
  if (p.shootLocked || takesFor(p, sceneIndex).length === 0) return p;
  return { ...p, sceneLocks: { ...(p.sceneLocks ?? {}), [sceneIndex]: true } };
}

export function unlockScene(p: Project, sceneIndex: number): Project {
  if (p.shootLocked || !p.sceneLocks?.[sceneIndex]) return p;
  const locks = { ...p.sceneLocks };
  delete locks[sceneIndex];
  return { ...p, sceneLocks: locks };
}

export function allScenesLocked(p: Project): boolean {
  const scenes = scenesOf(p);
  return scenes.length > 0 && scenes.every((s) => isSceneLocked(p, s.index));
}

/** The next scene still to shoot, in order. */
export function nextScene(p: Project): Scene | undefined {
  return scenesOf(p).find((s) => !isSceneLocked(p, s.index));
}

/**
 * The AI editor's pick for a scene: the take that covers the most of it, without a note from the
 * director, and the latest when they tie (artists get better as they go).
 */
export function bestTake(p: Project, sceneIndex: number): Take | undefined {
  const scene = scenesOf(p)[sceneIndex];
  const takes = takesFor(p, sceneIndex);
  if (!scene || takes.length === 0) return undefined;
  const { start, end } = scene.section;
  const cover = (t: Take) => Math.max(0, Math.min(end, t.end) - Math.max(start, t.start)) / Math.max(0.001, end - start);
  const score = (t: Take) => cover(t) * 100 - (t.flag ? 30 : 0) + t.n * 0.01;
  return takes.slice().sort((a, b) => score(b) - score(a))[0];
}

/**
 * Screenshots pulled from each scene's best take, matched to the scene planned for it. Takes are
 * shot for one scene at a time, so the match is automatic. These become the start frames.
 */
export interface AutoStill {
  scene: number;
  takeId: string;
  /** Song time of the frame. */
  t: number;
  thumb?: string;
  /** The planned empty location it gets switched into. */
  location?: RefImage;
}

export function autoStills(p: Project): AutoStill[] {
  const out: AutoStill[] = [];
  for (const scene of scenesOf(p)) {
    const take = bestTake(p, scene.index);
    if (!take) continue;
    const from = Math.max(scene.section.start, take.start);
    const to = Math.min(scene.section.end, take.end);
    out.push({ scene: scene.index, takeId: take.id, t: Math.round(((from + to) / 2) * 100) / 100, thumb: take.thumb, location: locationRef(scene.look) });
  }
  return out;
}

// ---------- Camera look ----------

export function setCameraLook(p: Project, id: CameraLookId): Project {
  if (p.final.locked) return p;
  return { ...p, cameraLook: cameraLook(id).id };
}

// ---------- Library ----------

export function addToLibrary(p: Project, item: Omit<LibraryItem, 'id' | 'at'>, now = Date.now()): Project {
  return { ...p, library: [...(p.library ?? []), { ...item, id: uid('lib'), at: now }] };
}

/** The library, newest first, with the stills from the shoot added in. */
export function libraryView(p: Project): LibraryItem[] {
  const stills: LibraryItem[] = autoStills(p).map((s) => ({
    id: `still-${s.takeId}-${s.scene}`,
    kind: 'still',
    label: `Scene ${s.scene + 1}, screenshot from your best take`,
    scene: s.scene,
    uri: s.thumb,
    at: 0,
  }));
  return [...(p.library ?? [])].sort((a, b) => b.at - a.at).concat(stills);
}
