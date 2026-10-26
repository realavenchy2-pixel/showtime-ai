import { routeIdea } from './ideas';
import { locationTitle } from './samples';
import { currentStage, stageDef, stageStatus } from './stages';
import type { AttachmentKind, Project, StageId } from './types';

// Scripted director for the prototype. The real director is Claude running the same stage
// machine with tools; these lines show the voice and the one-next-step rule.

export interface NextAction {
  label: string;
  /** Screen to open: the recorder or a stage screen. */
  open?: 'record' | StageId;
  /** Command to run in the engine. */
  run?: 'startSwitch' | 'renderFinal' | 'finishRecording' | 'skip';
}

export interface ActionSet {
  primary: NextAction | null;
  secondary?: NextAction;
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** The one big button for where the project is right now. */
export function nextActions(p: Project): ActionSet {
  const stage = currentStage(p);
  if (!stage) return { primary: { label: 'Watch your video', open: 'export' } };
  const status = stageStatus(p, stage.id);
  if (status === 'working') return { primary: null };

  const skip: NextAction | undefined = stage.optional ? { label: `Skip ${stage.title}`, run: 'skip' } : undefined;

  switch (stage.id) {
    case 'song':
      return { primary: { label: 'Pick your song', open: 'song' } };
    case 'record': {
      const planned = p.takePlan.length;
      const n = p.takes.length;
      if (n === 0) return { primary: { label: 'Start recording', open: 'record' } };
      if (n < planned) {
        return {
          primary: { label: `Record take ${n + 1}`, open: 'record' },
          secondary: { label: 'Done recording', run: 'finishRecording' },
        };
      }
      return {
        primary: { label: 'Build my rough cut', run: 'finishRecording' },
        secondary: { label: 'Record another take', open: 'record' },
      };
    }
    case 'roughcut':
      return { primary: { label: 'Review the cut', open: 'roughcut' } };
    case 'location':
      return {
        primary: p.plates === 'ready' ? { label: 'Review plates', open: 'location' } : { label: 'Pick locations', open: 'location' },
      };
    case 'switch':
      return {
        primary: p.shots.length === 0 ? { label: 'Start the switch', run: 'startSwitch' } : { label: 'Review shots', open: 'switch' },
      };
    case 'genjutsu':
      return {
        primary: p.genjutsu.status === 'ready' ? { label: 'Review swaps', open: 'genjutsu' } : { label: 'See swap ideas', open: 'genjutsu' },
        secondary: skip,
      };
    case 'broll':
      return {
        primary: status === 'needs_you' ? { label: 'Review b-roll', open: 'broll' } : { label: 'See b-roll ideas', open: 'broll' },
        secondary: skip,
      };
    case 'vfx':
      return { primary: { label: 'Pick a VFX pack', open: 'vfx' } };
    case 'final':
      return {
        primary: p.final.renders === 0 ? { label: 'Render the final', run: 'renderFinal' } : { label: 'Watch the final', open: 'final' },
      };
    case 'resize':
      return { primary: { label: 'Pick formats', open: 'resize' } };
    case 'export':
      return { primary: { label: 'Export the video', open: 'export' } };
  }
}

/** What the director says when a stage becomes the current one. */
export function stageIntro(p: Project, id: StageId): { text: string; attachment?: AttachmentKind } {
  const song = p.song;
  switch (id) {
    case 'song':
      return { text: 'What are we shooting? Drop the track, pick the vibe, and tell me where it goes: YouTube, Reels or both.' };
    case 'record':
      return {
        text: 'Here is the take plan. Phone sideways, light on your face, mic in hand. I count you in on the beat every time.',
        attachment: 'takePlan',
      };
    case 'roughcut':
      return {
        text: `That's ${p.takes.length} ${p.takes.length === 1 ? 'take' : 'takes'} in. I'm cutting the performance on the beat: a new shot every 4 bars, low angle on the hooks.`,
      };
    case 'location':
      return {
        text: 'Cut is locked. Now where are we? I pitched a look for each section: verses in the alley, hooks under the hanging mic. Change anything you want.',
      };
    case 'switch': {
      const shots = p.cut.segments.length;
      return {
        text: `Plates look right. Next I send every shot in the cut through the switch: ${shots} shots, 5 at a time. Only the seconds on screen get rendered.`,
      };
    }
    case 'genjutsu':
      return { text: 'Want to swap anything in frame? Your mic, your chain, your fit. This one is optional.' };
    case 'broll':
      return { text: 'B-roll time. I matched cutaways to your lyrics. Keep the ones that hit, or skip it.' };
    case 'vfx':
      return {
        text: `Pick your effects pack. I put every hit on the beat map${song ? ` at ${song.bpm} BPM` : ''}: zooms on snares, shakes on 808s, flashes on the drop.`,
      };
    case 'final':
      return { text: 'Everything is in. I stitch the final next: master audio locked, b-roll and effects in place.' };
    case 'resize':
      return { text: 'Final is locked. Which formats are you posting to?' };
    case 'export':
      return { text: 'Last step. 1080p comes with every video. 4K costs one more credit.' };
  }
}

/** Lines the director posts when a job finishes. */
export function jobResult(p: Project, stage: StageId): { text: string; attachment?: AttachmentKind } | null {
  switch (stage) {
    case 'song': {
      const s = p.song;
      if (!s) return null;
      return { text: `Track's mapped: ${s.bpm} BPM, ${s.sections.length} sections, ${formatTime(s.durationSec)}. Vocals split and lyrics timed to the beat.` };
    }
    case 'roughcut':
      return {
        text: `Rough cut is ready: ${p.cut.segments.length} shots, all on the beat. Swap any shot you don't like, then lock it.`,
        attachment: 'cutSummary',
      };
    case 'location':
      return { text: 'Plates are ready. Each one is built from a real frame of your takes, so the light matches.' };
    case 'switch': {
      const flagged = p.shots.filter((s) => s.flag).length;
      return {
        text: `All ${p.shots.length} shots are back.${flagged ? ` ${flagged} need a second look before you approve.` : ''}`,
        attachment: 'shotsSummary',
      };
    }
    case 'genjutsu':
      return { text: 'Swaps are done. Check them before they go in the edit.' };
    case 'broll':
      return { text: 'Your b-roll clips are back. Keep the ones that hit.' };
    case 'final':
      return { text: 'Final is rendered: audio synced to the master, b-roll and effects in. Watch it through.' };
    case 'resize':
      return { text: `Rendered ${p.resize.formats.length === 1 ? 'your format' : `${p.resize.formats.length} formats`}, laid out for each frame.` };
    case 'export':
      return { text: "That's a wrap. Your video is ready to download.", attachment: 'wrap' };
    default:
      return null;
  }
}

const STAGE_WORD: Record<StageId, string> = {
  song: 'the song',
  record: 'recording',
  roughcut: 'the rough cut',
  location: 'locations',
  switch: 'the switch',
  genjutsu: 'Genjutsu',
  broll: 'B-roll',
  vfx: 'VFX',
  final: 'the final edit',
  resize: 'resize',
  export: 'export',
};

export interface DirectorReply {
  text: string;
  idea?: StageId;
}

/** Reply to free text from the artist. Ideas get filed to the stage that uses them. */
export function directorReply(p: Project, input: string): DirectorReply {
  const text = input.trim().toLowerCase();
  const stage = currentStage(p);
  const actions = nextActions(p);
  const next = actions.primary?.label;

  if (/(how long|how much time|when.*done|eta)/.test(text)) {
    return { text: p.job ? `${p.job.label}: about ${Math.max(1, Math.round(((1 - p.job.progress) * p.job.durationMs) / 1000))} seconds left in this prototype. In the real app I send a push alert when it's done.` : 'Nothing is rendering right now. Most steps take a few minutes in the real app, and I ping you when each one is done.' };
  }
  if (/(cost|credit|price|how much)/.test(text)) {
    return { text: 'This video uses 1 credit at Standard: 720p, upscaled to 1080p. Exporting in 4K adds 1 more.' };
  }
  if (/\bskip\b/.test(text)) {
    if (stage?.optional) return { text: `Say less. Tap "Skip ${stage.title}" under my last message.` };
    return { text: `${stage ? stage.title : 'This step'} can't be skipped. Everything after it builds on it.` };
  }
  if (/(redo|go back|change the|start over)/.test(text)) {
    return { text: 'Tap any finished stage on the slate up top to go back. I will tell you what has to redo before anything changes.' };
  }

  const idea = routeIdea(input);
  if (idea) {
    const ideaStage = stageDef(idea);
    const status = stageStatus(p, idea);
    if (status === 'done' || status === 'skipped') {
      return { idea, text: `Saved to your idea inbox. ${ideaStage.title} is already wrapped, so tap it on the slate if you want to go back and use it.` };
    }
    if (idea === 'location') {
      const loc = /beach/.test(text) ? 'beach' : /alley/.test(text) ? 'alley' : null;
      return { idea, text: `Filed under locations${loc ? `: ${locationTitle(loc)}` : ''}. I'll bring it back when we pick looks.` };
    }
    return { idea, text: `Filed under ${STAGE_WORD[idea]}. I'll bring it back when we get there.` };
  }

  return { text: next ? `Heard. When you're ready: ${next}.` : "Heard. I'm on it, I'll ping you when this step is done." };
}
