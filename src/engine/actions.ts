import { jobResult, stageIntro } from './director';
import { emptyEffects, planForPack } from './fx';
import { DEFAULT_TAKE_PLAN, sampleBroll, sampleSwaps, songFromTrack, suggestedLocations, type SampleTrack } from './samples';
import { canSkip, currentStage, STAGE_BY_ID, STAGES } from './stages';
import type {
  CutSegment,
  FxEffectId,
  FxIntensity,
  FxPackId,
  Format,
  Job,
  LocationKind,
  Message,
  Project,
  Resolution,
  Shot,
  StageId,
  Take,
  TakeAngle,
  TakeScope,
  Vibe,
} from './types';

// Pure project transitions. Every function returns a new project and never mutates its input.
// The store calls these; tests call them directly.

/** Frames per second the recorder shoots and the switch is billed at. */
export const FPS = 24;
/** Most frames SwitchX takes in one job (10 seconds at 24 fps). */
export const MAX_SHOT_FRAMES = 240;
/** Shots the switch renders at once (Beeble's default concurrency). */
export const SWITCH_CONCURRENCY = 5;
/** Extra source seconds kept on each side of a cut for the edit. */
export const HANDLE_SEC = 0.5;

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
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

function startJob(p: Project, stage: StageId, label: string, durationMs: number): Project {
  const job: Job = { id: uid('job'), stage, label, progress: 0, elapsedMs: 0, durationMs };
  return { ...p, job };
}

export const PROTOTYPE_NOTE = "Prototype: the director's replies are scripted samples.";

export function blankProject(title: string, now = Date.now()): Project {
  return {
    id: uid('proj'),
    title,
    isSample: false,
    createdAt: now,
    formats: [],
    takePlan: [],
    takes: [],
    recordLocked: false,
    cut: { segments: [], locked: false },
    locations: {},
    plates: 'none',
    shots: [],
    genjutsu: { swaps: [], status: 'idle' },
    broll: { ideas: [], approved: false },
    fx: { intensity: 'Hype', effects: emptyEffects(), locked: false },
    final: { renders: 0, locked: false },
    resize: { formats: [], done: false },
    exportState: { resolution: '1080p', done: false, creditsCharged: 0 },
    skipped: [],
    ideas: [],
    messages: [],
  };
}

/** Stage 1: the song sheet collects the track, vibe and formats, then the track gets analyzed. */
export function createProject(input: { track: SampleTrack; vibe: Vibe; formats: Format[] }): Project {
  let p = blankProject(input.track.title);
  p = post(p, 'system', PROTOTYPE_NOTE);
  p = { ...p, song: songFromTrack(input.track, false), vibe: input.vibe, formats: input.formats };
  const where = input.formats.map(formatName).join(' and ');
  p = post(p, 'director', `Locked in: "${input.track.title}", ${input.vibe.toLowerCase()} vibe, cut for ${where}. Give me a second to map the track.`, { stage: 'song' });
  return startJob(p, 'song', 'Mapping your track: vocals, beats, lyrics', 4000);
}

/** Stage 1 again, after going back: new track, vibe or formats, then a fresh analysis. */
export function updateSong(p: Project, input: { track: SampleTrack; vibe: Vibe; formats: Format[] }): Project {
  if (p.job) return p;
  let next: Project = { ...p, title: input.track.title, song: songFromTrack(input.track, false), vibe: input.vibe, formats: input.formats };
  next = post(next, 'director', `Locked in: "${input.track.title}", ${input.vibe.toLowerCase()} vibe. Mapping the track again.`, { stage: 'song' });
  return startJob(next, 'song', 'Mapping your track: vocals, beats, lyrics', 4000);
}

export function formatName(f: Format): string {
  return f === '16:9' ? 'YouTube' : f === '9:16' ? 'Reels and TikTok' : 'square posts';
}

// ---------- Record ----------

const LAGS = [42, 38, 51, 40, 47, 36];

