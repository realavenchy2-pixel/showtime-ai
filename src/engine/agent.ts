import {
  addBrollIdea,
  addDirectorMessage,
  addIdea,
  addUserMessage,
  approveAllShots,
  approveBroll,
  approveCleanShots,
  approvePlan,
  approvePlates,
  buildEdit,
  finishShooting,
  generateBroll,
  lockCut,
  lockEdit,
  makePlates,
  redoShot,
  reshuffleCut,
  revisit,
  setAutonomy,
  setFxIntensity,
  setFxPack,
  setLook,
  setLookEverywhere,
  settle,
  skipStage,
  startSwitch,
  toggleEffect,
} from './actions';
import { nextActions, STAGE_WORD } from './director';
import { FX_EFFECTS, FX_PACKS } from './fx';
import { routeIdea } from './ideas';
import { locationTitle, LOCATIONS } from './samples';
import { currentStage, stageDef, stageStatus } from './stages';
import { BROLL_CREDITS_PER_SEC, REFERENCE_CREDITS, switchCredits } from './switchx';
import type { Autonomy, FxEffectId, FxIntensity, FxPackId, LocationKind, Project, SectionKind, StageId } from './types';

// The agent: what the director does on its own, and what it does when the artist talks to it.

/**
 * One step the director takes without being asked, or null when the next move is the artist's.
 * It stops at three places: the plan, shots that came back with a note, and the finished edit.
 */
export function agentAct(p: Project): Project | null {
  if (p.autonomy !== 'auto' || p.job) return null;
  const stage = currentStage(p);
  if (!stage) return null;
  const moved = (next: Project) => (next === p ? null : next);
  switch (stage.id) {
    case 'cut':
      return p.cut.segments.length ? moved(lockCut(p)) : null;
    case 'looks':
      if (!p.planApproved) return null;
      if (p.plates === 'none') return moved(makePlates(p));
      if (p.plates === 'ready') return moved(approvePlates(p));
      return null;
    case 'switch': {
      if (p.shots.length === 0) return moved(startSwitch(p));
      const back = p.shots.every((s) => s.status !== 'queued' && s.status !== 'rendering');
      if (!back) return null;
      return moved(approveCleanShots(p));
    }
    case 'broll': {
      if (p.broll.ideas.some((i) => i.status === 'clip')) return moved(approveBroll(p));
      if (p.broll.ideas.some((i) => i.keep && i.status === 'idea')) return moved(generateBroll(p));
      return moved(skipStage(p, 'broll'));
    }
    case 'edit':
      return p.final.builds === 0 ? moved(buildEdit(p)) : null;
    default:
      return null;
  }
}

/** Keeps taking automatic steps until the director needs the artist or starts a job. */
export function runAgent(p: Project, maxSteps = 12): Project {
  let next = p;
  for (let i = 0; i < maxSteps; i++) {
    const step = agentAct(next);
    if (!step) break;
    next = step;
  }
  return next;
}

/** Runs simulated jobs and the director's automatic steps until the artist is needed. Tests and samples use it. */
export function settleAuto(p: Project, maxRounds = 40): Project {
  let next = p;
  for (let i = 0; i < maxRounds; i++) {
    const before = next;
    next = runAgent(settle(next));
    if (next === before) break;
  }
  return next;
}

// ---------- Commands ----------

/** Everything the artist can ask the director to change. Claude emits the same commands as tool calls. */
export type AgentCommand =
  | { type: 'setLook'; section: string; location: LocationKind }
  | { type: 'setFxPack'; pack: FxPackId }
  | { type: 'setFxIntensity'; intensity: FxIntensity }
  | { type: 'toggleEffect'; effect: FxEffectId; on: boolean }
  | { type: 'redoShot'; n: number }
  | { type: 'approveShots' }
  | { type: 'reshuffle' }
  | { type: 'addBroll'; shot: string }
  | { type: 'skipBroll' }
  | { type: 'run' }
  | { type: 'wrapShoot' }
  | { type: 'lockEdit' }
  | { type: 'setAutonomy'; autonomy: Autonomy }
  | { type: 'goBack'; stage: StageId }
  | { type: 'idea'; stage: StageId; text: string };

export interface CommandResult {
  project: Project;
  ok: boolean;
  /** What happened, in the director's words. */
  note: string;
}

