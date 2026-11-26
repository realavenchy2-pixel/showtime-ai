import { arrangeBroll, buildShots, cutawaySec, missingShots, saveRenders } from './broll';
import { formatTime, jobResult, stageIntro, takeLine } from './director';
import { emptyEffects, planForPack, planFromCopied } from './fx';
import {
  barSec,
  DEFAULT_TAKE_PLAN,
  lookFor,
  pitchBroll,
  suggestedLooks,
  withScenes,
} from './samples';
import { bestTake, pitchIdeas, prepareShoot, scenesOf, setPath } from './production';
import { canSkip, currentStage, STAGE_BY_ID, STAGES } from './stages';
import { recordVersion } from './versions';
import { HANDLE_SEC, maxShotSec, RECORD_FPS, SWITCHX } from './switchx';
import type {
  Autonomy,
  BrollIdea,
  BrollModel,
  Clip,
  CutSegment,
  FxEffectId,
  FxIntensity,
  FxPackId,
  FxPlan,
  Format,
  Job,
  LiveCaps,
  LocationKind,
  Message,
  Project,
  RefImage,
  Resolution,
  Shot,
  Song,
  StageId,
  SwitchSettings,
  Take,
  TakeAngle,
  TakeScope,
  Vibe,
  VideoLength,
} from './types';

export { buildShots } from './broll';

// Pure project transitions. Every function returns a new project and never mutates its input.
// The store calls these; tests call them directly.