export function recordTake(p: Project, angle: TakeAngle, scope: TakeScope): Project {
  const song = p.song;
  if (!song) return p;
  const n = p.takes.length + 1;
  const hooks = song.sections.filter((s) => s.kind === 'hook');
  const start = scope === 'Hook only' && hooks.length ? hooks[0].start : 0;
  const end = scope === 'Hook only' && hooks.length ? hooks[hooks.length - 1].end : song.durationSec;
  const take: Take = {
    id: uid('take'),
    n,
    angle,
    scope,
    lagMs: LAGS[(n - 1) % LAGS.length],
    start,
    end,
    flag: n === 4 ? 'Drifts out of frame at 1:12, I will cut around it' : undefined,
  };
  const before = p;
  let next: Project = { ...p, takes: [...p.takes, take] };
  next = post(next, 'director', `Take ${n} saved: ${angle.toLowerCase()}, ${scope.toLowerCase()}. Lined up with the song, ${take.lagMs} ms of phone lag removed.${take.flag ? ` ${take.flag}.` : ''}`, { stage: 'record' });
  return withIntro(before, next);
}

export function finishRecording(p: Project): Project {
  if (p.takes.length === 0) return p;
  const before = p;
  let next: Project = { ...p, recordLocked: true };
  next = withIntro(before, next);
  return startJob(next, 'roughcut', 'Cutting the performance on the beat', 3500);
}