const INTENSITIES: FxIntensity[] = ['Clean', 'Hype', 'Unhinged'];

function sectionIds(p: Project, section: string): string[] {
  const sections = p.song?.sections ?? [];
  const key = section.toLowerCase().trim();
  if (key === 'all') return sections.map((s) => s.id);
  const byId = sections.filter((s) => s.id === section);
  if (byId.length) return byId.map((s) => s.id);
  const byLabel = sections.filter((s) => s.label.toLowerCase() === key);
  if (byLabel.length) return byLabel.map((s) => s.id);
  return sections.filter((s) => s.kind === (key.replace(/s$/, '') as SectionKind)).map((s) => s.id);
}

function sectionWord(p: Project, section: string): string {
  const sections = p.song?.sections ?? [];
  const ids = sectionIds(p, section);
  if (ids.length === sections.length) return 'the whole song';
  if (ids.length === 1) return sections.find((s) => s.id === ids[0])!.label;
  const kind = sections.find((s) => s.id === ids[0])?.kind ?? section.toLowerCase().trim().replace(/s$/, '');
  return `the ${kind}s`;
}

export function applyCommand(p: Project, cmd: AgentCommand): CommandResult {
  const result = (project: Project, done: string, blocked: string): CommandResult =>
    project === p ? { project: p, ok: false, note: blocked } : { project, ok: true, note: done };

  switch (cmd.type) {
    case 'setLook': {
      const ids = sectionIds(p, cmd.section);
      if (ids.length === 0) return { project: p, ok: false, note: `I don't see a section called "${cmd.section}" in this song.` };
      const all = ids.length === (p.song?.sections.length ?? 0);
      const next = all ? setLookEverywhere(p, cmd.location) : ids.reduce((acc, id) => setLook(acc, id, cmd.location), p);
      return result(next, `${locationTitle(cmd.location)} for ${sectionWord(p, cmd.section)}.`, 'Looks are locked once the switch starts. Tap Looks on the slate to go back and change them.');
    }
    case 'setFxPack': {
      const title = FX_PACKS.find((x) => x.id === cmd.pack)?.title ?? cmd.pack;
      return result(setFxPack(p, cmd.pack), `Effects pack is ${title} now.`, 'The edit is locked. Tap Edit on the slate to reopen it.');
    }
    case 'setFxIntensity':
      return result(setFxIntensity(p, cmd.intensity), `Effects set to ${cmd.intensity}.`, p.fx.intensity === cmd.intensity ? `Effects are already at ${cmd.intensity}.` : 'The edit is locked. Tap Edit on the slate to reopen it.');
    case 'toggleEffect': {
      const title = FX_EFFECTS.find((x) => x.id === cmd.effect)?.title.toLowerCase() ?? cmd.effect;
      if (p.fx.effects[cmd.effect] === cmd.on) return { project: p, ok: false, note: `${title[0].toUpperCase()}${title.slice(1)} is already ${cmd.on ? 'on' : 'off'}.` };
      return result(toggleEffect(p, cmd.effect, cmd.on), cmd.on ? `Added ${title}.` : `Took out the ${title}.`, 'The edit is locked. Tap Edit on the slate to reopen it.');
    }
    case 'redoShot': {
      const shot = p.shots.find((s) => s.n === cmd.n);
      if (!shot) return { project: p, ok: false, note: p.shots.length ? `There is no shot ${cmd.n}. This cut has ${p.shots.length}.` : 'Nothing has been through the switch yet.' };
      return result(redoShot(p, shot.id), `Redoing shot ${cmd.n}.`, `Shot ${cmd.n} is still rendering.`);
    }
    case 'approveShots':
      return result(approveAllShots(p), 'Approved. Moving on.', p.job ? 'Shots are still rendering.' : 'No shots are waiting on you.');
    case 'reshuffle':
      return result(reshuffleCut(p), 'Shuffled the cut.', 'The cut is locked in once the plan runs. Tap Cut on the slate to go back.');
    case 'addBroll':
      return result(addBrollIdea(p, cmd.shot), 'Added to the b-roll list.', 'B-roll is already wrapped. Tap B-roll on the slate to reopen it.');
    case 'skipBroll': {
      if (currentStage(p)?.id === 'broll') return result(skipStage(p, 'broll'), 'No b-roll. Straight to the edit.', 'B-roll is rendering right now.');
      const cleared: Project = p.broll.approved ? p : { ...p, broll: { ...p.broll, ideas: p.broll.ideas.map((i) => ({ ...i, keep: false })) } };
      return result(p.broll.ideas.some((i) => i.keep) ? cleared : p, 'Took the b-roll out of the plan.', 'There is no b-roll in the plan.');
    }
    case 'run': {
      if (!p.planApproved && currentStage(p)?.id === 'looks') return result(approvePlan(p), 'Running it.', 'Pick a look for every section first.');
      return { project: p, ok: false, note: p.planApproved ? "It's already running." : "There's no plan to run yet. I pitch one as soon as the cut is done." };
    }
    case 'wrapShoot':
      return result(finishShooting(p), "That's a wrap on the shoot.", p.takes.length === 0 ? 'Record or upload at least one take first.' : 'The shoot is already wrapped.');
    case 'lockEdit':
      return result(lockEdit(p), 'Locked.', p.final.locked ? 'The edit is already locked.' : "The edit isn't built yet.");
    case 'setAutonomy':
      return result(setAutonomy(p, cmd.autonomy), cmd.autonomy === 'auto' ? "I'll keep it moving." : "I'll check with you before each step.", `Autopilot is already ${cmd.autonomy === 'auto' ? 'on' : 'off'}.`);
    case 'goBack': {
      const status = stageStatus(p, cmd.stage);
      if (status !== 'done' && status !== 'skipped') return { project: p, ok: false, note: `We haven't finished ${STAGE_WORD[cmd.stage]} yet.` };
      return { project: revisit(p, cmd.stage), ok: true, note: `Back to ${STAGE_WORD[cmd.stage]}.` };
    }
    case 'idea': {
      const status = stageStatus(p, cmd.stage);
      const next = addIdea(p, cmd.text, cmd.stage);
      if (status === 'done' || status === 'skipped') {
        return { project: next, ok: true, note: `Saved to your idea inbox. ${stageDef(cmd.stage).title} is already wrapped, so tap it on the slate if you want to go back and use it.` };
      }
      if (cmd.stage === 'switch') return { project: next, ok: true, note: "Filed for the switch. Add it to a look's prompt or drop in a reference image and SwitchX builds it in." };
      return { project: next, ok: true, note: `Filed under ${STAGE_WORD[cmd.stage]}. I'll bring it back when we get there.` };
    }
  }
}

