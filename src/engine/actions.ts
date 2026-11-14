import { jobResult, stageIntro, takeLine } from './director';
import { emptyEffects, planForPack } from './fx';
import { barSec, DEFAULT_TAKE_PLAN, lookFor, pitchBroll, suggestedLooks } from './samples';
import { canSkip, currentStage, STAGE_BY_ID, STAGES } from './stages';
import { framesFor, HANDLE_SEC, maxShotSec, RECORD_FPS, SWITCHX } from './switchx';
import type {
  Autonomy,
  BrollIdea,
  BrollModel,
  Clip,
  CutSegment,
  FxEffectId,
  FxIntensity,
  FxPackId,
  Format,
  Job,
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
} from './types';

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
  const intro = stageIntro(after, next);
  return post(after, 'director', intro.text, { stage: next, attachment: intro.attachment });
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
  vibe: Vibe;
  formats: Format[];
  pipeline?: Project['pipeline'];
}

export function formatName(f: Format): string {
  return f === '16:9' ? 'YouTube' : f === '9:16' ? 'Reels and TikTok' : 'square posts';
}

/** Stage 1: the track, vibe and formats. An imported track arrives already mapped. */
export function createProject(input: NewProjectInput): Project {
  let p = blankProject(input.song.title);
  p = { ...p, pipeline: input.pipeline ?? 'demo' };
  p = post(p, 'system', p.pipeline === 'live' ? LIVE_NOTE : DEMO_NOTE);
  return setSong(p, input, true);
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
  let next: Project = {
    ...p,
    song: input.song,
    vibe: input.vibe,
    formats: input.formats,
    exportState: { ...p.exportState, formats: input.formats },
    takePlan: p.takePlan.length ? p.takePlan : DEFAULT_TAKE_PLAN,
  };
  const lead = `Locked in: "${input.song.title}", ${input.vibe.toLowerCase()} vibe${first ? `, cut for ${where}` : ''}.`;
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
  return post({ ...p, pipeline }, 'system', pipeline === 'live' ? LIVE_NOTE : DEMO_NOTE);
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
}

export function addTake(p: Project, input: NewTake): Project {
  const song = p.song;
  if (!song || p.shootLocked) return p;
  const n = p.takes.reduce((max, t) => Math.max(max, t.n), 0) + 1;
  const start = clamp(input.fromSec, 0, song.durationSec);
  const end = clamp(start + input.durationSec, start, song.durationSec);
  if (end - start < 0.5) return p;
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
  };
  const before = p;
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
  const next: Project = { ...p, clips: [...p.clips, clip] };
  return post(next, 'director', `"${clip.label}" has no song in it, so I can't line it up as a take. I'll keep it as a cutaway.`, { stage: 'shoot' });
}

export function removeClip(p: Project, clipId: string): Project {
  return { ...p, clips: p.clips.filter((c) => c.id !== clipId) };
}