/** Cuts every section into 4-bar shots and picks a take for each one. */
export function buildCut(p: Project): CutSegment[] {
  const song = p.song;
  if (!song || p.takes.length === 0) return [];
  const bar = (4 * 60) / song.bpm;
  const len = bar * 4;
  const byAngle = (a: TakeAngle) => p.takes.filter((t) => t.angle === a);
  const full = p.takes.filter((t) => t.scope === 'Full song');
  const verseRotation = [...byAngle('Wide'), ...byAngle('Close-up'), ...byAngle('Second outfit')].filter((t) => t.scope === 'Full song');
  const hookRotation = [...byAngle('Low angle'), ...byAngle('Close-up')];
  const segments: CutSegment[] = [];
  for (const section of song.sections) {
    let t = section.start;
    let i = 0;
    while (t < section.end - 0.01) {
      const end = Math.min(section.end, t + len);
      const pool = section.kind === 'hook' && hookRotation.length ? hookRotation : verseRotation.length ? verseRotation : full.length ? full : p.takes;
      const take = pool[i % pool.length];
      segments.push({ id: uid('seg'), sectionId: section.id, start: round(t), end: round(end), takeId: take.id });
      t = end;
      i += 1;
    }
  }
  return segments;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function swapSegmentTake(p: Project, segmentId: string, takeId: string): Project {
  if (p.cut.locked) return p;
  return { ...p, cut: { ...p.cut, segments: p.cut.segments.map((s) => (s.id === segmentId ? { ...s, takeId } : s)) } };
}

export function lockCut(p: Project): Project {
  if (p.cut.segments.length === 0) return p;
  const before = p;
  const locations = p.song ? { ...suggestedLocations(p.song.sections), ...p.locations } : p.locations;
  const next: Project = { ...p, cut: { ...p.cut, locked: true }, locations };
  return withIntro(before, next);
}

// ---------- Location ----------

export function setLocation(p: Project, sectionId: string, location: LocationKind): Project {
  if (p.plates === 'approved' || p.job) return p;
  return { ...p, locations: { ...p.locations, [sectionId]: location }, plates: 'none' };
}

export function makePlates(p: Project): Project {
  const sections = p.song?.sections ?? [];
  if (!sections.every((s) => p.locations[s.id])) return p;
  return startJob({ ...p, plates: 'none' }, 'location', 'Making a location plate for each section', 4000);
}

export function approvePlates(p: Project): Project {
  if (p.plates !== 'ready') return p;
  return withIntro(p, { ...p, plates: 'approved' });
}

// ---------- Switch ----------

/** One switch job per shot in the cut, with handles, never longer than the provider allows. */
export function buildShots(p: Project): Shot[] {
  const duration = p.song?.durationSec ?? 0;
  return p.cut.segments.map((seg, i) => {
    const start = Math.max(0, seg.start - HANDLE_SEC);
    const end = Math.min(duration, seg.end + HANDLE_SEC);
    const frames = Math.min(MAX_SHOT_FRAMES, Math.ceil((end - start) * FPS));
    return {
      id: uid('shot'),
      n: i + 1,
      segmentId: seg.id,
      sectionId: seg.sectionId,
      takeId: seg.takeId,
      start: round(start),
      end: round(start + frames / FPS),
      frames,
      status: 'queued',
      progress: 0,
      workMs: 900 + ((i * 337) % 700),
      pendingFlag: i === 6 ? 'Hand blur on the mic, check the edge' : i === 18 ? 'Slight flicker in the hair outline' : undefined,
    };
  });
}

export function startSwitch(p: Project): Project {
  if (p.plates !== 'approved' || p.job) return p;
  const shots = buildShots(p);
  return startJob({ ...p, shots }, 'switch', `Switching ${shots.length} shots, 5 at a time`, 0);
}

export function approveShot(p: Project, shotId: string): Project {
  const before = p;
  const next: Project = {
    ...p,
    shots: p.shots.map((s) => (s.id === shotId && s.status === 'ready' ? { ...s, status: 'approved', flag: undefined } : s)),
  };
  return withIntro(before, next);
}

export function redoShot(p: Project, shotId: string): Project {
  const shot = p.shots.find((s) => s.id === shotId);
  if (!shot || shot.status === 'queued' || shot.status === 'rendering') return p;
  let next: Project = {
    ...p,
    shots: p.shots.map((s) => (s.id === shotId ? { ...s, status: 'queued', progress: 0, flag: undefined } : s)),
  };
  next = post(next, 'director', `Redoing shot ${shot.n}. Same plate, new seed.`, { stage: 'switch' });
  if (!next.job) next = startJob(next, 'switch', `Redoing shot ${shot.n}`, 0);
  return next;
}

export function approveAllShots(p: Project): Project {
  if (p.job) return p;
  const before = p;
  const next: Project = { ...p, shots: p.shots.map((s) => (s.status === 'ready' ? { ...s, status: 'approved', flag: undefined } : s)) };
  return withIntro(before, next);
}

// ---------- Optional stages ----------

export function skipStage(p: Project, stage: StageId): Project {
  if (!canSkip(stage) || p.skipped.includes(stage) || p.job) return p;
  const before = p;
  let next: Project = { ...p, skipped: [...p.skipped, stage] };
  next = post(next, 'system', `Skipped ${STAGE_BY_ID[stage].title}.`);
  return withIntro(before, next);
}

export function ensureSwaps(p: Project): Project {
  return p.genjutsu.swaps.length ? p : { ...p, genjutsu: { ...p.genjutsu, swaps: sampleSwaps() } };
}

export function toggleSwap(p: Project, swapId: string): Project {
  if (p.genjutsu.status !== 'idle') return p;
  return {
    ...p,
    genjutsu: { ...p.genjutsu, swaps: p.genjutsu.swaps.map((s) => (s.id === swapId ? { ...s, selected: !s.selected } : s)) },
  };
}

export function runSwaps(p: Project): Project {
  const count = p.genjutsu.swaps.filter((s) => s.selected).length;
  if (count === 0 || p.job) return p;
  return startJob(p, 'genjutsu', `Running ${count} ${count === 1 ? 'swap' : 'swaps'}`, 4000);
}

export function keepSwaps(p: Project): Project {
  if (p.genjutsu.status !== 'ready') return p;
  return withIntro(p, { ...p, genjutsu: { ...p.genjutsu, status: 'done' } });
}

export function ensureBroll(p: Project): Project {
  if (p.broll.ideas.some((i) => !i.fromInbox) || !p.song) return p;
  return { ...p, broll: { ...p.broll, ideas: [...sampleBroll(p.song.sections), ...p.broll.ideas] } };
}

export function toggleBrollKeep(p: Project, ideaId: string): Project {
  if (p.broll.approved) return p;
  return { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => (i.id === ideaId ? { ...i, keep: !i.keep } : i)) } };
}