const LOCATION_WORDS: [RegExp, LocationKind][] = [
  [/\bbeach\b/, 'beach'],
  [/\balley\b/, 'alley'],
  [/\bwhite (room|void|studio)\b/, 'whiteVoid'],
  [/\b(dark|black) (room|void)\b/, 'darkVoid'],
  [/\bhanging mic\b/, 'hangingMic'],
];

const SECTION_WORDS: [RegExp, string][] = [
  [/\b(whole|entire) (song|video|thing)\b|\beverything\b|\ball of it\b|\bevery section\b/, 'all'],
  [/\bverse (one|1)\b/, 'Verse 1'],
  [/\bverse (two|2)\b/, 'Verse 2'],
  [/\bhooks?\b|\bchorus(es)?\b/, 'hook'],
  [/\bverses?\b/, 'verse'],
  [/\bintro\b/, 'intro'],
  [/\boutro\b/, 'outro'],
  [/\bbridge\b/, 'bridge'],
];

const EFFECT_WORDS: [RegExp, FxEffectId][] = [
  [/\b(shake|shakes|shaking)\b/, 'shake'],
  [/\b(flash|flashes|strobe|strobes)\b/, 'flash'],
  [/\b(glitch|glitches)\b/, 'glitch'],
  [/\b(vhs|grain)\b/, 'vhs'],
  [/\brgb\b|\bchromatic\b/, 'rgbSplit'],
  [/\b(zoom|zooms|punch-?ins?)\b/, 'punchIn'],
  [/\b(stutter|stutters|freeze|hold)\b/, 'stutter'],
  [/\b(lyrics|captions|words on screen)\b/, 'kineticLyrics'],
];

const PACK_WORDS: [RegExp, FxPackId][] = [
  [/\bdrill\b/, 'drill'],
  [/\btrap\b/, 'trapHype'],
  [/\bmelodic\b/, 'melodic'],
  [/\bboom ?bap\b/, 'boomBap'],
  [/\bdark\b/, 'dark'],
];