let counter = 0;
const session = Date.now().toString(36);
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${session}${counter.toString(36)}`;
}

function message(from: Message['from'], text: string, extra: Partial<Message> = {}): Message {
  return { id: uid('msg'), from, text, at: Date.now(), ...extra };
}

function post(p: Project, from: Message['from'], text: string, extra: Partial<Message> = {}): Project {
  return { ...p, messages: [...p.messages, message(from, text, extra)] };
}

/** Posts the director's intro when the current stage changed between two versions. */
function withIntro(before: Project, after: Project): Project {
  const prev = currentStage(before)?.id;
  const next = currentStage(after)?.id;
  if (!next || prev === next) return after;
  // The plan opens with the director's pick of snippet or full video, which the artist can change.
  const scened = !!after.song?.sections.some((s) => s.scene);
  const ready = next === 'looks' ? pitchPlan(scened && !after.length ? setVideoLength(after, suggestedLength(after)) : after) : after;
  const intro = stageIntro(ready, next);
  return post(ready, 'director', intro.text, { stage: next, attachment: intro.attachment });
}

/** The stretch of song time the video covers: the snippet the artist picked, or the whole song. */
export function videoRange(p: Project): { start: number; end: number } {
  const duration = p.song?.durationSec ?? 0;
  if (!p.range) return { start: 0, end: duration };
  const start = clamp(p.range.start, 0, duration);
  return { start, end: clamp(p.range.end, start, duration) };
}

/** Snippet lengths the plan offers, in seconds. Each is rounded to whole bars of the song. */
export const SNIPPET_LENGTHS = [15, 30, 60] as const;

/** A snippet `seconds` long starting at song time `start`, on whole bars and inside the song. */
export function snippetRange(song: Song, start: number, seconds: number): { start: number; end: number } {
  const bar = barSec(song.bpm);
  const bars = Math.max(1, Math.round(seconds / bar));
  let from = clamp(start, 0, song.durationSec);
  // Near the end of the song the snippet slides back so it is still the full length.
  if (from + bars * bar > song.durationSec) from = Math.max(0, song.durationSec - bars * bar);
  return { start: round(from), end: round(Math.min(song.durationSec, from + bars * bar)) };
}

/** The plan's length: the full song, or a snippet. Changing it re-pitches the b-roll to fit. */
export function setRange(p: Project, range: { start: number; end: number } | undefined): Project {
  if (p.planApproved || p.job || !p.song) return p;
  const r = range ? { start: round(range.start), end: round(range.end) } : undefined;
  if (JSON.stringify(r) === JSON.stringify(p.range)) return p;
  // Scenes are laid out over the video, so a new length means new scenes and a fresh pitch.
  const scened = p.song.sections.some((s) => s.scene);
  const song = scened ? withScenes(p.song, r) : p.song;
  const next: Project = { ...p, range: r, song, looks: scened ? {} : p.looks, broll: { ...p.broll, ideas: p.broll.ideas.filter((i) => i.fromInbox) } };
  return pitchPlan(next);
}

/** How long a snippet runs. The director rounds it to whole bars. */
export const SNIPPET_SEC = 30;

/** The stretch of song a video covers: from the artist's start point, a snippet or to the end. */
export function rangeFor(song: Song, start: number, length: VideoLength): { start: number; end: number } | undefined {
  const from = clamp(start, 0, Math.max(0, song.durationSec - 1));
  if (length === 'full') return from < 0.05 ? undefined : { start: round(from), end: round(song.durationSec) };
  const bar = barSec(song.bpm);
  const bars = Math.max(1, Math.round(SNIPPET_SEC / bar));
  return { start: round(from), end: round(Math.min(song.durationSec, from + bars * bar)) };
}

export function videoLength(p: Project): VideoLength {
  if (p.length) return p.length;
  return p.range && p.song && p.range.end < p.song.durationSec - 0.05 ? 'snippet' : 'full';
}

/** The director's call when nobody picked: vertical-only videos are made for a snippet. */
export function suggestedLength(p: Project): VideoLength {
  return p.formats.length > 0 && p.formats.every((f) => f === '9:16') ? 'snippet' : 'full';
}

/** Snippet or full video, from the start point the artist has (the top of the song until the first take). */
export function setVideoLength(p: Project, length: VideoLength): Project {
  if (!p.song || p.planApproved || p.job) return p;
  return setRange({ ...p, length }, rangeFor(p.song, videoRange(p).start, length));
}

/**
 * The part of the song, picked in the plan: a snippet (any length, anywhere) or the full song with
 * a little trimmed off either end. Once picked, the first take no longer places the video.
 */
export function pickPart(p: Project, length: VideoLength, range: { start: number; end: number }): Project {
  const song = p.song;
  if (!song || p.planApproved || p.job) return p;
  const start = clamp(range.start, 0, Math.max(0, song.durationSec - 2));
  const end = clamp(range.end, start + 2, song.durationSec);
  const whole = start < 0.05 && end > song.durationSec - 0.05;
  return { ...setRange({ ...p, length }, whole ? undefined : { start, end }), length, partPicked: true };
}

/** What the artist typed into the plan, kept as they go so it is there when they come back. */
export function setBrief(p: Project, text: string): Project {
  if (p.planApproved) return p;
  return { ...p, brief: text.slice(0, 1200) };
}

/**
 * The first take says where the video starts. The plan was laid out from the top of the song;
 * here it moves to the artist's start point, with scenes, looks and cutaways in the same order.
 */
function placeVideo(p: Project, start: number): Project {
  const song = p.song;
  if (!song || !p.length || p.takes.length > 0 || p.partPicked) return p;
  const range = rangeFor(song, start, p.length);
  if (JSON.stringify(range) === JSON.stringify(p.range)) return p;
  const scened = song.sections.some((s) => s.scene);
  const placed = scened ? withScenes(song, range) : song;
  let looks = p.looks;
  if (scened) {
    const before = song.sections.filter((s) => s.scene);
    const after = placed.sections.filter((s) => s.scene);
    const suggested = suggestedLooks(placed.sections);
    looks = Object.fromEntries(
      placed.sections.map((s) => {
        if (!s.scene) return [s.id, p.looks[s.id] ?? suggested[s.id]];
        // Scene n of the new layout takes the look planned for the same stretch of the old one.
        const i = after.indexOf(s);
        const from = before[Math.min(before.length - 1, Math.floor((i * before.length) / after.length))];
        return [s.id, (from && p.looks[from.id]) ?? suggested[s.id]];
      }),
    );
  }
  // Cutaways are laid out again inside the new range, in the same order.
  return arrangeBroll({ ...p, range, song: placed, looks });
}

function placementLine(p: Project): string {
  const r = videoRange(p);
  if (p.length === 'snippet') return `The video starts at ${formatTime(r.start)} and runs ${Math.round(r.end - r.start)} seconds. Every take after this one stays inside it.`;
  return r.start < 0.05 ? 'The video runs the full song from the top.' : `The video starts at ${formatTime(r.start)} and runs to the end of the song.`;
}

/** A default for the effects pack when nobody picked a vibe: by tempo. */
export function vibeForTempo(bpm: number): Vibe {
  if (bpm >= 125) return 'Trap';
  if (bpm <= 98) return 'Boom bap';
  return 'Melodic';
}

/**
 * The director's first pass at the plan: a look for every part of the song, b-roll for the verses
 * and an effects pack. Keeps anything already chosen.
 */
export function pitchPlan(p: Project): Project {
  const song = p.song;
  if (!song) return p;
  const suggested = suggestedLooks(song.sections);
  const looks = Object.fromEntries(song.sections.map((s) => [s.id, p.looks[s.id] ?? suggested[s.id]]));
  const vibe = p.vibe ?? vibeForTempo(song.bpm);
  const inbox = p.broll.ideas.filter((i) => i.fromInbox);
  const range = videoRange(p);
  const inside = (i: BrollIdea) => i.at === undefined || (i.at >= range.start - 0.01 && i.at + i.durationSec <= range.end + 0.01);
  const ideas = p.broll.ideas.some((i) => !i.fromInbox) ? p.broll.ideas : [...pitchBroll(song, vibe).filter(inside), ...inbox];
  const fx = p.fx.pack ? p.fx : planForPack(VIBE_PACK[vibe], p.fx.intensity);
  return arrangeBroll({ ...p, vibe, looks, broll: { ...p.broll, ideas }, fx });
}

function startJob(p: Project, stage: StageId, label: string, durationMs: number, external = false): Project {
  const job: Job = { id: uid('job'), stage, label, progress: 0, elapsedMs: 0, durationMs, external: external || undefined };
  return { ...p, job };
}

export const DEMO_NOTE =
  'Demo mode: the switch and b-roll are simulated until your studio server is connected. Recording, the cut, effects and export are real.';
export const LIVE_NOTE = 'Live: the switch, b-roll and director run on your studio server.';

export const VIBE_PACK: Record<Vibe, FxPackId> = {
  Drill: 'drill',
  Trap: 'trapHype',
  Melodic: 'melodic',
  'Boom bap': 'boomBap',
  Dark: 'dark',
};

export function blankProject(title: string, now = Date.now()): Project {
  return {
    id: uid('proj'),
    title,
    isSample: false,
    createdAt: now,
    autonomy: 'auto',
    pipeline: 'demo',
    formats: [],
    takePlan: [],
    takes: [],
    clips: [],
    shootLocked: false,
    cut: { segments: [], locked: false, seed: 0 },
    looks: {},
    planApproved: false,
    plates: 'none',
    switchSettings: { model: SWITCHX.model, maxFrames: SWITCHX.maxFrames, maxRefs: SWITCHX.maxRefs, alphaMode: 'auto', resolution: 720 },
    shots: [],
    broll: { ideas: [], approved: false },
    fx: { intensity: 'Hype', effects: emptyEffects() },
    final: { builds: 0, locked: false },
    exportState: { formats: [], resolution: '1080p', done: false, creditsCharged: 0 },
    skipped: [],
    ideas: [],
    messages: [],
  };
}

export interface NewProjectInput {
  song: Song;
  /** Optional: without one the effects pack is picked from the tempo. */
  vibe?: Vibe;
  formats: Format[];
  pipeline?: Project['pipeline'];
  /** Where recording starts and stops. Leave it out for the whole song. */
  range?: { start: number; end: number };
  /** Let AI direct, or work from the artist's own vision. */
  path?: Project['path'];
  /** With "Let AI direct": stop for the artist at every step. */
  approveEachStep?: boolean;
}

export function formatName(f: Format): string {
  return f === '16:9' ? 'YouTube' : f === '9:16' ? 'Reels and TikTok' : 'square posts';
}

/** Stage 1: the track, vibe and formats. An imported track arrives already mapped. */
export function createProject(input: NewProjectInput): Project {
  let p = blankProject(input.song.title);
  p = { ...p, pipeline: input.pipeline ?? 'demo' };
  if (input.path) p = setPath(p, input.path, input.approveEachStep);
  p = post(p, 'system', p.pipeline === 'live' ? LIVE_NOTE : DEMO_NOTE);
  return pitchIdeas(setSong(p, input, true));
}

/** Stage 1 again, after going back: new track, vibe or formats. */
export function updateSong(p: Project, input: NewProjectInput): Project {
  if (p.job) return p;
  return setSong({ ...p, title: input.song.title }, input, false);
}

function setSong(p: Project, input: NewProjectInput, first: boolean): Project {
  const before = p;
  const where = input.formats.map(formatName).join(' and ');
  const mapped = input.song.analyzed;
  const changedSong = !!p.song && (p.song.audioId !== input.song.audioId || JSON.stringify(p.song.sections) !== JSON.stringify(input.song.sections));
  // A new song or new parts: the old plan's looks and pitched b-roll no longer line up.
  const looks = changedSong ? {} : p.looks;
  const broll = changedSong ? { ...p.broll, ideas: p.broll.ideas.filter((i) => i.fromInbox) } : p.broll;
  let next: Project = {
    ...p,
    looks,
    broll,
    // New parts mean a new plan to lock; a snippet that no longer fits the song goes too.
    planApproved: changedSong ? false : p.planApproved,
    // Scenes are laid out from the top for a new song; the first take places them again.
    range: 'range' in input ? input.range : changedSong && (input.song.sections.some((s) => s.scene) || (p.range && p.range.end > input.song.durationSec)) ? undefined : p.range,
    song: input.song,
    vibe: input.vibe ?? p.vibe ?? vibeForTempo(input.song.bpm),
    formats: input.formats,
    exportState: { ...p.exportState, formats: input.formats },
    takePlan: p.takePlan.length ? p.takePlan : DEFAULT_TAKE_PLAN,
  };
  const lead = `Locked in: "${input.song.title}"${first ? `, cut for ${where}` : ''}.`;
  if (!mapped) {
    next = post(next, 'director', `${lead} Give me a second to map the track.`, { stage: 'song' });
    return startJob(next, 'song', 'Mapping your track: tempo, bars and sections', 2600);
  }
  const result = jobResult(next, 'song');
  next = post(next, 'director', `${lead} ${result?.text ?? ''}`.trim(), { stage: 'song' });
  return withIntro(before, next);
}

export function setAutonomy(p: Project, autonomy: Autonomy): Project {
  if (p.autonomy === autonomy) return p;
  const next = { ...p, autonomy };
  return post(
    next,
    'system',
    autonomy === 'auto' ? 'Autopilot on. The director keeps going and stops only where it needs you.' : 'Autopilot off. The director asks before every step.',
  );
}

export function setPipeline(p: Project, pipeline: Project['pipeline']): Project {
  if (p.pipeline === pipeline) return p;
  return post({ ...p, pipeline, live: pipeline === 'live' ? p.live : undefined }, 'system', pipeline === 'live' ? LIVE_NOTE : DEMO_NOTE);
}

export function switchName(model: string): string {
  const version = model.match(/(\d+\.\d+)/)?.[1];
  return version ? `SwitchX ${version}` : 'SwitchX';
}

/**
 * Points the project at the studio server and adopts its limits: shot length and reference count
 * follow whichever SwitchX the key can run. Only before any shot has been switched.
 */
export function connectLive(p: Project, caps: LiveCaps): Project {
  if (p.isSample || p.job || p.shots.length > 0) return p;
  const same = p.pipeline === 'live' && p.live && JSON.stringify(p.live) === JSON.stringify(caps);
  if (same) return p;
  const top = Math.max(...caps.resolutions, 720);
  const resolution = (p.switchSettings.resolution <= top ? p.switchSettings.resolution : top) as SwitchSettings['resolution'];
  const settings: SwitchSettings = { ...p.switchSettings, model: caps.model, maxFrames: caps.maxFrames, maxRefs: caps.maxRefs, resolution };
  const looks = Object.fromEntries(Object.entries(p.looks).map(([id, look]) => [id, { ...look, refs: look.refs.slice(0, caps.maxRefs) }]));
  const model = p.broll.ideas.length && !caps.broll.includes(p.broll.ideas[0].model) && caps.broll.length ? caps.broll[0] : undefined;
  const broll = model ? { ...p.broll, ideas: p.broll.ideas.map((i) => ({ ...i, model })) } : p.broll;
  const next: Project = { ...p, pipeline: 'live', live: caps, switchSettings: settings, looks, broll };
  const secs = Math.floor(caps.maxFrames / RECORD_FPS);
  const parts = [`Live: the switch runs on ${switchName(caps.model)}, up to ${secs} seconds a shot.`];
  if (caps.broll.length === 0) parts.push('B-roll is not set up on the server yet.');
  if (caps.director) parts.push('Claude is directing.');
  return post(next, 'system', parts.join(' '));
}

/** Back to simulated renders, e.g. when the server is disconnected. */
export function disconnectLive(p: Project): Project {
  if (p.pipeline !== 'live' || p.job || p.shots.length > 0) return p;
  return post({ ...p, pipeline: 'demo', live: undefined }, 'system', DEMO_NOTE);
}

/** True when this stage's job runs on the studio server instead of the simulation. */
export function liveStage(p: Project, stage: StageId): boolean {
  if (p.pipeline !== 'live' || !p.live) return false;
  if (stage === 'switch') return true;
  if (stage === 'broll') return p.live.broll.length > 0;
  if (stage === 'looks') return p.live.references;
  return false;
}

// ---------- Shoot ----------

export interface NewTake {
  source: Take['source'];
  /** Song time where the take starts. */
  fromSec: number;
  durationSec: number;
  fps?: number;
  width?: number;
  height?: number;
  mediaId?: string;
  thumb?: string;
  /** Seconds into the file where `fromSec` lands. */
  mediaOffsetSec?: number;
  lagMs?: number;
  sync?: Take['sync'];
  flag?: string;
  label?: string;
  angle?: TakeAngle;
  hookOnly?: boolean;
  /** The scene this take was shot for. */
  scene?: number;
}

export function addTake(p: Project, input: NewTake): Project {
  if (!p.song || p.shootLocked) return p;
  const before = p;
  // The first take places the video in the song; later takes land inside it.
  const placed = p.takes.length === 0 ? placeVideo(p, input.fromSec) : p;
  if (placed !== p) p = post(placed, 'director', placementLine(placed), { stage: 'shoot' });
  const song = p.song!;
  const n = p.takes.reduce((max, t) => Math.max(max, t.n), 0) + 1;
  const start = clamp(input.fromSec, 0, song.durationSec);
  const end = clamp(start + input.durationSec, start, song.durationSec);
  if (end - start < 0.5) return before;
  const take: Take = {
    id: uid('take'),
    n,
    source: input.source,
    label: input.label ?? `Take ${n}`,
    angle: input.angle ?? p.takePlan[n - 1]?.angle ?? 'Wide',
    hookOnly: input.hookOnly || undefined,
    start: round(start),
    end: round(end),
    mediaOffsetSec: round(input.mediaOffsetSec ?? 0),
    fps: input.fps ?? RECORD_FPS,
    width: input.width ?? 1920,
    height: input.height ?? 1080,
    mediaId: input.mediaId,
    thumb: input.thumb,
    lagMs: Math.round(input.lagMs ?? 0),
    sync: input.sync ?? 'clock',
    flag: input.flag,
    scene: input.scene,
  };
  let next: Project = { ...p, takes: [...p.takes, take] };
  next = post(next, 'director', takeLine(next, take), { stage: 'shoot' });
  return withIntro(before, next);
}

const LAGS = [42, 38, 51, 40, 47, 36];

/** A stand-in take for sample projects: the planned angle over the planned part of the song. */
export function addSampleTake(p: Project, angle: TakeAngle, scope: TakeScope): Project {
  const song = p.song;
  if (!song) return p;
  const n = p.takes.length + 1;
  const hooks = song.sections.filter((s) => s.kind === 'hook');
  const start = scope === 'Hook only' && hooks.length ? hooks[0].start : 0;
  const end = scope === 'Hook only' && hooks.length ? hooks[hooks.length - 1].end : song.durationSec;
  return addTake(p, {
    source: 'sample',
    fromSec: start,
    durationSec: end - start,
    lagMs: LAGS[(n - 1) % LAGS.length],
    sync: 'audio',
    angle,
    hookOnly: scope === 'Hook only' || undefined,
    flag: n === 4 ? 'Drifts out of frame near the end, I will cut around it' : undefined,
  });
}

export function removeTake(p: Project, takeId: string): Project {
  if (p.shootLocked || p.job) return p;
  const take = p.takes.find((t) => t.id === takeId);
  if (!take) return p;
  return post({ ...p, takes: p.takes.filter((t) => t.id !== takeId) }, 'system', `Removed ${take.label.toLowerCase()}.`);
}

export function addClip(p: Project, input: Omit<Clip, 'id'>): Project {
  const clip: Clip = { ...input, id: uid('clip') };
  // The artist's own footage is the best b-roll there is: free, and it looks like their world.
  const idea: BrollIdea = {
    id: uid('broll'),
    lyric: 'Your clip',
    shot: clip.label,
    clipId: clip.id,
    durationSec: round(Math.min(clip.durationSec, p.song ? cutawaySec(p.song.bpm) : 3)),
    status: 'idea',
    keep: true,
    mine: true,
    model: p.broll.ideas[0]?.model ?? 'omni',
  };
  let next: Project = { ...p, clips: [...p.clips, clip], broll: p.broll.approved ? p.broll : { ...p.broll, ideas: [...p.broll.ideas, idea] } };
  next = arrangeBroll(next, idea.id);
  return post(next, 'director', `"${clip.label}" has no song in it, so I can't line it up as a take. It's a cutaway now.`, { stage: 'shoot' });
}

export function removeClip(p: Project, clipId: string): Project {
  const ideas = p.broll.approved ? p.broll.ideas : p.broll.ideas.filter((i) => i.clipId !== clipId);
  return arrangeBroll({ ...p, clips: p.clips.filter((c) => c.id !== clipId), broll: { ...p.broll, ideas } });
}

/** How much of the song at least one take covers, 0 to 1. */
export function coverage(p: Project): number {
  const song = p.song;
  if (!song || song.durationSec <= 0) return 0;
  const range = videoRange(p);
  const length = range.end - range.start;
  if (length <= 0) return 0;
  const spans = p.takes
    .map((t) => [Math.max(t.start, range.start), Math.min(t.end, range.end)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = range.start;
  for (const [s, e] of spans) {
    const from = Math.max(s, cursor);
    if (e > from) {
      covered += e - from;
      cursor = e;
    }
  }
  return Math.min(1, covered / length);
}

export function finishShooting(p: Project): Project {
  if (p.takes.length === 0 || p.shootLocked || p.job) return p;
  const before = p;
  let next: Project = { ...p, shootLocked: true };
  next = withIntro(before, next);
  return startJob(next, 'cut', 'Sorting takes and cutting on the beat', 3000);
}

// ---------- Cut ----------

const HOOK_ANGLES: TakeAngle[] = ['Low angle', 'Close-up', 'Second outfit', 'Wide'];
const VERSE_ANGLES: TakeAngle[] = ['Wide', 'Close-up', 'Second outfit', 'Low angle'];

/** Bars per shot for verses and hooks. Shuffling the cut steps through these. */
const RHYTHMS: [number, number][] = [
  [4, 2],
  [2, 2],
  [4, 1],
];

/** A take that starts or stops inside a shot never leaves a piece shorter than this. */
export const MIN_SHOT_SEC = 1;

/**
 * Cuts the song on the bar grid and picks a take for every shot.
 * Hooks cut faster and favor the low angle; a take is never used twice in a row when another one covers the shot.
 * Parts of the song that no take covers come back with an empty takeId; b-roll covers them.
 */
export function buildCut(p: Project, seed = p.cut.seed): CutSegment[] {
  const song = p.song;
  if (!song || p.takes.length === 0) return [];
  const bar = barSec(song.bpm);
  const [verseBars, hookBars] = RHYTHMS[Math.abs(seed) % RHYTHMS.length];
  const longest = Math.min(...p.takes.map((t) => maxShotSec(t.fps, p.switchSettings.maxFrames))) - 2 * HANDLE_SEC;
  const segments: CutSegment[] = [];
  let previous = '';
  let turn = 0;
  /** When each take was last on screen, so the cut rotates through all of them. */
  const lastUsed = new Map<string, number>();

  const beat = 60 / song.bpm;
  const beatUp = (x: number) => round(song.downbeatSec + Math.ceil((x - song.downbeatSec) / beat - 1e-6) * beat);
  const beatDown = (x: number) => round(song.downbeatSec + Math.floor((x - song.downbeatSec) / beat + 1e-6) * beat);

  const range = videoRange(p);
  // Scenes shot one at a time: the AI editor's best take carries its scene.
  const bestBySection = new Map<string, string>();
  for (const scene of scenesOf(p)) {
    const best = bestTake(p, scene.index);
    if (best) bestBySection.set(scene.section.id, best.id);
  }
  for (const whole of song.sections) {
    // Only the part of the song the video covers gets cut.
    const section = { ...whole, start: Math.max(whole.start, range.start), end: Math.min(whole.end, range.end) };
    if (section.end - section.start < 0.01) continue;
    let length = (section.kind === 'hook' ? hookBars : verseBars) * bar;
    while (length > longest && length > bar / 2) length /= 2;
    let t = section.start;
    while (t < section.end - 0.01) {
      let end = Math.min(section.end, t + length);
      // Fold a short tail into the last shot instead of leaving a sliver.
      if (section.end - end < bar * 0.5 && section.end - t <= longest) end = section.end;
      // Where a take starts or stops inside a shot, the cut moves to the beat: in on the next beat,
      // out on the last one it covers, and never so close to the shot's edge that it leaves a flash.
      // When nothing else covers the other side, it's a gap for b-roll, so the take keeps every beat it has.
      const covers = (from: number, to: number, not: Take) => p.takes.some((o) => o !== not && o.start <= from + 0.05 && o.end >= to - 0.05);
      const edges = [t, end];
      for (const take of p.takes) {
        if (take.start > t + 0.05 && take.start < end - 0.05) {
          const e = beatUp(covers(t, take.start, take) ? Math.max(take.start, t + MIN_SHOT_SEC) : take.start);
          if (e <= end - MIN_SHOT_SEC + 1e-6) edges.push(e);
        }
        if (take.end > t + 0.05 && take.end < end - 0.05) {
          const e = beatDown(covers(take.end, end, take) ? Math.min(take.end, end - MIN_SHOT_SEC) : take.end);
          if (e >= t + MIN_SHOT_SEC - 1e-6) edges.push(e);
        }
      }
      edges.sort((a, b) => a - b);
      for (let k = edges.length - 1; k > 0; k--) if (edges[k] - edges[k - 1] < 0.05) edges.splice(k, 1);
      for (let i = 0; i < edges.length - 1; i++) {
        const from = edges[i];
        const to = edges[i + 1];
        const hook = section.kind === 'hook';
        const covering = p.takes.filter((take) => take.start <= from + 0.05 && take.end >= to - 0.05 && (hook || !take.hookOnly));
        const best = bestBySection.get(section.id);
        const pool = best && covering.some((t) => t.id === best) ? covering.filter((t) => t.id === best || t.scene === undefined) : covering;
        const order = hook ? HOOK_ANGLES : VERSE_ANGLES;
        const rank = (take: Take) => (order.indexOf(take.angle) + (hook ? 0 : Math.abs(seed))) % order.length;
        // A take with a note on it still gets screen time, just less: it waits two extra turns.
        const waited = (take: Take) => (lastUsed.get(take.id) ?? -1) + (take.flag ? 2 : 0);
        const fresh = pool.filter((take) => take.id !== previous);
        // Hooks come back to the low angle every other shot; everything else takes the angle that has waited longest.
        const signature = hook ? fresh.find((take) => take.angle === 'Low angle' && !take.flag) : undefined;
        const pick =
          signature ??
          (fresh.length ? fresh : pool).slice().sort((a, b) => waited(a) - waited(b) || rank(a) - rank(b) || a.n - b.n)[0];
        const takeId = pick?.id ?? '';
        const last = segments[segments.length - 1];
        if (last && !takeId && !last.takeId && last.sectionId === section.id) {
          last.end = round(to);
        } else {
          segments.push({ id: uid('seg'), sectionId: section.id, start: round(from), end: round(to), takeId });
        }
        if (takeId) {
          previous = takeId;
          lastUsed.set(takeId, turn);
          turn += 1;
        }
      }
      t = end;
    }
  }
  return segments;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The plan can still change: nothing has been sent to the switch yet. */
/** The cut can change until the switch starts. */
function planOpen(p: Project): boolean {
  return p.shots.length === 0 && !p.job && p.plates === 'none';
}

export function swapSegmentTake(p: Project, segmentId: string, takeId: string): Project {
  if (!planOpen(p)) return p;
  const seg = p.cut.segments.find((s) => s.id === segmentId);
  const take = p.takes.find((t) => t.id === takeId);
  if (!seg || !take || take.start > seg.start + 0.05 || take.end < seg.end - 0.05) return p;
  return arrangeBroll({ ...p, cut: { ...p.cut, segments: p.cut.segments.map((s) => (s.id === segmentId ? { ...s, takeId } : s)) } });
}

/** Same takes, a different cut: new rhythm and a new order of angles. */
export function reshuffleCut(p: Project): Project {
  if (!planOpen(p) || p.cut.segments.length === 0) return p;
  const seed = p.cut.seed + 1;
  const next: Project = arrangeBroll({ ...p, cut: { ...p.cut, seed, segments: buildCut(p, seed) } });
  return post(next, 'director', `Shuffled. ${cutLine(next)}`, { stage: 'cut' });
}

export function cutLine(p: Project): string {
  const shots = p.cut.segments.filter((s) => s.takeId).length;
  const [verseBars, hookBars] = RHYTHMS[Math.abs(p.cut.seed) % RHYTHMS.length];
  const range = videoRange(p);
  const hooks = p.song?.sections.some((s) => s.kind === 'hook' && s.end > range.start && s.start < range.end);
  if (!hooks) return `${shots} shots, a new one every ${verseBars === 1 ? 'bar' : `${verseBars} bars`}.`;
  return `${shots} shots: hooks cut every ${hookBars === 1 ? 'bar' : `${hookBars} bars`}, verses every ${verseBars}.`;
}

/** Locks the cut and pitches the rest of the video: looks, b-roll and an effects pack. */
export function lockCut(p: Project): Project {
  if (p.cut.segments.length === 0 || p.cut.locked) return p;
  const before = p;
  const next: Project = pitchPlan({ ...p, cut: { ...p.cut, locked: true } });
  return withIntro(before, next);
}

// ---------- Looks ----------

function looksOpen(p: Project): boolean {
  return p.plates !== 'approved' && !p.job && p.shots.length === 0;
}

export function setLook(p: Project, sectionId: string, location: LocationKind | 'custom'): Project {
  if (!looksOpen(p)) return p;
  const current = p.looks[sectionId];
  const refs = current?.refs ?? [];
  const look = location === 'custom' ? { location, prompt: current?.location === 'custom' ? current.prompt : '', refs } : { ...lookFor(location), refs };
  return { ...p, looks: { ...p.looks, [sectionId]: look }, plates: 'none' };
}

/** One look for the whole song. */
export function setLookEverywhere(p: Project, location: LocationKind): Project {
  if (!looksOpen(p) || !p.song) return p;
  const looks = Object.fromEntries(p.song.sections.map((s) => [s.id, { ...lookFor(location), refs: p.looks[s.id]?.refs ?? [] }]));
  return { ...p, looks, plates: 'none' };
}

export function setLookPrompt(p: Project, sectionId: string, prompt: string): Project {
  const look = p.looks[sectionId];
  if (!looksOpen(p) || !look) return p;
  return { ...p, looks: { ...p.looks, [sectionId]: { ...look, prompt: prompt.slice(0, 2000) } }, plates: 'none' };
}

export function addLookRef(p: Project, sectionId: string, ref: Omit<RefImage, 'id'>): Project {
  const look = p.looks[sectionId];
  if (!looksOpen(p) || !look || look.refs.length >= p.switchSettings.maxRefs) return p;
  return { ...p, looks: { ...p.looks, [sectionId]: { ...look, refs: [...look.refs, { ...ref, id: uid('ref') }] } }, plates: 'none' };
}

export function removeLookRef(p: Project, sectionId: string, refId: string): Project {
  const look = p.looks[sectionId];
  if (!looksOpen(p) || !look) return p;
  return { ...p, looks: { ...p.looks, [sectionId]: { ...look, refs: look.refs.filter((r) => r.id !== refId) } }, plates: 'none' };
}

export function setSwitchSettings(p: Project, patch: Partial<SwitchSettings>): Project {
  if (p.shots.length > 0 || p.job) return p;
  const next = { ...p.switchSettings, ...patch };
  if (!patch.maxRefs) return { ...p, switchSettings: next };
  // A model with fewer references keeps the first ones of every look.
  const looks = Object.fromEntries(Object.entries(p.looks).map(([id, look]) => [id, { ...look, refs: look.refs.slice(0, next.maxRefs) }]));
  return { ...p, switchSettings: next, looks };
}

/** The artist locks the plan before the shoot. In autopilot the director runs everything after the shoot. */
export function approvePlan(p: Project): Project {
  const sections = p.song?.sections ?? [];
  if (p.planApproved || !p.song?.analyzed || !sections.every((s) => p.looks[s.id])) return p;
  const before = p;
  const next = post(
    prepareShoot({ ...p, planApproved: true }),
    'director',
    "Plan's locked. I made the empty location for every scene, so you can see where you're going before you shoot, and a set guide for each one. We shoot one scene at a time.",
    { stage: 'looks' },
  );
  return withIntro(before, next);
}

export function makePlates(p: Project): Project {
  const sections = p.song?.sections ?? [];
  if (p.job || !p.planApproved || p.plates !== 'none' || !sections.every((s) => p.looks[s.id])) return p;
  if (p.pipeline === 'live' && !liveStage(p, 'looks')) {
    // No reference generator on the server: SwitchX works from the prompts and the artist's own images.
    return startSwitch({ ...p, plates: 'approved' });
  }
  return startJob(p, 'looks', 'Building a reference frame for each look', 3200, liveStage(p, 'looks'));
}

export function approvePlates(p: Project): Project {
  if (p.plates !== 'ready') return p;
  return withIntro(p, { ...p, plates: 'approved' });
}

// ---------- Switch ----------

export function startSwitch(p: Project, opts: { external?: boolean } = {}): Project {
  // Reference frames come first; the switch starts on its own when they are in.
  if (p.plates === 'none' && !p.job && p.shots.length === 0 && p.cut.locked) return makePlates(p);
  if (p.plates === 'ready') p = { ...p, plates: 'approved' };
  if (p.plates !== 'approved' || p.job || p.shots.length > 0) return p;
  // Locked backgrounds only: a touch-up that opened one waits for the artist to lock it again.
  if (scenesOf(p).some((s) => s.look?.reopened && !s.look.locationLocked)) return p;
  const shots = buildShots(p);
  if (shots.length === 0) return p;
  const fresh = shots.filter((s) => !s.reused).length;
  const kept = shots.length - fresh;
  if (fresh === 0) {
    const done = post({ ...p, shots }, 'director', `Nothing new to switch: all ${kept} ${kept === 1 ? 'shot is' : 'shots are'} the same as your last version, so they cost nothing.`, { stage: 'switch' });
    return withIntro(p, done);
  }
  const label = kept ? `Switching ${fresh} new ${fresh === 1 ? 'shot' : 'shots'}, ${kept} kept from your last version` : `Switching ${shots.length} shots, ${SWITCHX.concurrency} at a time`;
  return startJob({ ...p, shots }, 'switch', label, 0, opts.external ?? liveStage(p, 'switch'));
}

/** After a reload: picks a live switch back up where its shots left off. */
export function resumeSwitch(p: Project): Project {
  if (p.job || !liveStage(p, 'switch') || !p.shots.some((s) => s.status === 'queued' || s.status === 'rendering')) return p;
  return startJob(p, 'switch', 'Picking the switch back up', 0, true);
}

export function approveShot(p: Project, shotId: string): Project {
  if (!p.shots.some((s) => s.id === shotId && s.status === 'ready')) return p;
  const before = p;
  const next: Project = {
    ...p,
    shots: p.shots.map((s) => (s.id === shotId && s.status === 'ready' ? { ...s, status: 'approved', flag: undefined } : s)),
  };
  return withIntro(before, next);
}

export function redoShot(p: Project, shotId: string, opts: { external?: boolean } = {}): Project {
  const shot = p.shots.find((s) => s.id === shotId);
  if (!shot || shot.status === 'queued' || shot.status === 'rendering') return p;
  let next: Project = {
    ...p,
    shots: p.shots.map((s) =>
      s.id === shotId ? { ...s, status: 'queued', progress: 0, flag: undefined, error: undefined, remoteId: undefined, renderUrl: undefined, alphaUrl: undefined, renderMediaId: undefined } : s,
    ),
  };
  next = post(next, 'director', `Redoing shot ${shot.n}. Same look, new seed.`, { stage: 'switch' });
  if (!next.job) next = startJob(next, 'switch', `Redoing shot ${shot.n}`, 0, opts.external ?? liveStage(p, 'switch'));
  return next;
}

export function approveAllShots(p: Project): Project {
  if (p.job || !p.shots.some((s) => s.status === 'ready')) return p;
  const before = p;
  const next: Project = { ...p, shots: p.shots.map((s) => (s.status === 'ready' ? { ...s, status: 'approved', flag: undefined } : s)) };
  return withIntro(before, next);
}

/** Approves every shot that came back without a note. The flagged ones wait for the artist. */
export function approveCleanShots(p: Project): Project {
  if (p.job || !p.shots.some((s) => s.status === 'ready' && !s.flag)) return p;
  const before = p;
  const next: Project = { ...p, shots: p.shots.map((s) => (s.status === 'ready' && !s.flag ? { ...s, status: 'approved' } : s)) };
  return withIntro(before, next);
}

/** Live pipeline: writes what the provider reported for one shot. */
export function updateShot(p: Project, shotId: string, patch: Partial<Pick<Shot, 'status' | 'progress' | 'flag' | 'remoteId' | 'renderUrl' | 'alphaUrl' | 'renderMediaId' | 'error'>>): Project {
  if (!p.shots.some((s) => s.id === shotId)) return p;
  return { ...p, shots: p.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)) };
}

// ---------- B-roll ----------

export function skipStage(p: Project, stage: StageId): Project {
  if (!canSkip(stage) || p.skipped.includes(stage) || p.job) return p;
  const before = p;
  let next: Project = { ...p, skipped: [...p.skipped, stage] };
  next = post(next, 'system', `Skipped ${STAGE_BY_ID[stage].title}.`);
  // Skipping b-roll after the switch: the spots saved for cutaways need the performance back.
  return stage === 'broll' && next.shots.length ? fillIn(before, next) : withIntro(before, next);
}

/** Turns a cutaway on or off. On always finds it a place, even if a director pitch has to give way. */
export function toggleBrollKeep(p: Project, ideaId: string): Project {
  const idea = p.broll.ideas.find((i) => i.id === ideaId);
  if (p.broll.approved || !idea || idea.cover) return p;
  const on = !idea.keep;
  const ideas = p.broll.ideas.map((i) => (i.id === ideaId ? { ...i, keep: on, bumped: undefined } : i));
  return arrangeBroll({ ...p, broll: { ...p.broll, ideas } }, on ? ideaId : undefined);
}

export function setBrollModel(p: Project, model: BrollModel): Project {
  if (p.broll.approved || p.job) return p;
  return { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => (i.status === 'idea' ? { ...i, model } : i)) } };
}

export function addBrollIdea(p: Project, shot: string, fromInbox = false): Project {
  if (p.broll.approved) return p;
  const song = p.song;
  const idea: BrollIdea = {
    id: uid('broll'),
    lyric: fromInbox ? 'From your idea inbox' : 'Your idea',
    shot,
    durationSec: song ? cutawaySec(song.bpm) : 3,
    status: 'idea',
    keep: true,
    fromInbox: fromInbox || undefined,
    mine: true,
    model: p.broll.ideas[0]?.model ?? 'omni',
  };
  // The artist's idea gets a place; a director pitch gives way if the video is full.
  return arrangeBroll({ ...p, broll: { ...p.broll, ideas: [...p.broll.ideas, idea] } }, idea.id);
}

export function generateBroll(p: Project, opts: { external?: boolean } = {}): Project {
  if (p.job || p.broll.approved) return p;
  // The artist's own clips are already shot: they're back the moment b-roll starts.
  const own = p.broll.ideas.some((i) => i.keep && i.clipId && i.status === 'idea');
  if (own) p = { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => (i.keep && i.clipId && i.status === 'idea' ? { ...i, status: 'clip' as const } : i)) } };
  const count = brollToMake(p);
  if (count === 0) return own ? post(p, 'director', 'Your clips are in place. Check them, then keep them.', { stage: 'broll' }) : p;
  if (p.pipeline === 'live' && !liveStage(p, 'broll')) {
    const noted = post(p, 'director', "B-roll isn't set up on your studio server yet, so I'm cutting without it.", { stage: 'broll' });
    return skipStage(noted, 'broll');
  }
  return startJob(p, 'broll', `Generating ${count} b-roll ${count === 1 ? 'clip' : 'clips'}`, 4200, opts.external ?? liveStage(p, 'broll'));
}

export function updateBroll(p: Project, ideaId: string, patch: Partial<Pick<BrollIdea, 'status' | 'keep' | 'remoteId' | 'url' | 'mediaId'>>): Project {
  return { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => (i.id === ideaId ? { ...i, ...patch } : i)) } };
}

/** Cutaways that still need generating: kept, with a place in the video, not the artist's own clip. */
export function brollToMake(p: Project): number {
  return p.broll.ideas.filter((i) => i.keep && i.status === 'idea' && i.at !== undefined && !i.clipId).length;
}

export function approveBroll(p: Project): Project {
  if (!p.broll.ideas.some((i) => i.status === 'clip') || p.broll.approved) return p;
  // A cutaway that never got made can't go in the edit: its spot goes back to the performance.
  const ideas = p.broll.ideas.map((i) =>
    i.status === 'clip' && i.keep ? { ...i, status: 'approved' as const } : i.status === 'idea' && i.keep ? { ...i, keep: false, at: undefined, sectionId: undefined } : i,
  );
  return fillIn(p, { ...p, broll: { ideas, approved: true } });
}

/**
 * After the b-roll: any stretch of performance a planned cutaway was meant to cover, and now
 * doesn't (dropped, failed, skipped), goes through the switch so the video has no holes.
 */
function fillIn(before: Project, p: Project): Project {
  const extra = missingShots(p);
  if (extra.length === 0 || p.job) return withIntro(before, p);
  if (extra.every((s) => s.reused)) {
    // Every spot that went back to the performance was already switched for an earlier version.
    return withIntro(before, { ...p, shots: [...p.shots, ...extra] });
  }
  const seconds = Math.round(extra.reduce((sum, s) => sum + (s.end - s.start), 0));
  let next: Project = { ...p, shots: [...p.shots, ...extra] };
  next = post(
    next,
    'director',
    `${extra.length === 1 ? 'One spot' : `${extra.length} spots`} I'd saved for b-roll ${extra.length === 1 ? 'is' : 'are'} back on you, so I'm switching those ${seconds} ${seconds === 1 ? 'second' : 'seconds'} of your take now.`,
    { stage: 'switch' },
  );
  return startJob(next, 'switch', `Switching ${extra.length} more ${extra.length === 1 ? 'shot' : 'shots'}`, 0, liveStage(p, 'switch'));
}

// ---------- Edit ----------

/** The effects copied from a video the artist uploaded become the pack. */
export function setCopiedFx(p: Project, copied: NonNullable<FxPlan['copied']>): Project {
  if (p.final.locked) return p;
  return { ...p, fx: planFromCopied(copied, p.fx.intensity) };
}

export function setFxPack(p: Project, pack: FxPackId): Project {
  if (p.final.locked) return p;
  return { ...p, fx: planForPack(pack, p.fx.intensity) };
}

export function setFxIntensity(p: Project, intensity: FxIntensity): Project {
  if (p.final.locked) return p;
  return { ...p, fx: { ...p.fx, intensity } };
}

export function toggleEffect(p: Project, effect: FxEffectId, on?: boolean): Project {
  if (p.final.locked) return p;
  return { ...p, fx: { ...p.fx, effects: { ...p.fx.effects, [effect]: on ?? !p.fx.effects[effect] } } };
}

/** The director assembles the edit: cut, b-roll and effects on the beat grid. */
export function buildEdit(p: Project, opts: { external?: boolean } = {}): Project {
  if (p.job || p.final.locked) return p;
  const next = p.fx.pack || !p.vibe ? p : { ...p, fx: planForPack(VIBE_PACK[p.vibe], p.fx.intensity) };
  return startJob(next, 'edit', 'Building the edit: cuts, b-roll and effects on the beat', 2800, opts.external);
}

export function lockEdit(p: Project): Project {
  if (p.final.builds === 0 || p.final.locked || p.job) return p;
  const next: Project = {
    ...p,
    final: { ...p.final, locked: true },
    exportState: { ...p.exportState, formats: p.exportState.formats.length ? p.exportState.formats : p.formats },
  };
  return withIntro(p, next);
}

// ---------- Export ----------

export function setExportFormats(p: Project, formats: Format[]): Project {
  if (p.exportState.done || p.job) return p;
  return { ...p, exportState: { ...p.exportState, formats } };
}

export function setResolution(p: Project, resolution: Resolution): Project {
  if (p.exportState.done || p.job) return p;
  return { ...p, exportState: { ...p.exportState, resolution } };
}

/** Credits an export costs: 1 per video, 1 more for 4K unless the plan includes it. */
export function exportCost(p: Project, fourKIncluded = false): number {
  // 1440p and 4K finish on the studio server with an upscale, so they cost a credit more.
  const big = p.exportState.resolution === '4K' || p.exportState.resolution === '1440p';
  return big && !fourKIncluded ? 2 : 1;
}

export function exportVideo(p: Project, cost = exportCost(p), opts: { external?: boolean } = {}): Project {
  if (p.job || !p.final.locked || p.exportState.done || p.exportState.formats.length === 0) return p;
  const n = p.exportState.formats.length;
  const label = `Rendering ${n === 1 ? 'your video' : `${n} formats`} in ${p.exportState.resolution}`;
  return startJob({ ...p, exportState: { ...p.exportState, creditsCharged: cost } }, 'export', label, 4200, opts.external);
}

// ---------- Ideas and chat ----------

export function addUserMessage(p: Project, text: string): Project {
  return post(p, 'user', text);
}

export function addDirectorMessage(p: Project, text: string, extra: Partial<Message> = {}): Project {
  return post(p, 'director', text, extra);
}

export function addSystemMessage(p: Project, text: string): Project {
  return post(p, 'system', text);
}

export function addIdea(p: Project, text: string, stage: StageId | 'brief'): Project {
  let next: Project = { ...p, ideas: [...p.ideas, { id: uid('idea'), text, stage, at: Date.now() }] };
  if (stage === 'broll' && !next.broll.approved) next = addBrollIdea(next, text, true);
  return next;
}

// ---------- Going back ----------

function resetStage(p: Project, id: StageId): Project {
  switch (id) {
    case 'song':
      return p.song ? { ...p, song: { ...p.song, analyzed: false } } : p;
    case 'shoot':
      return { ...p, shootLocked: false };
    case 'cut':
      return { ...p, cut: { ...p.cut, segments: [], locked: false } };
    case 'looks':
      return { ...p, plates: 'none', planApproved: false };
    case 'switch':
      // Finished renders are kept: a touch-up only re-switches what changed.
      return { ...p, renders: saveRenders(p), shots: [] };
    case 'broll':
      // Clips already made stay made (and paid for); the artist keeps, drops or remakes them.
      return { ...p, broll: { approved: false, ideas: p.broll.ideas.map((i) => (i.status === 'approved' ? { ...i, status: 'clip' as const } : i)) } };
    case 'edit':
      return { ...p, final: { builds: 0, locked: false } };
    case 'export':
      return { ...p, exportState: { ...p.exportState, done: false, creditsCharged: 0 } };
  }
}

/**
 * Goes back to a finished stage. That stage and everything after it redo, but nothing paid for is
 * thrown away: switch renders and b-roll clips are kept and reused where they still fit.
 * `quiet` skips the director's stage intro, for touch-ups that say what happens themselves.
 */
export function revisit(p: Project, id: StageId, opts: { quiet?: boolean } = {}): Project {
  const from = STAGE_BY_ID[id].n;
  let next: Project = { ...p, skipped: p.skipped.filter((s) => STAGE_BY_ID[s].n < from) };
  if (next.job && STAGE_BY_ID[next.job.stage].n >= from) next = { ...next, job: undefined };
  for (const stage of STAGES) {
    if (stage.n >= from) next = resetStage(next, stage.id);
  }
  next = post(next, 'system', `Went back to ${STAGE_BY_ID[id].title}.`);
  if (opts.quiet) return next;
  // Going back to the cut means the takes are already in: cut again right away.
  if (id === 'cut' && next.takes.length) return startJob(next, 'cut', 'Sorting takes and cutting on the beat', 2400);
  if (id === 'looks') next = pitchPlan(next);
  const intro = stageIntro(next, id);
  return post(next, 'director', intro.text, { stage: id, attachment: intro.attachment });
}

// ---------- Jobs ----------

function completeJob(p: Project, job: Job): Project {
  let next: Project = { ...p, job: undefined };
  switch (job.stage) {
    case 'song':
      if (next.song) next = { ...next, song: { ...next.song, analyzed: true } };
      break;
    case 'cut':
      // B-roll lands on the new cut right away: gaps covered, cutaways on cut points.
      next = arrangeBroll({ ...next, cut: { ...next.cut, segments: buildCut(next), locked: false } });
      break;
    case 'looks': {
      next = post({ ...next, plates: 'approved' }, 'director', jobResult(next, 'looks')?.text ?? 'Reference frames are in.', { stage: 'switch' });
      return startSwitch(next);
    }
    case 'switch': {
      // A redo pass reports on itself; the first full pass gets the director's summary below.
      const redo = next.shots.some((s) => s.status === 'approved');
      if (redo) {
        const filled = next.shots.some((s) => s.fill && s.status === 'ready');
        next = post(next, 'director', filled ? 'The shots for the spots without b-roll are back. Check them, then approve.' : 'Redo is back. Check it, then approve.', { stage: 'switch' });
        return withIntro(p, next);
      }
      break;
    }
    case 'broll':
      next = { ...next, broll: { ...next.broll, ideas: next.broll.ideas.map((i) => (i.keep && i.status === 'idea' ? { ...i, status: 'clip' as const } : i)) } };
      break;
    case 'edit':
      next = { ...next, final: { ...next.final, builds: next.final.builds + 1 } };
      break;
    case 'export':
      next = recordVersion({ ...next, exportState: { ...next.exportState, done: true } });
      break;
  }
  const result = jobResult(next, job.stage);
  if (result) next = post(next, 'director', result.text, { stage: job.stage, attachment: result.attachment });
  return withIntro(p, next);
}

/** Live pipeline or on-device render: reports progress on a job the engine does not simulate. */
export function setJobProgress(p: Project, progress: number, label?: string): Project {
  if (!p.job) return p;
  return { ...p, job: { ...p.job, progress: clamp(progress, 0, 1), label: label ?? p.job.label } };
}

/** Finishes the running job the same way the simulation would. */
export function finishJob(p: Project): Project {
  if (!p.job) return p;
  return completeJob({ ...p, job: { ...p.job, progress: 1 } }, p.job);
}

/** Stops the running job without results, with a line from the director about what went wrong. */
export function failJob(p: Project, reason: string): Project {
  if (!p.job) return p;
  const stage = p.job.stage;
  let next: Project = { ...p, job: undefined };
  if (stage === 'switch') next = { ...next, shots: next.shots.map((s) => (s.status === 'queued' || s.status === 'rendering' ? { ...s, status: 'failed' as const, error: reason } : s)) };
  if (stage === 'export') next = { ...next, exportState: { ...next.exportState, creditsCharged: 0 } };
  return post(next, 'director', `That didn't go through: ${reason}`, { stage });
}

