import { addBrollIdea, addDirectorMessage, addUserMessage, approvePlan, setFxPack, setLook, setLookPrompt, setVideoLength, videoRange } from './actions';
import { locationPreset, locationTitle } from './samples';
import type { FxPackId, LocationKind, Project, VideoLength } from './types';

// The artist describes the video in their own words; the director turns it into a plan:
// a look for every scene, cutaways, an effects pack. Claude does this when the studio server
// is connected; this is the built-in version that runs everywhere.

export type { VideoLength } from './types';
export { rangeFor, setVideoLength, SNIPPET_SEC, suggestedLength, videoLength } from './actions';

const PLACES: [RegExp, LocationKind][] = [
  [/\b(beach|ocean|shore|sand|waves?|palm trees?|sunset by the water)\b/, 'beach'],
  [/\b(white (room|void|studio|background|backdrop)|all white|clean white)\b/, 'whiteVoid'],
  [/\b((black|dark) (room|void|background|backdrop)|void|pitch black)\b/, 'darkVoid'],
  [/\b(hanging mic|mic|microphone|booth|spotlight)\b/, 'hangingMic'],
  [/\b(alley|alleyway|street|streets|block|hood|corner|neon|city at night)\b/, 'alley'],
];

/** A setting the presets don't cover becomes its own scene, described in the artist's words. */
const CUSTOM_PLACE = /\b(rooftop|roof|warehouse|club|forest|woods|desert|mansion|pool|field|parking (lot|garage)|garage|subway|train|church|jungle|snow|mountain|bridge|gas station|trap house|kitchen|bedroom|living room|studio|stage|arena|court|basketball|barbershop|store|bodega|diner|motel|hotel|penthouse|yacht|boat|island|cemetery|graveyard|highway|road|car wash|projects|school|hallway)\b/;

/** Things that read as cutaways rather than places to perform. */
const BROLL_THINGS = /\b(lambo|lamborghini|car|cars|whip|truck|bike|motorcycle|money|cash|bands|chain|chains|jewelry|watch|crowd|skyline|smoke|fire|flames|drone|dog|dogs|horse|lion|rain drops|lightning|helicopter|jet|plane|fireworks|explosion|cutaway|b-?roll)\b/;

const PACK_HINTS: [RegExp, FxPackId][] = [
  [/\bdrill\b/, 'drill'],
  [/\b(hype|turnt|turn up|lit|energy|crazy|wild|trap)\b/, 'trapHype'],
  [/\b(melodic|chill|smooth|vibe|vibey|soft|emotional|love|sad)\b/, 'melodic'],
  [/\b(boom ?bap|old school|90s|nineties|vintage|retro|vhs|film)\b/, 'boomBap'],
  [/\b(dark|grimy|evil|menacing|scary|horror|gloomy)\b/, 'dark'],
];

interface Setting {
  location: LocationKind | 'custom';
  words: string;
}

