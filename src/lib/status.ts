import { trackerView } from '@/engine/stages';
import type { Project, StageId } from '@/engine/types';

const WORKING: Record<StageId, string> = {
  song: 'Mapping the track',
  record: 'Saving the take',
  roughcut: 'Cutting on the beat',
  location: 'Making plates',
  switch: 'Switching shots',
  genjutsu: 'Running swaps',
  broll: 'Generating b-roll',
  vfx: 'Laying effects',
  final: 'Rendering the final',
  resize: 'Rendering formats',
  export: 'Exporting',
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
      return reviewLine(p);
    default:
      return nextLine(p, stage.id);
  }
}

/** What the current stage is waiting on, in the artist's words. */
function nextLine(p: Project, stage: StageId): string {
  switch (stage) {
    case 'song':
      return 'Pick your track, vibe and formats';
    case 'record': {
      const planned = p.takePlan.length || 4;
      return `${p.takes.length} of ${planned} takes in`;
    }
    case 'roughcut':
      return 'Your cut is next';
    case 'location':
      return p.plates === 'none' ? 'Pick a look for each section' : 'Plates are next';
    case 'switch':
      return `${p.cut.segments.length} shots ready to switch`;
    case 'genjutsu':
      return 'Optional: swap your mic, chain or fit';
    case 'broll':
      return 'Optional: cutaways for your lyrics';
    case 'vfx':
      return 'Pick an effects pack';
    case 'final':
      return 'Ready to stitch the final';
    case 'resize':
      return 'Pick the formats you post to';
    case 'export':
      return 'Pick 1080p or 4K and export';
  }
}

function reviewLine(p: Project): string {
  const stage = trackerView(p).current?.id;
  switch (stage) {
    case 'roughcut':
      return 'Your rough cut is ready to review';
    case 'location':
      return 'Your plates are ready to review';
    case 'switch': {
      const flagged = p.shots.filter((s) => s.flag).length;
      return flagged ? `${p.shots.length} shots back, ${flagged} need a look` : `${p.shots.length} shots ready to review`;
    }
    case 'genjutsu':
      return 'Your swaps are ready to review';
    case 'broll':
      return 'Your b-roll clips are ready';
    case 'final':
      return 'Your final edit is ready to watch';
    default:
      return 'Needs you';
  }
}