/** How much of the song at least one take covers, 0 to 1. */
export function coverage(p: Project): number {
  const song = p.song;
  if (!song || song.durationSec <= 0) return 0;
  const spans = p.takes.map((t) => [t.start, t.end] as [number, number]).sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = 0;
  for (const [s, e] of spans) {
    const from = Math.max(s, cursor);
    if (e > from) {
      covered += e - from;
      cursor = e;
    }
  }
  return Math.min(1, covered / song.durationSec);
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

/**
 * Cuts the song on the bar grid and picks a take for every shot.
 * Hooks cut faster and favor the low angle; a take is never used twice in a row when another one covers the shot.
 * Parts of the song that no take covers come back with an empty takeId.
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

  for (const section of song.sections) {
    let length = (section.kind === 'hook' ? hookBars : verseBars) * bar;
    while (length > longest && length > bar / 2) length /= 2;
    let t = section.start;
    while (t < section.end - 0.01) {
      let end = Math.min(section.end, t + length);
      // Fold a short tail into the last shot instead of leaving a sliver.
      if (section.end - end < bar * 0.5 && section.end - t <= longest) end = section.end;
      const edges = [t, end];
      for (const take of p.takes) {
        if (take.start > t + 0.25 && take.start < end - 0.25) edges.push(take.start);
        if (take.end > t + 0.25 && take.end < end - 0.25) edges.push(take.end);
      }
      edges.sort((a, b) => a - b);
      for (let i = 0; i < edges.length - 1; i++) {
        const from = edges[i];
        const to = edges[i + 1];
        const hook = section.kind === 'hook';
        const pool = p.takes.filter((take) => take.start <= from + 0.05 && take.end >= to - 0.05 && (hook || !take.hookOnly));
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
function planOpen(p: Project): boolean {
  return !p.planApproved && p.shots.length === 0 && !p.job;
}

export function swapSegmentTake(p: Project, segmentId: string, takeId: string): Project {
  if (!planOpen(p)) return p;
  const seg = p.cut.segments.find((s) => s.id === segmentId);
  const take = p.takes.find((t) => t.id === takeId);
  if (!seg || !take || take.start > seg.start + 0.05 || take.end < seg.end - 0.05) return p;
  return { ...p, cut: { ...p.cut, segments: p.cut.segments.map((s) => (s.id === segmentId ? { ...s, takeId } : s)) } };
}

/** Same takes, a different cut: new rhythm and a new order of angles. */
export function reshuffleCut(p: Project): Project {
  if (!planOpen(p) || p.cut.segments.length === 0) return p;
  const seed = p.cut.seed + 1;
  const next: Project = { ...p, cut: { ...p.cut, seed, segments: buildCut(p, seed) } };
  return post(next, 'director', `Shuffled. ${cutLine(next)}`, { stage: 'cut' });
}

export function cutLine(p: Project): string {
  const shots = p.cut.segments.filter((s) => s.takeId).length;
  const [verseBars, hookBars] = RHYTHMS[Math.abs(p.cut.seed) % RHYTHMS.length];
  return `${shots} shots: hooks cut every ${hookBars === 1 ? 'bar' : `${hookBars} bars`}, verses every ${verseBars}.`;
}

/** Locks the cut and pitches the rest of the video: looks, b-roll and an effects pack. */
export function lockCut(p: Project): Project {
  if (p.cut.segments.length === 0 || p.cut.locked) return p;
  const before = p;
  const song = p.song;
  const looks = song ? { ...suggestedLooks(song.sections), ...p.looks } : p.looks;
  const pitched = song ? pitchBroll(song, p.vibe) : [];
  const inbox = p.broll.ideas.filter((i) => i.fromInbox);
  const ideas = p.broll.ideas.some((i) => !i.fromInbox) ? p.broll.ideas : [...pitched, ...inbox];
  const fx = p.fx.pack || !p.vibe ? p.fx : planForPack(VIBE_PACK[p.vibe], p.fx.intensity);
  const next: Project = { ...p, cut: { ...p.cut, locked: true }, looks, broll: { ...p.broll, ideas }, fx };
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

/** The artist signs off on the plan. In autopilot the director runs everything after this. */
export function approvePlan(p: Project): Project {
  const sections = p.song?.sections ?? [];
  if (p.planApproved || !p.cut.locked || !sections.every((s) => p.looks[s.id])) return p;
  const next: Project = { ...p, planApproved: true };
  return post(next, 'director', "Running it. Reference frames first, then the switch. I'll stop if a shot needs you.", { stage: 'looks' });
}

export function makePlates(p: Project): Project {
  const sections = p.song?.sections ?? [];
  if (p.job || !p.planApproved || p.plates !== 'none' || !sections.every((s) => p.looks[s.id])) return p;
  return startJob(p, 'looks', 'Building a reference frame for each look', 3200);
}

export function approvePlates(p: Project): Project {
  if (p.plates !== 'ready') return p;
  return withIntro(p, { ...p, plates: 'approved' });
}

// ---------- Switch ----------

/**
 * One switch job per run of the cut: neighboring shots from the same take in the same section
 * go up together, with handles, and never longer than the provider takes in one generation.
 */
export function buildShots(p: Project, maxFrames: number = p.switchSettings.maxFrames): Shot[] {
  const takes = new Map(p.takes.map((t) => [t.id, t]));
  const runs: { takeId: string; sectionId: string; start: number; end: number }[] = [];
  for (const seg of p.cut.segments) {
    const take = takes.get(seg.takeId);
    if (!take) continue;
    const limit = maxFrames / take.fps - 2 * HANDLE_SEC;
    const last = runs[runs.length - 1];
    if (last && last.takeId === seg.takeId && last.sectionId === seg.sectionId && Math.abs(last.end - seg.start) < 0.01 && seg.end - last.start <= limit) {
      last.end = seg.end;
    } else {
      runs.push({ takeId: seg.takeId, sectionId: seg.sectionId, start: seg.start, end: seg.end });
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
    return {
      id: uid('shot'),
      n: i + 1,
      sectionId: run.sectionId,
      takeId: run.takeId,
      start: round(start),
      end: round(end),
      frames,
      fps: take.fps,
      status: 'queued',
      progress: 0,
      workMs: 900 + ((i * 337) % 700),
      pendingFlag: !p.isSample && take.source !== 'sample' ? undefined : i === 3 ? 'Hand blur on the mic, check the edge' : i === 11 ? 'Flicker in the hair outline' : undefined,
    };
  });
}

export function startSwitch(p: Project, opts: { external?: boolean } = {}): Project {
  if (p.plates !== 'approved' || p.job || p.shots.length > 0) return p;
  const shots = buildShots(p);
  if (shots.length === 0) return p;
  return startJob({ ...p, shots }, 'switch', `Switching ${shots.length} shots, ${SWITCHX.concurrency} at a time`, 0, opts.external);
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
  if (!next.job) next = startJob(next, 'switch', `Redoing shot ${shot.n}`, 0, opts.external);
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
  return withIntro(before, next);
}

export function toggleBrollKeep(p: Project, ideaId: string): Project {
  if (p.broll.approved) return p;
  return { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => (i.id === ideaId ? { ...i, keep: !i.keep } : i)) } };
}