/** Reads what the artist typed into commands. Rule-based; Claude does the same job when the server is connected. */
export function parseCommands(input: string, p: Project): AgentCommand[] {
  const text = ` ${input.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ')} `;
  const stage = currentStage(p)?.id;
  const out: AgentCommand[] = [];

  if (/\b(shuffle|re-?roll|different cut|another cut|recut)\b/.test(text)) out.push({ type: 'reshuffle' });

  const redo = text.match(/\b(redo|rerun|re-?do|again)\b.*?\bshot (\d+)\b|\bshot (\d+)\b.*?\b(redo|again|over)\b/);
  if (redo) out.push({ type: 'redoShot', n: Number(redo[2] ?? redo[3]) });

  if (stage === 'switch' && /\b(approve|keep) (all|them|everything|the shots)\b|\bthey('re| are) good\b|\blooks? good\b/.test(text)) out.push({ type: 'approveShots' });

  if (/\bautopilot off\b|\bask me (first|before)\b|\bstop (and|to) ask\b/.test(text)) out.push({ type: 'setAutonomy', autonomy: 'ask' });
  else if (/\bautopilot( back)? on\b|\bstop asking\b|\bjust (do|run) it all\b|\bhandle it\b/.test(text)) out.push({ type: 'setAutonomy', autonomy: 'auto' });

  if (/\b(no|skip|drop|without|kill) (the )?b-?roll\b/.test(text)) out.push({ type: 'skipBroll' });

  // Looks: "beach for the hook", "put the verses in the alley".
  const location = LOCATION_WORDS.find(([re]) => re.test(text));
  if (location && !/\bb-?roll\b|\bshot of\b|\bcutaway\b/.test(text)) {
    const section = SECTION_WORDS.find(([re]) => re.test(text));
    out.push({ type: 'setLook', section: section ? section[1] : 'all', location: location[1] });
  }

  // Effects: intensity, single effects, packs.
  if (/\b(unhinged|go crazy|crazier|way more|max(ed)? out)\b/.test(text)) out.push({ type: 'setFxIntensity', intensity: 'Unhinged' });
  else if (/\b(more|harder|heavier|turn (it )?up)\b.*\b(effects?|fx|vfx|hits?)\b|\b(more|harder) (effects?|fx|vfx)\b/.test(text)) {
    out.push({ type: 'setFxIntensity', intensity: INTENSITIES[Math.min(2, INTENSITIES.indexOf(p.fx.intensity) + 1)] });
  } else if (/\b(clean(er)?|less|fewer|tone (it )?down|calm(er)?|subtle)\b.*\b(effects?|fx|vfx|hits?|it)\b|\bkeep it clean\b/.test(text)) {
    out.push({ type: 'setFxIntensity', intensity: INTENSITIES[Math.max(0, INTENSITIES.indexOf(p.fx.intensity) - 1)] });
  }
  for (const [re, effect] of EFFECT_WORDS) {
    if (!re.test(text)) continue;
    const off = new RegExp(`\\b(no|remove|kill|drop|lose|without|turn off|take out|less)\\b[^.]*${re.source}`).test(text);
    const on = new RegExp(`\\b(add|more|turn on|with|give me|put)\\b[^.]*${re.source}`).test(text);
    if (off) out.push({ type: 'toggleEffect', effect, on: false });
    else if (on) out.push({ type: 'toggleEffect', effect, on: true });
  }
  const pack = PACK_WORDS.find(([re]) => re.test(text));
  if (pack && /\b(pack|effects?|fx|vfx|style|vibe|grade)\b/.test(text)) out.push({ type: 'setFxPack', pack: pack[1] });

  if (stage === 'shoot' && /\b(that'?s a wrap|done (recording|shooting)|cut it|wrap it)\b/.test(text)) out.push({ type: 'wrapShoot' });
  if (stage === 'edit' && /\b(lock it|lock the edit|ship it|it'?s done|that'?s it)\b/.test(text)) out.push({ type: 'lockEdit' });
  if (stage === 'looks' && !p.planApproved && out.length === 0 && /\b(run it|send it|let'?s go|do it|go ahead|looks? good|bet|start)\b/.test(text)) out.push({ type: 'run' });

  if (out.length === 0) {
    const idea = routeIdea(input);
    if (idea === 'broll' && !p.broll.approved) out.push({ type: 'idea', stage: 'broll', text: input.trim() });
    else if (idea) out.push({ type: 'idea', stage: idea, text: input.trim() });
  }
  return out;
}

/** Answers questions that are not commands: time, cost, what's next. */
function smallTalk(p: Project, input: string): string {
  const text = input.toLowerCase();
  if (/(how long|how much time|when.*done|eta)/.test(text)) {
    if (p.job) return `${p.job.label}. About ${Math.max(1, Math.round((1 - p.job.progress) * 100))}% to go.`;
    return 'Nothing is rendering right now.';
  }
  if (/(cost|credit|price|how much)/.test(text)) {
    const b = estimateBudget(p);
    const render = b.totalCredits ? ` Behind the scenes this cut is about ${b.totalCredits} Beeble credits to render at ${p.switchSettings.resolution}p.` : '';
    return `One video is 1 credit, and 4K adds 1 more.${render}`;
  }
  if (/\b(what'?s next|what now|next step|where are we)\b/.test(text)) {
    const next = nextActions(p).primary?.label;
    return next ? `Next: ${next}.` : p.job ? `${p.job.label}. I'll keep going when it's back.` : "We're wrapped.";
  }
  const next = nextActions(p).primary?.label;
  return next ? `Heard. When you're ready: ${next}.` : "Heard. I'm on it.";
}

/** Demo-mode chat: the artist's message, whatever it changed, and the director's reply. */
export function respond(p: Project, input: string): Project {
  const text = input.trim();
  if (!text) return p;
  let next = addUserMessage(p, text);
  const commands = parseCommands(text, next);
  if (commands.length === 0) return addDirectorMessage(next, smallTalk(next, text));
  const notes: string[] = [];
  for (const cmd of commands) {
    const res = applyCommand(next, cmd);
    next = res.project;
    notes.push(res.note);
  }
  return addDirectorMessage(next, notes.join(' '));
}

/** Applies commands that came back from Claude, then posts its reply with any notes about what could not change. */
export function applyReply(p: Project, reply: string, commands: AgentCommand[]): Project {
  let next = p;
  const blocked: string[] = [];
  for (const cmd of commands) {
    const res = applyCommand(next, cmd);
    next = res.project;
    if (!res.ok) blocked.push(res.note);
  }
  return addDirectorMessage(next, [reply.trim(), ...blocked].filter(Boolean).join(' '));
}

// ---------- Budget ----------

export interface Budget {
  /** Frames that go through the switch, handles included. */
  switchFrames: number;
  switchCredits: number;
  referenceCredits: number;
  brollSeconds: number;
  brollCredits: number;
  totalCredits: number;
}

/** What the plan costs to render in Beeble credits, at the project's switch resolution. */
export function estimateBudget(p: Project): Budget {
  const shots = p.shots.length ? p.shots : [];
  let switchFrames = 0;
  let credits = 0;
  if (shots.length) {
    for (const s of shots) {
      switchFrames += s.frames;
      credits += switchCredits(s.frames, p.switchSettings.resolution);
    }
  } else {
    const takes = new Map(p.takes.map((t) => [t.id, t]));
    for (const seg of p.cut.segments) {
      const take = takes.get(seg.takeId);
      if (!take) continue;
      const frames = Math.ceil((seg.end - seg.start) * take.fps);
      switchFrames += frames;
      credits += switchCredits(frames, p.switchSettings.resolution);
    }
  }
  const looks = new Set(Object.values(p.looks).map((l) => `${l.location}:${l.prompt}`));
  const referenceCredits = looks.size * REFERENCE_CREDITS;
  const kept = p.broll.ideas.filter((i) => i.keep && !i.clipId);
  const brollSeconds = kept.reduce((sum, i) => sum + Math.ceil(i.durationSec), 0);
  const brollCredits = kept.reduce((sum, i) => sum + Math.ceil(i.durationSec) * BROLL_CREDITS_PER_SEC[i.model], 0);
  return { switchFrames, switchCredits: credits, referenceCredits, brollSeconds, brollCredits, totalCredits: credits + referenceCredits + brollCredits };
}

export { LOCATIONS };