function advanceSwitch(p: Project, job: Job, dtMs: number): Project {
  let budget = SWITCHX.concurrency - p.shots.filter((s) => s.status === 'rendering').length;
  const shots = p.shots.map((s) => {
    if (s.status === 'rendering') {
      const progress = Math.min(1, s.progress + dtMs / s.workMs);
      return progress >= 1
        ? { ...s, progress: 1, status: 'ready' as const, flag: s.pendingFlag, pendingFlag: undefined }
        : { ...s, progress };
    }
    if (s.status === 'queued' && budget > 0) {
      budget -= 1;
      return { ...s, status: 'rendering' as const };
    }
    return s;
  });
  return switchProgress({ ...p, shots }, { ...job, elapsedMs: job.elapsedMs + dtMs });
}

/** Rolls shot states up into the switch job, and finishes it when nothing is left in flight. */
export function switchProgress(p: Project, job: Job | undefined = p.job): Project {
  if (!job || job.stage !== 'switch') return p;
  const shots = p.shots;
  const active = shots.filter((s) => s.status === 'queued' || s.status === 'rendering');
  const total = shots.length || 1;
  const done = shots.reduce((sum, s) => sum + (s.status === 'rendering' ? s.progress : s.status === 'queued' ? 0 : 1), 0);
  const back = shots.filter((s) => s.status === 'ready' || s.status === 'approved' || s.status === 'failed').length;
  const label = active.length ? `Rendering shot ${Math.min(total, back + 1)} of ${total}, ${SWITCHX.concurrency} at a time` : job.label;
  const next: Project = { ...p, job: { ...job, progress: done / total, label } };
  return active.length ? next : completeJob(next, job);
}

/** Moves the project's running job forward by `dtMs` of simulated time. Live jobs are left alone. */
export function advance(p: Project, dtMs: number): Project {
  const job = p.job;
  if (!job || job.external) return p;
  if (job.stage === 'switch') return advanceSwitch(p, job, dtMs);
  const elapsedMs = job.elapsedMs + dtMs;
  const progress = Math.min(1, elapsedMs / job.durationMs);
  if (progress >= 1) return completeJob({ ...p, job: { ...job, elapsedMs, progress: 1 } }, job);
  return { ...p, job: { ...job, elapsedMs, progress } };
}

/** Runs a project's simulated jobs to completion. Used to build sample projects and in tests. */
export function settle(p: Project, stepMs = 250, maxSteps = 10000): Project {
  let next = p;
  for (let i = 0; i < maxSteps && next.job && !next.job.external; i++) next = advance(next, stepMs);
  return next;
}

export { currentStage };

/** Remembers the files an on-device export produced, so they can be saved again later. */
export function setExportFiles(p: Project, files: NonNullable<Project['exportState']['files']>): Project {
  return { ...p, exportState: { ...p.exportState, files } };
}