export function setBrollModel(p: Project, model: BrollModel): Project {
  if (p.broll.approved || p.job) return p;
  return { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => (i.status === 'idea' ? { ...i, model } : i)) } };
}

export function addBrollIdea(p: Project, shot: string, fromInbox = false): Project {
  if (p.broll.approved) return p;
  const song = p.song;
  const bar = song ? barSec(song.bpm) : 2;
  const model = p.broll.ideas[0]?.model ?? 'omni';
  // Put it on the first verse bar that has no cutaway yet.
  let at: number | undefined;
  let sectionId: string | undefined;
  if (song) {
    const taken = p.broll.ideas.map((i) => i.at ?? -1);
    outer: for (const s of song.sections.filter((x) => x.kind === 'verse' || x.kind === 'hook')) {
      for (let t = s.start + 2 * bar; t < s.end - 2 * bar; t += 4 * bar) {
        if (!taken.some((x) => Math.abs(x - t) < 2 * bar)) {
          at = round(t);
          sectionId = s.id;
          break outer;
        }
      }
    }
  }
  const idea: BrollIdea = {
    id: uid('broll'),
    lyric: fromInbox ? 'From your idea inbox' : 'Your idea',
    shot,
    sectionId,
    at,
    durationSec: round(Math.max(3, bar * 2)),
    status: 'idea',
    keep: true,
    fromInbox: fromInbox || undefined,
    model,
  };
  return { ...p, broll: { ...p.broll, ideas: [...p.broll.ideas, idea] } };
}

export function generateBroll(p: Project, opts: { external?: boolean } = {}): Project {
  const count = p.broll.ideas.filter((i) => i.keep && i.status === 'idea').length;
  if (count === 0 || p.job || p.broll.approved) return p;
  return startJob(p, 'broll', `Generating ${count} b-roll ${count === 1 ? 'clip' : 'clips'}`, 4200, opts.external);
}

export function updateBroll(p: Project, ideaId: string, patch: Partial<Pick<BrollIdea, 'status' | 'remoteId' | 'url' | 'mediaId'>>): Project {
  return { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => (i.id === ideaId ? { ...i, ...patch } : i)) } };
}

export function approveBroll(p: Project): Project {
  if (!p.broll.ideas.some((i) => i.status === 'clip') || p.broll.approved) return p;
  const ideas = p.broll.ideas.map((i) => (i.status === 'clip' && i.keep ? { ...i, status: 'approved' as const } : i));
  return withIntro(p, { ...p, broll: { ideas, approved: true } });
}

// ---------- Edit ----------

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
  return p.exportState.resolution === '4K' && !fourKIncluded ? 2 : 1;
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
      return { ...p, shots: [] };
    case 'broll':
      return { ...p, broll: { approved: false, ideas: p.broll.ideas.map((i) => ({ ...i, status: 'idea' as const, remoteId: undefined, url: undefined, mediaId: undefined })) } };
    case 'edit':
      return { ...p, final: { builds: 0, locked: false } };
    case 'export':
      return { ...p, exportState: { ...p.exportState, done: false, creditsCharged: 0 } };
  }
}

/** Goes back to a finished stage. That stage and everything after it redo. */
export function revisit(p: Project, id: StageId): Project {
  const from = STAGE_BY_ID[id].n;
  let next: Project = { ...p, skipped: p.skipped.filter((s) => STAGE_BY_ID[s].n < from) };
  if (next.job && STAGE_BY_ID[next.job.stage].n >= from) next = { ...next, job: undefined };
  for (const stage of STAGES) {
    if (stage.n >= from) next = resetStage(next, stage.id);
  }
  next = post(next, 'system', `Went back to ${STAGE_BY_ID[id].title}.`);
  // Going back to the cut means the takes are already in: cut again right away.
  if (id === 'cut' && next.takes.length) return startJob(next, 'cut', 'Sorting takes and cutting on the beat', 2400);
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
      next = { ...next, cut: { ...next.cut, segments: buildCut(next), locked: false } };
      break;
    case 'looks':
      next = { ...next, plates: 'ready' };
      break;
    case 'switch': {
      // A redo pass reports on itself; the first full pass gets the director's summary below.
      const redo = next.shots.some((s) => s.status === 'approved');
      if (redo) {
        next = post(next, 'director', 'Redo is back. Check it, then approve.', { stage: 'switch' });
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
      next = { ...next, exportState: { ...next.exportState, done: true } };
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
