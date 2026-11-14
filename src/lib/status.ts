import { trackerView } from '@/engine/stages';
import type { Project, StageId } from '@/engine/types';

const WORKING: Record<StageId, string> = {
  song: 'Mapping the track',
  shoot: 'Saving the take',
  cut: 'Cutting on the beat',
  looks: 'Building references',
  switch: 'Switching shots',
  broll: 'Generating b-roll',
  edit: 'Building the edit',
  export: 'Rendering',
};

/** One line that says where a project stands, for tiles and the slate. */
export function statusLine(p: Project): string {
  const view = trackerView(p);
  if (view.wrapped) return 'Wrapped and exported';
  const stage = view.current!;
  switch (view.currentStatus) {
    case 'working':
      return p.job ? `${WORKING[p.job.stage]}, ${Math.round(p.job.progress * 100)}%` : 'Working';
    case 'needs_you':
      return reviewLine(p, stage.id);
    default:
      return nextLine(p, stage.id);
  }
}

/** What the current stage is waiting on, in the artist's words. */
function nextLine(p: Project, stage: StageId): string {
  switch (stage) {
    case 'song':
      return 'Pick your track';
    case 'shoot': {
      const n = p.takes.length;
      return n === 0 ? 'Record or upload your takes' : `${n} ${n === 1 ? 'take' : 'takes'} in`;
    }
    case 'cut':
      return 'The cut is next';
    case 'looks':
      return 'Reference frames are next';
    case 'switch':
      return 'Ready to switch';
    case 'broll':
      return 'B-roll is next';
    case 'edit':
      return 'The edit is next';
    case 'export':
      return 'Pick formats and export';
  }
}

function reviewLine(p: Project, stage: StageId): string {
  switch (stage) {
    case 'cut':
      return 'Your cut is ready';
    case 'looks':
      return p.planApproved ? 'References are ready' : 'The plan is ready for you';
    case 'switch': {
      const flagged = p.shots.filter((s) => s.flag || s.status === 'failed').length;
      return flagged ? `${flagged} ${flagged === 1 ? 'shot needs' : 'shots need'} a look` : `${p.shots.length} shots ready to review`;
    }
    case 'broll':
      return 'B-roll clips are back';
    case 'edit':
      return 'Your edit is ready to watch';
    default:
      return 'Needs you';
  }
}
