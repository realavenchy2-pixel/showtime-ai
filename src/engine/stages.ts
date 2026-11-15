import type { Project, StageId, StageStatus } from './types';

export interface StageDef {
  id: StageId;
  n: number;
  title: string;
  optional: boolean;
  /** Who moves the stage forward: the artist, or the director on its own. */
  owner: 'artist' | 'director';
  /** What happens at this stage, in the artist's words. */
  summary: string;
}

export const STAGES: StageDef[] = [
  { id: 'song', n: 1, title: 'Song', optional: false, owner: 'artist', summary: 'Bring the track and mark its parts' },
  { id: 'looks', n: 2, title: 'Plan', optional: false, owner: 'artist', summary: 'Where each part takes place, b-roll and effects' },
  { id: 'shoot', n: 3, title: 'Shoot', optional: false, owner: 'artist', summary: 'Record with the song playing, or upload your clips' },
  { id: 'cut', n: 4, title: 'Cut', optional: false, owner: 'director', summary: 'Takes sorted and cut on the beat' },
  { id: 'switch', n: 5, title: 'Switch', optional: false, owner: 'director', summary: 'Every shot moved into its new world' },
  { id: 'broll', n: 6, title: 'B-roll', optional: true, owner: 'director', summary: 'Cutaways that match your lyrics' },
  { id: 'edit', n: 7, title: 'Edit', optional: false, owner: 'director', summary: 'Everything stitched to the song with effects on the beat' },
  { id: 'export', n: 8, title: 'Export', optional: false, owner: 'artist', summary: 'Pick formats and quality, then download' },
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
      return !!p.song?.analyzed && p.formats.length > 0;
    case 'shoot':
      return p.takes.length > 0 && p.shootLocked;
    case 'cut':
      return p.cut.segments.length > 0 && p.cut.locked;
    case 'looks': {
      const sections = p.song?.sections ?? [];
      return sections.length > 0 && sections.every((s) => !!p.looks[s.id]) && p.planApproved;
    }
    case 'switch':
      return p.shots.length > 0 && p.shots.every((s) => s.status === 'approved');
    case 'broll':
      return p.broll.approved;
    case 'edit':
      return p.final.locked;
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

/** Results are back and waiting for the artist. */
export function needsReview(p: Project, id: StageId): boolean {
  switch (id) {
    case 'cut':
      return p.cut.segments.length > 0 && !p.cut.locked;
    case 'switch':
      return p.shots.length > 0 && p.shots.every((s) => s.status === 'ready' || s.status === 'approved' || s.status === 'failed');
    case 'broll':
      return p.broll.ideas.some((i) => i.status === 'clip') && !p.broll.approved;
    case 'edit':
      return p.final.builds > 0 && !p.final.locked;
    default:
      return false;
  }
}

export function stageStatus(p: Project, id: StageId): StageStatus {
  if (isSkipped(p, id)) return 'skipped';
  if (isStageDone(p, id)) return 'done';
  const current = currentStage(p);
  if (!current || current.id !== id) return 'locked';
  // Reference frames are built at the start of the switch, under the plan's job id.
  if (p.job && (p.job.stage === id || (id === 'switch' && p.job.stage === 'looks'))) return 'working';
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

/** Later stages that will have to be redone if the artist goes back to `id`. */
export function stagesToRedo(p: Project, id: StageId): StageDef[] {
  const from = STAGE_BY_ID[id].n;
  return STAGES.filter((s) => s.n > from && (isStageDone(p, s.id) || isSkipped(p, s.id)));
}

export function canSkip(id: StageId): boolean {
  return STAGE_BY_ID[id].optional;
}