export function generateBroll(p: Project): Project {
  const count = p.broll.ideas.filter((i) => i.keep).length;
  if (count === 0 || p.job) return p;
  return startJob(p, 'broll', `Generating ${count} b-roll ${count === 1 ? 'clip' : 'clips'}`, 5000);
}

export function approveBroll(p: Project): Project {
  if (!p.broll.ideas.some((i) => i.status === 'clip')) return p;
  const ideas = p.broll.ideas.map((i) => (i.status === 'clip' && i.keep ? { ...i, status: 'approved' as const } : i));
  return withIntro(p, { ...p, broll: { ideas, approved: true } });
}

// ---------- VFX ----------

export function setFxPack(p: Project, pack: FxPackId): Project {
  if (p.fx.locked) return p;
  return { ...p, fx: planForPack(pack, p.fx.intensity) };
}

export function setFxIntensity(p: Project, intensity: FxIntensity): Project {
  if (p.fx.locked) return p;
  return { ...p, fx: { ...p.fx, intensity } };
}

export function toggleEffect(p: Project, effect: FxEffectId): Project {
  if (p.fx.locked) return p;
  return { ...p, fx: { ...p.fx, effects: { ...p.fx.effects, [effect]: !p.fx.effects[effect] } } };
}

export function lockFx(p: Project): Project {
  if (!p.fx.pack) return p;
  return withIntro(p, { ...p, fx: { ...p.fx, locked: true } });
}

// ---------- Ship ----------

export function renderFinal(p: Project): Project {
  if (p.job || !p.fx.locked) return p;
  return startJob(p, 'final', 'Stitching the final edit', 4500);
}

export function lockFinal(p: Project): Project {
  if (p.final.renders === 0) return p;
  const next: Project = { ...p, final: { ...p.final, locked: true }, resize: { ...p.resize, formats: p.resize.formats.length ? p.resize.formats : p.formats } };
  return withIntro(p, next);
}

export function setResizeFormats(p: Project, formats: Format[]): Project {
  if (p.resize.done) return p;
  return { ...p, resize: { ...p.resize, formats } };
}

export function renderFormats(p: Project): Project {
  if (p.job || p.resize.formats.length === 0) return p;
  const n = p.resize.formats.length;
  return startJob(p, 'resize', `Rendering ${n} ${n === 1 ? 'format' : 'formats'}`, 3500);
}

export function setResolution(p: Project, resolution: Resolution): Project {
  if (p.exportState.done) return p;
  return { ...p, exportState: { ...p.exportState, resolution } };
}

/** Credits an export costs: 1 per video, 1 more for 4K unless the plan includes it. */
export function exportCost(p: Project, fourKIncluded = false): number {
  return p.exportState.resolution === '4K' && !fourKIncluded ? 2 : 1;
}

export function exportVideo(p: Project, cost = exportCost(p)): Project {
  if (p.job || !p.resize.done) return p;
  const label = p.exportState.resolution === '4K' ? 'Upscaling to 4K and exporting' : 'Upscaling to 1080p and exporting';
  return startJob({ ...p, exportState: { ...p.exportState, creditsCharged: cost } }, 'export', label, 4500);
}

// ---------- Ideas and chat ----------

export function addUserMessage(p: Project, text: string): Project {
  return post(p, 'user', text);
}

export function addDirectorMessage(p: Project, text: string): Project {
  return post(p, 'director', text);
}

export function addIdea(p: Project, text: string, stage: StageId | 'brief'): Project {
  let next: Project = { ...p, ideas: [...p.ideas, { id: uid('idea'), text, stage, at: Date.now() }] };
  if (stage === 'broll' && !next.broll.approved) {
    next = {
      ...next,
      broll: {
        ...next.broll,
        ideas: [...next.broll.ideas, { id: uid('broll'), lyric: 'From your idea inbox', shot: text, status: 'idea', keep: true, fromInbox: true }],
      },
    };
  }
  return next;
}

// ---------- Going back ----------

