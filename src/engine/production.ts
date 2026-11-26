import { cameraLook } from "./cameraLooks";
import { locationPreset, locationTitle } from "./samples";
import type {
  Autonomy,
  CameraLookId,
  CreativePath,
  Framing,
  LibraryItem,
  LocationKind,
  Look,
  PlanIdea,
  Prop,
  Project,
  RefImage,
  Section,
  SetGuide,
  Song,
  Take,
} from "./types";

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
export function setPath(
  p: Project,
  path: CreativePath,
  approveEachStep = false,
): Project {
  const autonomy: Autonomy = path === "ai" && !approveEachStep ? "auto" : "ask";
  return { ...p, path, autonomy };
}

export function pathTitle(p: Pick<Project, "path" | "autonomy">): string {
  if (p.path === "vision") return "Your vision";
  return p.autonomy === "ask"
    ? "AI directs, you approve each step"
    : "AI directs";
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
  const sections = (p.song?.sections ?? []).filter(
    (s) => s.end > range.start + 0.01 && s.start < range.end - 0.01,
  );
  return sections.map((section, index) => ({
    index,
    section,
    look: p.looks[section.id],
  }));
}

export function sceneName(scene: Scene): string {
  const look = scene.look;
  const where = !look
    ? "Scene"
    : look.location === "custom"
      ? firstWords(look.prompt, 4)
      : locationTitle(look.location);
  return `Scene ${scene.index + 1} · ${where}`;
}

function firstWords(text: string, n: number): string {
  const words = text
    .replace(/[.,!?].*$/, "")
    .trim()
    .split(/\s+/)
    .slice(0, n)
    .join(" ");
  return words
    ? words.charAt(0).toUpperCase() + words.slice(1)
    : "Your location";
}

// ---------- Plan ideas ----------

const SONG_IDEAS: Record<
  "fast" | "mid" | "slow",
  { title: string; pitch: string }[]
> = {
  fast: [
    {
      title: "Night city run",
      pitch:
        "Open on a rooftop at night with the skyline behind you, then the alley with wet brick and neon. Cutaways of the city and your chain.",
    },
    {
      title: "Exotic lot",
      pitch:
        "A parking lot full of exotic cars at night with security behind you, then a dark room with one hard light for the hook.",
    },
    {
      title: "Big stage",
      pitch:
        "A stage with the lights hitting you and a crowd you can feel, then the hanging mic in a black room for the verse.",
    },
  ],
  mid: [
    {
      title: "Rooftop to the room",
      pitch:
        "A rooftop at night for the hook, a white room with one light for the verse. Cutaways of the skyline.",
    },
    {
      title: "Warehouse grit",
      pitch:
        "A warehouse with corrugated metal walls in black and white, then the alley with neon for the hook.",
    },
    {
      title: "Sunset drive",
      pitch:
        "The beach at sunset for the verse, then a parking garage at night with headlights for the hook. Cutaways of the car.",
    },
  ],
  slow: [
    {
      title: "One light",
      pitch:
        "The hanging mic in a black room, one spotlight, nothing else. Slow push-ins on the hook.",
    },
    {
      title: "Golden hour",
      pitch:
        "The beach at golden hour for the verse, then a white room for the hook. Cutaways of the waves.",
    },
    {
      title: "Penthouse at night",
      pitch:
        "A penthouse with the city through the glass, then a dark room with a rim light for the hook.",
    },
  ],
};

function tempoBand(song: Song): "fast" | "mid" | "slow" {
  if (song.bpm >= 125) return "fast";
  if (song.bpm <= 95) return "slow";
  return "mid";
}

/**
 * The director listens to the song and pitches three directions: from the tempo, how many scenes
 * the video has, and where the hook lands. Claude replaces these when the studio server is on.
 */