function clauses(text: string): string[] {
  return text
    .split(/[.!?\n;]+|,?\s*\b(?:and then|then|after that|next)\b\s*/i)
    .map((c) => c.trim().replace(/^(and|but|so)\s+/i, ''))
    .filter((c) => c.length > 2);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Reads the artist's description into a plan. Settings are spread over the scenes in the order
 * they were described; cutaways and the effects pack come from what's left.
 */
export function planFromBrief(p: Project, input: string): Project {
  const brief = input.trim().slice(0, 1200);
  if (!brief || !p.song || p.planApproved || p.job) return p;
  const range = videoRange(p);
  const scenes = p.song.sections.filter((s) => s.end > range.start + 0.01 && s.start < range.end - 0.01);
  if (scenes.length === 0) return p;

  const settings: Setting[] = [];
  const cutaways: string[] = [];
  const mood: string[] = [];
  for (const clause of clauses(brief)) {
    const lower = ` ${clause.toLowerCase()} `;
    const place = PLACES.find(([re]) => re.test(lower));
    if (place) settings.push({ location: place[1], words: clause });
    else if (CUSTOM_PLACE.test(lower)) settings.push({ location: 'custom', words: clause });
    else if (BROLL_THINGS.test(lower)) cutaways.push(clause);
    else mood.push(clause);
  }

  let next: Project = { ...p, brief };
  const moodLine = mood.length ? ` Mood: ${mood.join('. ')}.` : '';
  if (settings.length === 0) {
    // Nothing that reads as a place: the whole description becomes the world SwitchX builds.
    for (const s of scenes) {
      next = setLook(next, s.id, 'custom');
      next = setLookPrompt(next, s.id, `${capitalize(brief)} The camera stays with the performer.`);
    }
  } else {
    scenes.forEach((s, i) => {
      // In order: the first thing described opens the video.
      const setting = settings[Math.min(settings.length - 1, Math.floor((i * settings.length) / scenes.length))];
      next = setLook(next, s.id, setting.location);
      const base = setting.location === 'custom' ? `${capitalize(setting.words)}. The camera stays with the performer.` : `${locationPreset(setting.location).prompt} The artist wants: ${setting.words}.`;
      next = setLookPrompt(next, s.id, `${base}${moodLine}`);
    });
  }

  // What the artist described replaces the director's generic pitches. "A Lambo pulls up and a money
  // counter" is two cutaways, not one.
  const shots = cutaways.flatMap((c) => c.split(/\s+(?:and|plus|with)\s+(?=(?:a|an|the|some|my)?\s*\w)/i).filter((x) => BROLL_THINGS.test(` ${x.toLowerCase()} `))).slice(0, 4);
  const added = shots.length ? shots : cutaways.slice(0, 3);
  if (added.length) next = { ...next, broll: { ...next.broll, ideas: next.broll.ideas.filter((i) => i.mine || i.fromInbox || i.clipId || i.status !== 'idea') } };
  for (const shot of added) next = addBrollIdea(next, capitalize(shot.trim()));

  const lower = ` ${brief.toLowerCase()} `;
  const pack = PACK_HINTS.find(([re]) => re.test(lower))?.[1];
  if (pack) next = setFxPack(next, pack);

  return addDirectorMessage(next, describePlan(next, scenes.map((s) => s.id), added.length), { stage: 'looks' });
}

function describePlan(p: Project, sceneIds: string[], cutaways: number): string {
  const places: string[] = [];
  for (const id of sceneIds) {
    const look = p.looks[id];
    if (!look) continue;
    const place = look.location === 'custom' ? CUSTOM_PLACE.exec(` ${look.prompt.toLowerCase()} `)?.[1] : undefined;
    const word = look.location === 'custom' ? (place ? `the ${place}` : 'your world') : locationTitle(look.location).toLowerCase();
    if (places[places.length - 1] !== word) places.push(word);
  }
  const where =
    places.length === 1
      ? sceneIds.length === 1
        ? `One scene: ${places[0]}.`
        : `All ${sceneIds.length} scenes: ${places[0]}.`
      : `${sceneIds.length} scenes, moving from ${places.slice(0, -1).join(', ')} to ${places[places.length - 1]}.`;
  const extra = cutaways ? ` ${cutaways === 1 ? 'One cutaway' : `${cutaways} cutaways`} from what you described.` : '';
  return `Got it. ${where}${extra}`;
}

/**
 * The artist locks the plan: snippet or full video, and what they want to shoot. The director reads
 * the description into scenes and locks it. With nothing described, the director's own pitch stands.
 */
export function lockPlan(p: Project, input: { brief: string; length: VideoLength }): Project {
  if (p.planApproved || p.job || !p.song) return p;
  const brief = input.brief.trim();
  let next = setVideoLength(p, input.length);
  if (brief) next = planFromBrief(addUserMessage(next, brief), brief);
  return approvePlan(next);
}