function resetStage(p: Project, id: StageId): Project {
  switch (id) {
    case 'song':
      return p.song ? { ...p, song: { ...p.song, analyzed: false } } : p;
    case 'record':
      return { ...p, recordLocked: false };
    case 'roughcut':
      return { ...p, cut: { segments: [], locked: false } };
    case 'location':
      return { ...p, plates: 'none' };
    case 'switch':
      return { ...p, shots: [] };
    case 'genjutsu':
      return { ...p, genjutsu: { ...p.genjutsu, status: 'idle' } };
    case 'broll':
      return { ...p, broll: { approved: false, ideas: p.broll.ideas.map((i) => ({ ...i, status: 'idea' as const })) } };
    case 'vfx':
      return { ...p, fx: { ...p.fx, locked: false } };
    case 'final':
      return { ...p, final: { renders: 0, locked: false } };
    case 'resize':
      return { ...p, resize: { ...p.resize, done: false } };
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
  const intro = stageIntro(next, id);
  return post(next, 'director', intro.text, { stage: id, attachment: intro.attachment });
}

// ---------- Simulated jobs ----------

function completeJob(p: Project, job: Job): Project {
  let next: Project = { ...p, job: undefined };
  switch (job.stage) {
    case 'song':
      if (next.song) next = { ...next, song: { ...next.song, analyzed: true }, takePlan: next.takePlan.length ? next.takePlan : DEFAULT_TAKE_PLAN };
      break;
    case 'roughcut':
      next = { ...next, cut: { segments: buildCut(next), locked: false } };
      break;
    case 'location':
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
    case 'genjutsu':
      next = { ...next, genjutsu: { ...next.genjutsu, status: 'ready' } };
      break;
    case 'broll':
      next = { ...next, broll: { ...next.broll, ideas: next.broll.ideas.map((i) => (i.keep ? { ...i, status: 'clip' as const } : i)) } };
      break;
    case 'final':
      next = { ...next, final: { ...next.final, renders: next.final.renders + 1 } };
      break;
    case 'resize':
      next = { ...next, resize: { ...next.resize, done: true } };
      break;
    case 'export':
      next = { ...next, exportState: { ...next.exportState, done: true } };
      break;
    default:
      break;
  }
  const result = jobResult(next, job.stage);
  if (result) next = post(next, 'director', result.text, { stage: job.stage, attachment: result.attachment });
  return withIntro(p, next);
}

function advanceSwitch(p: Project, job: Job, dtMs: number): Project {
  let budget = SWITCH_CONCURRENCY - p.shots.filter((s) => s.status === 'rendering').length;
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
  const active = shots.filter((s) => s.status === 'queued' || s.status === 'rendering');
  const total = shots.length || 1;
  const done = shots.reduce((sum, s) => sum + (s.status === 'rendering' ? s.progress : s.status === 'queued' ? 0 : 1), 0);
  const ready = shots.filter((s) => s.status === 'ready' || s.status === 'approved').length;
  const label = active.length ? `Rendering shot ${Math.min(total, ready + 1)} of ${total}, 5 at a time` : job.label;
  const next: Project = { ...p, shots, job: { ...job, elapsedMs: job.elapsedMs + dtMs, progress: done / total, label } };
  return active.length ? next : completeJob(next, job);
}

/** Moves the project's running job forward by `dtMs` of simulated time. */
export function advance(p: Project, dtMs: number): Project {
  const job = p.job;
  if (!job) return p;
  if (job.stage === 'switch') return advanceSwitch(p, job, dtMs);
  const elapsedMs = job.elapsedMs + dtMs;
  const progress = Math.min(1, elapsedMs / job.durationMs);
  if (progress >= 1) return completeJob({ ...p, job: { ...job, elapsedMs, progress: 1 } }, job);
  return { ...p, job: { ...job, elapsedMs, progress } };
}

/** Runs a project's jobs to completion. Used to build sample projects and in tests. */
export function settle(p: Project, stepMs = 250, maxSteps = 10000): Project {
  let next = p;
  for (let i = 0; i < maxSteps && next.job; i++) next = advance(next, stepMs);
  return next;
}

export { currentStage };
