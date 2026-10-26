import type { ActId, Project, StageId, StageStatus } from './types';

export interface StageDef {
  id: StageId;
  n: number;
  act: ActId;
  title: string;
  optional: boolean;
  /** What the user does at this stage, in their words. */
  summary: string;
}

export const ACTS: { id: ActId; title: string }[] = [
  { id: 'shoot', title: 'Shoot' },
  { id: 'set', title: 'Set' },
  { id: 'style', title: 'Style' },
  { id: 'ship', title: 'Ship' },
];

export const STAGES: StageDef[] = [
  { id: 'song', n: 1, act: 'shoot', title: 'Song', optional: false, summary: 'Upload the track, pick a vibe and formats' },
  { id: 'record', n: 2, act: 'shoot', title: 'Record', optional: false, summary: 'Rap along to the song, as many takes as you want' },
  { id: 'roughcut', n: 3, act: 'shoot', title: 'Rough cut', optional: false, summary: 'Approve the performance cut on the beat' },
  { id: 'location', n: 4, act: 'set', title: 'Location', optional: false, summary: 'Pick a look for each section of the song' },
  { id: 'switch', n: 5, act: 'set', title: 'Switch', optional: false, summary: 'Review every shot in its new location' },
  { id: 'genjutsu', n: 6, act: 'set', title: 'Genjutsu', optional: true, summary: 'Swap your mic, chain or fit' },
  { id: 'broll', n: 7, act: 'style', title: 'B-roll', optional: true, summary: 'Keep the cutaways that match your lyrics' },
  { id: 'vfx', n: 8, act: 'style', title: 'VFX', optional: false, summary: 'Pick an effects pack and how hard it hits' },
  { id: 'final', n: 9, act: 'ship', title: 'Final edit', optional: false, summary: 'Watch the full video and lock it' },
  { id: 'resize', n: 10, act: 'ship', title: 'Resize', optional: false, summary: 'Pick the formats you post to' },
  { id: 'export', n: 11, act: 'ship', title: 'Export', optional: false, summary: 'Pick 1080p or 4K and download' },
];

export const STAGE_BY_ID: Record<StageId, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
) as Record<StageId, StageDef>;

export function stageDef(id: StageId): StageDef {
  return STAGE_BY_ID[id];
}

/** True when the stage's own work is finished (skipping is tracked separately). */
export function isStageDone(p: Project, id: StageId): boolean {
  switch (id) {
    case 'song':
      return !!p.song?.analyzed && !!p.vibe && p.formats.length > 0;
    case 'record':
      return p.takes.length > 0 && p.recordLocked;
    case 'roughcut':
      return p.cut.segments.length > 0 && p.cut.locked;
    case 'location': {
      const sections = p.song?.sections ?? [];
      return sections.length > 0 && sections.every((s) => !!p.locations[s.id]) && p.plates === 'approved';
    }
    case 'switch':
      return p.shots.length > 0 && p.shots.every((s) => s.status === 'approved');
    case 'genjutsu':
      return p.genjutsu.status === 'done';
    case 'broll':
      return p.broll.approved;
    case 'vfx':
      return p.fx.locked;
    case 'final':
      return p.final.locked;
    case 'resize':
      return p.resize.done;
    case 'export':
      return p.exportState.done;
  }
}

export function isSkipped(p: Project, id: StageId): boolean {
  return p.skipped.includes(id);
}

/** The first stage that is neither finished nor skipped. Undefined once the video is exported. */
export function currentStage(p: Project): StageDef | undefined {
  return STAGES.find((s) => !isStageDone(p, s.id) && !isSkipped(p, s.id));
}

/** Results are back and waiting for the user's approval. */
export function needsReview(p: Project, id: StageId): boolean {
  switch (id) {
    case 'roughcut':
      return p.cut.segments.length > 0 && !p.cut.locked;
    case 'location':
      return p.plates === 'ready';
    case 'switch':
      return p.shots.length > 0 && p.shots.every((s) => s.status === 'ready' || s.status === 'approved');
    case 'genjutsu':
      return p.genjutsu.status === 'ready';
    case 'broll':
      return p.broll.ideas.some((i) => i.status === 'clip') && !p.broll.approved;
    case 'final':
      return p.final.renders > 0 && !p.final.locked;
    default:
      return false;
  }
}

export function stageStatus(p: Project, id: StageId): StageStatus {
  if (isSkipped(p, id)) return 'skipped';
  if (isStageDone(p, id)) return 'done';
  const current = currentStage(p);
  if (!current || current.id !== id) return 'locked';
  if (p.job && p.job.stage === id) return 'working';
  if (needsReview(p, id)) return 'needs_you';
  return 'current';
}

export interface TrackerStage {
  def: StageDef;
  status: StageStatus;
  /** 0 to 1 while a job runs for this stage. */
  progress?: number;
}

export interface TrackerView {
  stages: TrackerStage[];
  current?: StageDef;
  currentStatus?: StageStatus;
  /** Stages finished or skipped. */
  completed: number;
  total: number;
  wrapped: boolean;
}

export function trackerView(p: Project): TrackerView {
  const stages = STAGES.map((def) => {
    const status = stageStatus(p, def.id);
    const progress = status === 'working' && p.job ? p.job.progress : undefined;
    return { def, status, progress };
  });
  const current = currentStage(p);
  const completed = stages.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  return {
    stages,
    current,
    currentStatus: current ? stageStatus(p, current.id) : undefined,
    completed,
    total: STAGES.length,
    wrapped: !current,
  };
}

/** Later stages that will have to be redone if the user goes back to `id`. */
export function stagesToRedo(p: Project, id: StageId): StageDef[] {
  const from = STAGE_BY_ID[id].n;
  return STAGES.filter((s) => s.n > from && (isStageDone(p, s.id) || isSkipped(p, s.id)));
}

export function canSkip(id: StageId): boolean {
  return STAGE_BY_ID[id].optional;
}