export function pitchIdeas(p: Project): Project {
  const song = p.song;
  if (!song || p.planApproved) return p;
  const scenes = scenesOf(p).length;
  const hook = song.sections.find((s) => s.kind === "hook");
  const band = tempoBand(song);
  const tail = hook
    ? ` The hook at ${Math.floor(hook.start / 60)}:${String(Math.round(hook.start % 60)).padStart(2, "0")} gets the biggest look.`
    : "";
  const fromSong: PlanIdea[] = SONG_IDEAS[band].map((idea) => ({
    id: uid("idea"),
    title: idea.title,
    pitch: `${idea.pitch}${scenes > 1 ? ` ${scenes} scenes.` : ""}${tail}`,
    source: "song",
  }));
  const kept = (p.planIdeas ?? []).filter((i) => i.source !== "song");
  return { ...p, planIdeas: [...fromSong, ...kept] };
}

/** One of the artist's own ideas, in their words. */
export function addMyIdea(p: Project, text: string): Project {
  const pitch = text.trim().slice(0, 600);
  if (!pitch || p.planApproved) return p;
  const idea: PlanIdea = {
    id: uid("idea"),
    title: firstWords(pitch, 5),
    pitch,
    source: "mine",
  };
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
  const others = (p.planIdeas ?? []).filter((i) => i.source !== "inspiration");
  if (!link) return { ...p, inspiration: undefined, planIdeas: others };
  const idea: PlanIdea = {
    id: uid("idea"),
    title: "Like the video you shared",
    pitch:
      "Same energy as the video you shared: its locations, its pace, its color. I match the cuts to your song and keep your performance front and center.",
    source: "inspiration",
  };
  return { ...p, inspiration: link, planIdeas: [...others, idea] };
}

/** The idea the plan is built from. It becomes the brief the director reads into scenes. */
export function pickIdea(p: Project, id: string): Project {
  const idea = (p.planIdeas ?? []).find((i) => i.id === id);
  if (!idea || p.planApproved) return p;
  const brief =
    idea.source === "inspiration" && p.inspiration
      ? `${idea.pitch} Reference: ${p.inspiration}`
      : idea.pitch;
  return { ...p, brief: brief.slice(0, 1200) };
}

// ---------- The song, in the artist's words ----------

export function setSongAbout(
  p: Project,
  about: string,
  message: string,
): Project {
  if (p.planApproved) return p;
  return {
    ...p,
    songAbout: about.slice(0, 1500),
    songMessage: message.slice(0, 600),
  };
}

export function setMustHaves(p: Project, text: string): Project {
  if (p.planApproved) return p;
  return { ...p, mustHaves: text.slice(0, 800) };
}

export function addPlanRef(
  p: Project,
  image: { label: string; uri?: string; mediaId?: string },
): Project {
  if (p.planApproved) return p;
  const ref: RefImage = {
    id: uid("ref"),
    label: image.label,
    source: "upload",
    uri: image.uri,
    mediaId: image.mediaId,
  };
  return { ...p, planRefs: [...(p.planRefs ?? []), ref].slice(0, 8) };
}

export function removePlanRef(p: Project, id: string): Project {
  if (p.planApproved) return p;
  return { ...p, planRefs: (p.planRefs ?? []).filter((r) => r.id !== id) };
}

/** Each must-have on its own: split on lines, semicolons and "and also". */
export function mustHaveList(p: Pick<Project, "mustHaves">): string[] {
  return (p.mustHaves ?? "")
    .split(/\n|;|\band also\b/i)
    .map((x) => x.replace(/^[-•*\d.)\s]+/, "").trim())
    .filter((x) => x.length > 2)
    .slice(0, 6);
}

/** Everything the artist told the director, as one brief: the vision or picked idea, what the song is about, the must-haves. */
export function composeBrief(p: Project): string {
  const parts = [
    p.brief?.trim(),
    p.songAbout?.trim() ? `The song is about: ${p.songAbout.trim()}` : "",
    p.songMessage?.trim() ? `The message: ${p.songMessage.trim()}` : "",
    mustHaveList(p).length ? `Must have: ${mustHaveList(p).join("; ")}.` : "",
    p.inspiration ? `Reference video: ${p.inspiration}` : "",
    p.planRefs?.length
      ? `The artist attached ${p.planRefs.length} reference image${p.planRefs.length === 1 ? "" : "s"}.`
      : "",
  ];
  return parts.filter(Boolean).join(" ").slice(0, 3000);
}

