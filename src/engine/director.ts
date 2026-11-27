import { buildShots, skippedSeconds } from './broll';
import { nextScene, scenesOf } from './production';
import { locationTitle } from './samples';
import { currentStage, stageStatus } from './stages';
import { SWITCHX } from './switchx';
import type { AttachmentKind, Project, StageId, Take } from './types';
import { latestVersion } from './versions';

// The director's voice: what it says when a stage opens, when a job comes back, and what the
// one big button is. With the studio server connected Claude writes the chat replies; these
// lines stay the same either way so the app reads the same in demo mode.

export type RunCommand = 'finishShooting' | 'approvePlan' | 'makePlates' | 'startSwitch' | 'generateBroll' | 'buildEdit' | 'lockEdit' | 'skip';

export interface NextAction {
  label: string;
  /** Screen to open: the recorder or a stage screen. */
  open?: 'record' | StageId;
  /** Command to run in the engine. */
  run?: RunCommand;
}

export interface ActionSet {
  primary: NextAction | null;
  secondary?: NextAction;
}

export function formatTime(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/** The one big button for where the project is right now. */
export function nextActions(p: Project): ActionSet {
  const stage = currentStage(p);
  if (!stage) return { primary: { label: 'Watch your video', open: 'export' }, secondary: { label: 'Touch it up', open: 'export' } };
  const status = stageStatus(p, stage.id);
  if (status === 'working') return { primary: null };

  switch (stage.id) {
    case 'song':
      return { primary: { label: 'Pick your song', open: 'song' } };
    case 'shoot': {
      const n = p.takes.length;
      // Scene by scene: the next scene to shoot is the one thing to do.
      if (p.guides?.length) {
        const next = nextScene(p);
        if (next) return { primary: { label: `Shoot scene ${next.index + 1}`, open: 'shoot' } };
        return { primary: { label: "That's a wrap, cut it", run: 'finishShooting' } };
      }
      if (n === 0) return { primary: { label: 'Start recording', open: 'record' }, secondary: { label: 'Upload clips', open: 'shoot' } };
      if (n === 1) return { primary: { label: 'Record take 2', open: 'record' }, secondary: { label: "That's a wrap, cut it", run: 'finishShooting' } };
      return { primary: { label: "That's a wrap, cut it", run: 'finishShooting' }, secondary: { label: 'Record another take', open: 'record' } };
    }
    case 'cut':
      return { primary: { label: 'Review the cut', open: 'cut' } };
    case 'looks':
      return { primary: { label: 'Lock the plan', run: 'approvePlan' }, secondary: { label: 'See every scene', open: 'looks' } };
    case 'switch': {
      const open = scenesOf(p).find((sc) => sc.look?.reopened && !sc.look.locationLocked);
      if (p.shots.length === 0 && open) return { primary: { label: `Lock scene ${open.index + 1}'s background`, open: 'looks' } };
      if (p.shots.length === 0) return { primary: { label: 'Start the switch', run: 'startSwitch' } };
      const waiting = p.shots.filter((s) => s.status === 'ready' || s.status === 'failed').length;
      return { primary: { label: waiting === 1 ? 'Review 1 shot' : `Review ${waiting} shots`, open: 'switch' } };
    }
    case 'broll': {
      const n = p.broll.ideas.filter((i) => i.keep && i.status === 'idea' && i.at !== undefined && !i.clipId).length;
      // New ideas get made before the clips that are back get reviewed, so nothing new is dropped.
      if (status === 'needs_you' && n === 0) return { primary: { label: 'Review b-roll', open: 'broll' } };
      return {
        primary: n ? { label: n === 1 ? 'Generate 1 clip' : `Generate ${n} clips`, run: 'generateBroll' } : { label: 'Pick b-roll', open: 'broll' },
        secondary: { label: 'Skip b-roll', run: 'skip' },
      };
    }
    case 'edit':
      if (p.final.builds === 0) return { primary: { label: 'Build the edit', run: 'buildEdit' } };
      return { primary: { label: 'Watch and tune the edit', open: 'edit' }, secondary: { label: 'Lock it', run: 'lockEdit' } };
    case 'export':
      return { primary: { label: 'Export the video', open: 'export' } };
  }
}

/** What the director says when a stage becomes the current one. */
export function stageIntro(p: Project, id: StageId): { text: string; attachment?: AttachmentKind } {
  switch (id) {
    case 'song':
      return { text: 'What are we shooting? Bring the track and tell me where it posts.' };
    case 'shoot':
      return {
        text: p.guides?.length
          ? 'Your move. Shoot one scene at a time with its set guide, as many takes as you want. Lock a scene when you have it; my editor picks the best take.'
          : p.length
          ? 'Your move. Pick where you start in the recorder; the video starts there. One full pass is enough, and every extra take is another angle I can cut to. Already shot it? Upload your clips.'
          : 'Your move. Record with the song playing, or upload clips you already shot. One full pass is enough to start; every extra take is another angle I can cut to.',
        attachment: 'takePlan',
      };
    case 'cut': {
      const n = p.takes.length;
      return { text: `${n} ${n === 1 ? 'take' : 'takes'} in. I'm sorting them and cutting on the beat.` };
    }
    case 'looks':
      return {
        text: 'Describe what you want to shoot: where you are, the mood, anything that should happen. Pick snippet or full video and I plan every scene.',
        attachment: 'plan',
      };
    case 'switch': {
      const all = buildShots(p);
      const fresh = all.filter((x) => !x.reused).length;
      const kept = all.length - fresh;
      if (kept > 0) {
        return {
          text: `Cut's locked. ${kept} ${kept === 1 ? 'shot is' : 'shots are'} the same as your last version, so I'm keeping ${kept === 1 ? 'it' : 'them'}. ${fresh === 0 ? 'Nothing new to switch.' : `${fresh} new ${fresh === 1 ? 'shot goes' : 'shots go'} through the switch.`}`,
        };
      }
      const shots = all.length;
      const skipped = skippedSeconds(p);
      const saved = skipped >= 1 ? ` The ${Math.round(skipped)} seconds under b-roll are skipped, so you only pay for what's on screen.` : ' Only the seconds on screen get rendered.';
      return {
        text: `Cut's locked. Reference frames first, then your performance goes through the switch in ${shots === 1 ? 'one shot' : `${shots} shots`}, ${SWITCHX.concurrency} at a time.${saved}`,
      };
    }
    case 'broll': {
      const n = p.broll.ideas.filter((i) => i.keep && i.at !== undefined).length;
      return { text: n ? `The switch is done. ${n} b-roll ${n === 1 ? 'cutaway is' : 'cutaways are'} next.` : 'The switch is done. No b-roll in the plan, so the edit is next.' };
    }
    case 'edit':
      return { text: "Everything's in. I'm building the edit: cuts on the grid, b-roll placed, effects on the beat." };
    case 'export':
      return { text: 'Edit is locked. Pick where it posts and how sharp you want it.' };
  }
}

/** Lines the director posts when a job finishes. */
export function jobResult(p: Project, stage: StageId): { text: string; attachment?: AttachmentKind } | null {
  switch (stage) {
    case 'song': {
      const s = p.song;
      if (!s) return null;
      const extra = s.source === 'demo' ? ' Lyrics are timed to the beat.' : '';
      const parts = s.sections.some((x) => x.scene) ? '' : ` ${s.sections.length} sections,`;
      return { text: `Track's mapped: ${Math.round(s.bpm)} BPM,${parts} ${formatTime(s.durationSec)}.${extra}` };
    }
    case 'cut': {
      const shots = p.cut.segments.filter((s) => s.takeId).length;
      const gaps = p.cut.segments.filter((s) => !s.takeId).reduce((sum, s) => sum + (s.end - s.start), 0);
      const hole = gaps > 1 ? ` ${Math.round(gaps)} seconds have no take on them, so b-roll covers that stretch. Record a take there to keep it on you.` : '';
      return { text: `Cut's done: ${shots} shots, all on the beat.${hole}`, attachment: 'cutSummary' };
    }
    case 'looks':
      return { text: 'Reference frames are in. Each one is built from a real frame of your takes, so the light matches.' };
    case 'switch': {
      const flagged = p.shots.filter((s) => s.flag).length;
      const failed = p.shots.filter((s) => s.status === 'failed').length;
      const notes = [flagged ? `${flagged} ${flagged === 1 ? 'needs' : 'need'} a second look` : '', failed ? `${failed} didn't render` : ''].filter(Boolean).join(' and ');
      return {
        text: `All ${p.shots.length} shots are back.${notes ? ` ${notes[0].toUpperCase()}${notes.slice(1)}.` : ' Clean pass.'}`,
        attachment: 'shotsSummary',
      };
    }
    case 'broll':
      return { text: 'B-roll is back.' };
    case 'edit':
      return { text: "Edit's ready. Watch it through, tell me what to change, or lock it." };
    case 'export': {
      const v = latestVersion(p);
      if (!v || v.n === 1) return { text: "That's a wrap. v1 is ready to download. Come back any time to touch it up: the edit, the b-roll, a background, a scene, or the full song.", attachment: 'wrap' };
      const what = v.changes.length ? ` ${v.changes.join('. ')}.` : '';
      return { text: `v${v.n} is ready to download.${what} v${v.n - 1} is still there if you want it.`, attachment: 'wrap' };
    }
    default:
      return null;
  }
}

/** What the director says about a take that just landed. */
export function takeLine(p: Project, take: Take): string {
  const span = take.end - take.start;
  const whole = !!p.song && span >= p.song.durationSec - 1;
  const where = whole ? 'the full song' : `${formatTime(take.start)} to ${formatTime(take.end)}`;
  const how =
    take.sync === 'audio'
      ? `Lined up with the song by ear${take.lagMs ? `, ${Math.abs(take.lagMs)} ms of lag removed` : ''}.`
      : 'Lined up with the song by the recorder clock.';
  const verb = take.source === 'upload' ? 'is in' : 'saved';
  return `${take.label} ${verb}: ${where}. ${how}${take.flag ? ` ${take.flag}.` : ''}`;
}

export const STAGE_WORD: Record<StageId, string> = {
  song: 'the song',
  shoot: 'the shoot',
  cut: 'the cut',
  looks: 'looks',
  switch: 'the switch',
  broll: 'b-roll',
  edit: 'the edit',
  export: 'export',
};

export function lookSummary(p: Project): string {
  const duration = p.song?.durationSec ?? 0;
  const start = p.range?.start ?? 0;
  const end = p.range?.end ?? duration;
  // Only what's inside the video: song before or after it is never shot.
  const sections = (p.song?.sections ?? []).filter((s) => s.end > start + 0.01 && s.start < end - 0.01);
  const unit = sections.some((s) => s.scene) ? 'scenes' : 'sections';
  const groups = new Map<string, string[]>();
  for (const s of sections) {
    const look = p.looks[s.id];
    if (!look) continue;
    const title = locationTitle(look.location);
    groups.set(title, [...(groups.get(title) ?? []), s.label]);
  }
  return [...groups.entries()].map(([title, labels]) => `${title} for ${labels.length > 2 ? `${labels.length} ${unit}` : labels.join(' and ')}`).join(', ');
}