/** "I know at least one scene I wanna be on the moon" reads as "on the moon". */
export function mustHavePlace(want: string): string {
  const place = want
    .trim()
    .replace(/[.!]+$/, "")
    .replace(
      /^(i know |i want |i wanna |i need |there'?s |there has to be |gotta have |at least )+/i,
      "",
    )
    .replace(
      /^(one|1|a) (scene|shot|part)( where)?( i'?m| i| me)?( wanna| want to| gotta| have to)?( be)?\s*/i,
      "",
    );
  return place || want.trim();
}

/**
 * Makes sure every must-have lands in a scene: if no scene's prompt mentions it, the hook (or the
 * last scene not already holding one) becomes that place.
 */
export function applyMustHaves(p: Project): Project {
  const wants = mustHaveList(p);
  if (!wants.length) return p;
  let looks = { ...p.looks };
  const taken = new Set<string>();
  const scenes = scenesOf(p);
  for (const want of wants) {
    const key = want
      .toLowerCase()
      .replace(
        /\b(at least|one|a|an|the|scene|i|want|wanna|to|be|in|on|of|me|my|know|have|has|gotta|got)\b/g,
        " ",
      )
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const hit = scenes.find((sc) => {
      const look = looks[sc.section.id];
      return look && key.some((k) => look.prompt.toLowerCase().includes(k));
    });
    if (hit) {
      taken.add(hit.section.id);
      continue;
    }
    const target =
      scenes.find(
        (sc) => sc.section.kind === "hook" && !taken.has(sc.section.id),
      ) ?? [...scenes].reverse().find((sc) => !taken.has(sc.section.id));
    const look = target && looks[target.section.id];
    if (!target || !look) continue;
    taken.add(target.section.id);
    const place = mustHavePlace(want);
    looks = {
      ...looks,
      [target.section.id]: {
        ...look,
        location: "custom",
        prompt: `${place.charAt(0).toUpperCase()}${place.slice(1)}. The artist asked for this. The camera stays with the performer.`,
      },
    };
  }
  return { ...p, looks };
}

// ---------- The part of the song ----------

/** The loudest stretch of the song of about `seconds`, from the waveform: usually the hook. */
export function smartSnippetStart(song: Song, seconds: number): number {
  const peaks = song.peaks ?? [];
  if (peaks.length < 4 || song.durationSec <= seconds) return 0;
  const per = song.durationSec / peaks.length;
  const win = Math.max(1, Math.round(seconds / per));
  let best = 0;
  let bestSum = -1;
  let sum = 0;
  for (let i = 0; i < peaks.length; i++) {
    sum += peaks[i];
    if (i >= win) sum -= peaks[i - win];
    if (i >= win - 1 && sum > bestSum) {
      bestSum = sum;
      best = i - win + 1;
    }
  }
  return Math.round(best * per * 100) / 100;
}

// ---------- Shot list ----------

export interface ShotListItem {
  scene: Scene;
  /** The words sung in this scene, if the song has lyrics. */
  lyrics: string;
  where: string;
  guide?: SetGuide;
}

export function shotList(p: Project): ShotListItem[] {
  const lines = p.song?.lyrics ?? [];
  return scenesOf(p).map((scene) => {
    const words = lines
      .flatMap((l) => l.words)
      .filter((w) => w.t >= scene.section.start && w.t < scene.section.end)
      .map((w) => w.text)
      .join(" ");
    return {
      scene,
      lyrics: words,
      where: scene.look?.prompt ?? "",
      guide: p.guides?.[scene.index],
    };
  });
}

// ---------- Locations, generated before the shoot ----------

/** The prompt for the empty location: the scene's world with nobody in it, framed for where the artist will stand. */
export function locationPrompt(look: Look, guide?: SetGuide): string {
  const base =
    look.location === "custom"
      ? look.prompt
      : locationPreset(look.location as LocationKind).prompt;
  const clean = base
    .replace(/The camera stays with the performer\.?/i, "")
    .trim();
  const framing = guide
    ? ` ${guide.framing === "wide" ? "Wide shot" : guide.framing === "medium" ? "Medium shot" : "Close shot"} at ${guide.camera.height.toFixed(1)} m camera height, ${guide.lensMm}mm lens.`
    : "";
  return `${clean} Empty, nobody in the frame: leave clear space in the center where the artist will stand.${framing} Photoreal, 16:9, sharp, high detail.`;
}

const MAX_OPTIONS = 4;
const DEFAULT_OPTIONS = 2;

export function optionCount(p: Project): number {
  return Math.max(
    1,
    Math.min(MAX_OPTIONS, Math.round(p.locationCount ?? DEFAULT_OPTIONS)),
  );
}

function makeOptions(
  p: Project,
  scene: Scene,
  look: Look,
  count: number,
  note?: string,
): RefImage[] {
  const guide = p.guides?.[scene.index];
  const base = locationPrompt(look, guide);
  return Array.from({ length: count }, (_, i) => ({
    id: uid("ref"),
    label: `${sceneName(scene)}, option ${i + 1}`,
    source: "generated" as const,
    location: true,
    prompt: note
      ? `${base} Change: ${note.trim().slice(0, 300)}`
      : `${base}${i > 0 ? ` Variation ${i + 1}: a different angle and light on the same place.` : ""}`,
  }));
}

/** The picked option becomes the scene's location: first reference for the switch. */
function withPicked(
  look: Look,
  picked: RefImage | undefined,
  maxRefs: number,
): Look {
  const others = look.refs.filter((r) => !r.location);
  return {
    ...look,
    refs: picked ? [picked, ...others].slice(0, Math.max(1, maxRefs)) : others,
  };
}

function libraryFor(
  p: Project,
  scene: Scene,
  options: RefImage[],
  now: number,
  label?: string,
): LibraryItem[] {
  return options.map((o, i) => ({
    id: uid("lib"),
    kind: "location" as const,
    label: label ? `${label}, option ${i + 1}` : o.label,
    scene: scene.index,
    art: scene.look?.location,
    refId: o.id,
    at: now,
  }));
}

/**
 * Generates background options for every scene (2 by default, 1 to 4). They are made before
 * anything is shot, so they never show the artist; the one the artist picks and locks is exactly
 * where they get switched into. Simulated here; the studio server makes real ones.
 */
export function makeLocations(p: Project, now = Date.now()): Project {
  let looks = { ...p.looks };
  let library = [...(p.library ?? [])];
  for (const scene of scenesOf(p)) {
    const look = looks[scene.section.id];
    if (!look || look.options?.length || look.refs.some((r) => r.location))
      continue;
    const options = makeOptions(p, scene, look, optionCount(p));
    looks = {
      ...looks,
      [scene.section.id]: {
        ...withPicked(look, options[0], p.switchSettings.maxRefs),
        options,
      },
    };
    library = library.concat(libraryFor(p, scene, options, now));
  }
  return { ...p, looks, library };
}

function updateScene(
  p: Project,
  sceneIndex: number,
  fn: (look: Look, scene: Scene) => Look,
): Project {
  const scene = scenesOf(p)[sceneIndex];
  if (!scene?.look || p.shots.length > 0) return p;
  return {
    ...p,
    looks: { ...p.looks, [scene.section.id]: fn(scene.look, scene) },
  };
}

/** New options for one scene, optionally with the artist's note ("make it rain"). The old ones stay in the library. */
export function reviseLocation(
  p: Project,
  sceneIndex: number,
  note?: string,
  now = Date.now(),
): Project {
  const scene = scenesOf(p)[sceneIndex];
  if (!scene?.look || scene.look.locationLocked || p.shots.length > 0) return p;
  const options = makeOptions(p, scene, scene.look, optionCount(p), note);
  const next = updateScene(p, sceneIndex, (look) => ({
    ...withPicked(look, options[0], p.switchSettings.maxRefs),
    options,
  }));
  return {
    ...next,
    library: [
      ...(next.library ?? []),
      ...libraryFor(
        p,
        scene,
        options,
        now,
        note
          ? `${sceneName(scene)}, "${note.trim().slice(0, 40)}"`
          : `${sceneName(scene)}, new set`,
      ),
    ],
  };
}

/** Same thing with no note: a fresh set of options. */
export function remakeLocation(
  p: Project,
  sceneIndex: number,
  now = Date.now(),
): Project {
  return reviseLocation(p, sceneIndex, undefined, now);
}

export function pickLocationOption(
  p: Project,
  sceneIndex: number,
  refId: string,
): Project {
  return updateScene(p, sceneIndex, (look) => {
    if (look.locationLocked) return look;
    const picked = look.options?.find((o) => o.id === refId);
    return picked ? withPicked(look, picked, p.switchSettings.maxRefs) : look;
  });
}

/** 1 to 4 options per scene. Unlocked scenes get topped up or trimmed to match. */
export function setLocationCount(
  p: Project,
  count: number,
  now = Date.now(),
): Project {
  const n = Math.max(1, Math.min(MAX_OPTIONS, Math.round(count)));
  let next: Project = { ...p, locationCount: n };
  if (!p.planApproved || p.shots.length > 0) return next;
  for (const scene of scenesOf(next)) {
    const look = scene.look;
    if (!look || look.locationLocked || !look.options) continue;
    if (look.options.length > n) {
      const kept = look.options.slice(0, n);
      const pickedId = locationRef(look)?.id;
      const picked = kept.find((o) => o.id === pickedId) ?? kept[0];
      next = updateScene(next, scene.index, (l) => ({
        ...withPicked(l, picked, p.switchSettings.maxRefs),
        options: kept,
      }));
    } else if (look.options.length < n) {
      const extra = makeOptions(next, scene, look, n - look.options.length).map(
        (o, i) => ({
          ...o,
          label: `${sceneName(scene)}, option ${look.options!.length + i + 1}`,
        }),
      );
      next = updateScene(next, scene.index, (l) => ({
        ...l,
        options: [...(l.options ?? []), ...extra],
      }));
      next = {
        ...next,
        library: [
          ...(next.library ?? []),
          ...libraryFor(next, scene, extra, now),
        ],
      };
    }
  }
  return next;
}

export function lockLocation(p: Project, sceneIndex: number): Project {
  return updateScene(p, sceneIndex, (look) =>
    locationRef(look) ? { ...look, locationLocked: true } : look,
  );
}

export function unlockLocation(p: Project, sceneIndex: number): Project {
  return updateScene(p, sceneIndex, (look) => ({
    ...look,
    locationLocked: false,
  }));
}

export function isLocationLocked(p: Project, sceneIndex: number): boolean {
  return !!scenesOf(p)[sceneIndex]?.look?.locationLocked;
}

export function allLocationsLocked(p: Project): boolean {
  const scenes = scenesOf(p);
  return scenes.length > 0 && scenes.every((s) => !!s.look?.locationLocked);
}

/** Swaps a scene's background for one of the artist's own images. Quality in, quality out. */
export function setOwnLocation(
  p: Project,
  sceneIndex: number,
  image: { label: string; uri?: string; mediaId?: string },
  now = Date.now(),
): Project {
  const scene = scenesOf(p)[sceneIndex];
  if (!scene?.look || scene.look.locationLocked || p.shots.length > 0) return p;
  const ref: RefImage = {
    id: uid("ref"),
    label: image.label,
    source: "upload",
    location: true,
    uri: image.uri,
    mediaId: image.mediaId,
  };
  const next = updateScene(p, sceneIndex, (look) => ({
    ...withPicked(look, ref, p.switchSettings.maxRefs),
    options: [ref, ...(look.options ?? [])].slice(0, MAX_OPTIONS + 1),
  }));
  const item: LibraryItem = {
    id: uid("lib"),
    kind: "location",
    label: `${sceneName(scene)}, your image`,
    scene: sceneIndex,
    uri: image.uri,
    mediaId: image.mediaId,
    refId: ref.id,
    at: now,
  };
  return { ...next, library: [...(next.library ?? []), item] };
}

/** Location images the studio server still has to make: generated, with a prompt, no picture yet. */
export function locationsToMake(p: Project): RefImage[] {
  const seen = new Set<string>();
  return Object.values(p.looks)
    .flatMap((look) => [...(look.options ?? []), ...look.refs])
    .filter((r) => {
      if (
        !r.location ||
        r.source !== "generated" ||
        !r.prompt ||
        r.uri ||
        seen.has(r.id)
      )
        return false;
      seen.add(r.id);
      return true;
    });
}

/** A generated location came back: show it, and hand the provider's copy to the switch. */
export function setLocationImage(
  p: Project,
  refId: string,
  image: { uri: string; remoteUri?: string },
): Project {
  let found = false;
  const patch = (r: RefImage) => {
    if (r.id !== refId) return r;
    found = true;
    return { ...r, uri: image.uri, remoteUri: image.remoteUri };
  };
  const looks = Object.fromEntries(
    Object.entries(p.looks).map(([id, look]) => [
      id,
      {
        ...look,
        refs: look.refs.map(patch),
        options: look.options?.map(patch),
      },
    ]),
  );
  if (!found) return p;
  const library = (p.library ?? []).map((i) =>
    i.refId === refId ? { ...i, uri: image.uri } : i,
  );
  return { ...p, looks, library };
}

export function locationRef(look: Look | undefined): RefImage | undefined {
  return look?.refs.find((r) => r.location);
}

/** Said wherever the artist picks a location. */
export const REF_QUALITY_NOTE =
  "Your new background will only look as good as this image. If it looks off here, it will look off in the video, so remake it or use your own before you shoot.";

// ---------- Set guides ----------

const FRAMINGS: Framing[] = ["wide", "medium", "close"];

/** Where the phone goes for each framing: distance from the artist, height, lens. */
const RIG: Record<
  Framing,
  { distance: number; height: number; lensMm: number; backroomM: number }
> = {
  wide: { distance: 3.2, height: 1.2, lensMm: 24, backroomM: 1.5 },
  medium: { distance: 2.0, height: 1.45, lensMm: 35, backroomM: 1.2 },
  close: { distance: 1.1, height: 1.55, lensMm: 50, backroomM: 1.0 },
};

/**
 * What the scene needs you to hold, lean on or sit in, and what to use at home instead.
 * SwitchX keeps your body exactly as shot, so the pose has to be real: hang from something,
 * grip something, sit on something.
 */
const PROP_RULES: { test: RegExp; prop: Omit<Prop, "for">; for: string }[] = [
  {
    test: /\b(helicopter|chopper|plane|airplane|jet|hanging|hang off|hang from|rope|ladder|monkey bars?|pull-?up)\b/,
    for: "the grab handle",
    prop: {
      kind: "bar",
      say: "Hang on to something at head height: a door frame, a pull-up bar, or a broom laid across two chairs. Grip it the way you would in the scene.",
    },
  },
  {
    test: /\b(mic stand|microphone stand|mic\b|microphone)\b/,
    for: "the mic stand",
    prop: {
      kind: "stand",
      say: "Prop a broom or mop upright where the mic stand goes and hold it like one. Mouth height for the mic.",
    },
  },
  {
    test: /\b(car|driving|driver|passenger|truck|jeep|lambo|lamborghini|ferrari|motorcycle|bike|scooter|boat|yacht)\b/,
    for: "the seat",
    prop: {
      kind: "seat",
      say: "Sit on a chair or stool at car-seat height. Hands where the wheel or handlebars would be.",
    },
  },
  {
    test: /\b(throne|couch|sofa|bed|chair|bench|sitting|seated)\b/,
    for: "the seat",
    prop: {
      kind: "seat",
      say: "Sit on a chair or the edge of a bed. Same height the seat has in the scene.",
    },
  },
  {
    test: /\b(lean|leaning|against the wall|on the wall|railing|rail|balcony|fence)\b/,
    for: "what you lean on",
    prop: {
      kind: "wall",
      say: "Lean on a wall or the back of a chair at hip height, the way you would on the railing.",
    },
  },
  {
    test: /\b(table|desk|counter|bar top|dj booth|booth|pool table)\b/,
    for: "the table",
    prop: {
      kind: "table",
      say: "Use a table or counter at the same height. Put your hands where they would rest in the scene.",
    },
  },
  {
    test: /\b(stairs|steps|stoop|staircase)\b/,
    for: "the steps",
    prop: {
      kind: "steps",
      say: "Sit or stand on a step or a sturdy box so your height matches the stairs.",
    },
  },
];

export function propsFor(text: string): Prop[] {
  const lower = ` ${text.toLowerCase()} `;
  const out: Prop[] = [];
  for (const rule of PROP_RULES) {
    if (rule.test.test(lower) && !out.some((p) => p.kind === rule.prop.kind))
      out.push({ ...rule.prop, for: rule.for });
  }
  return out.slice(0, 2);
}

/** The guide for one scene. Hooks go low and wide; verses move in. */
export function guideFor(scene: Scene): SetGuide {
  const hook = scene.section.kind === "hook";
  const framing: Framing = hook
    ? "wide"
    : FRAMINGS[(scene.index + 1) % FRAMINGS.length];
  const rig = RIG[framing];
  const height = hook ? 0.6 : rig.height;
  const side = scene.index % 2 === 0 ? 0 : scene.index % 4 === 1 ? 0.6 : -0.6;
  const light: SetGuide["light"] = hook
    ? "behind camera"
    : scene.index % 2 === 0
      ? "left"
      : "right";
  const props = propsFor(`${scene.look?.prompt ?? ""}`);
  const steps = [
    `Find a clear space: a plain wall, nothing busy behind you, and ${(rig.backroomM + 1).toFixed(1)} m to move. If someone else is filming, they stand where the phone is.`,
    ...props.map((pr) => `For ${pr.for}: ${pr.say}`),
    `Stand on your mark with at least ${rig.backroomM.toFixed(1)} m of clear space behind you. Plain walls switch cleanest.`,
    `Phone on a tripod or propped on books, ${rig.distance.toFixed(1)} m away${side ? `, a step to the ${side > 0 ? "right" : "left"}` : ", straight on"}, at ${height < 1 ? "knee" : height < 1.5 ? "chest" : "eye"} height (${height.toFixed(1)} m).`,
    `${framing === "wide" ? "Head to toe in frame" : framing === "medium" ? "Waist up in frame" : "Chest up in frame"}, ${rig.lensMm === 24 ? "1x lens" : rig.lensMm === 35 ? "1.5x zoom" : "2x zoom"}.`,
    light === "behind camera"
      ? "Main light behind the phone, pointing at you."
      : `Main light on your ${light}, so the background stays clean.`,
  ];
  return {
    scene: scene.index,
    framing,
    camera: { x: side, z: rig.distance, height },
    lensMm: rig.lensMm,
    backroomM: rig.backroomM,
    light,
    steps,
    props,
  };
}

export function makeGuides(p: Project): Project {
  return { ...p, guides: scenesOf(p).map(guideFor) };
}

/** Everything the shoot needs, made when the plan locks: a set guide and an empty location for every scene. */
export function prepareShoot(p: Project, now = Date.now()): Project {
  if (!p.song) return p;
  return makeLocations(makeGuides(applyMustHaves(p)), now);
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
  const cover = (t: Take) =>
    Math.max(0, Math.min(end, t.end) - Math.max(start, t.start)) /
    Math.max(0.001, end - start);
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
    out.push({
      scene: scene.index,
      takeId: take.id,
      t: Math.round(((from + to) / 2) * 100) / 100,
      thumb: take.thumb,
      location: locationRef(scene.look),
    });
  }
  return out;
}

// ---------- Camera look ----------

export function setCameraLook(p: Project, id: CameraLookId): Project {
  if (p.final.locked) return p;
  return { ...p, cameraLook: cameraLook(id).id };
}

// ---------- Library ----------

export function addToLibrary(
  p: Project,
  item: Omit<LibraryItem, "id" | "at">,
  now = Date.now(),
): Project {
  return {
    ...p,
    library: [...(p.library ?? []), { ...item, id: uid("lib"), at: now }],
  };
}

/** The library, newest first, with the stills from the shoot added in. */
export function libraryView(p: Project): LibraryItem[] {
  const stills: LibraryItem[] = autoStills(p).map((s) => ({
    id: `still-${s.takeId}-${s.scene}`,
    kind: "still",
    label: `Scene ${s.scene + 1}, screenshot from your best take`,
    scene: s.scene,
    uri: s.thumb,
    at: 0,
  }));
  return [...(p.library ?? [])].sort((a, b) => b.at - a.at).concat(stills);
}
