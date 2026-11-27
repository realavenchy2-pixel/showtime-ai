import type { CameraMove, Framing, Pose, Prop, PropKind, SectionKind, SetGuide, ShotAngle, ShotCall, Vibe } from './types';

// The director's shot calls. Every scene gets a framing (wide, medium or close), a pose, a camera
// angle and, for someone filming, a move. The director reads them from what happens in the scene,
// its lyrics, what the song is about and how hard the song hits there, and keeps neighboring scenes
// different so the cut has somewhere to go. The set guide's distances come from real phone optics,
// so "chest up" really is chest up. Pure functions, no UI.

export const FRAMINGS: Framing[] = ['wide', 'medium', 'close'];
export const SHOT_ANGLES: ShotAngle[] = ['low', 'level', 'high'];

export const FRAMING_NAME: Record<Framing, string> = { wide: 'Wide', medium: 'Medium', close: 'Close-up' };

// ---------- Optics ----------

/** The 16:9 frame's height in 35 mm-equivalent terms: a phone's 4:3 sensor, held sideways, cropped to 16:9. */
const FRAME_MM = 19.5;
/** The lens each framing uses: 1x is the main camera (24 mm), then 1.5x and 2x zoom. Faces look best from further back on zoom. */
const LENS_MM: Record<Framing, number> = { wide: 24, medium: 36, close: 48 };
const ZOOM: Record<Framing, number> = { wide: 1, medium: 1.5, close: 2 };
const ULTRA_WIDE_MM = 13;

/** The part of the artist each framing keeps in shot, by pose, in meters from the floor. For an artist about 1.8 m tall. */
const SPAN: Record<Pose, Record<Framing, [number, number]>> = {
  stand: { wide: [0, 2.0], medium: [0.9, 1.95], close: [1.3, 1.92] },
  lean: { wide: [0, 2.0], medium: [0.9, 1.95], close: [1.3, 1.92] },
  sit: { wide: [0, 1.55], medium: [0.55, 1.5], close: [0.95, 1.48] },
  hang: { wide: [0, 2.3], medium: [0.9, 2.25], close: [1.3, 2.2] },
};

/** Room around the artist, so the editor can punch in on the beat. Wides get the most. */
const ROOM: Record<Framing, number> = { wide: 1.2, medium: 1.1, close: 1.08 };

/** Camera height in meters, by pose, angle and framing. Low makes you larger than life; level is eye to eye. */
const HEIGHT: Record<Pose, Record<ShotAngle, Record<Framing, number>>> = {
  stand: { low: { wide: 0.5, medium: 0.9, close: 1.2 }, level: { wide: 1.2, medium: 1.5, close: 1.65 }, high: { wide: 2.0, medium: 1.95, close: 1.95 } },
  lean: { low: { wide: 0.5, medium: 0.9, close: 1.2 }, level: { wide: 1.2, medium: 1.45, close: 1.6 }, high: { wide: 2.0, medium: 1.9, close: 1.9 } },
  sit: { low: { wide: 0.4, medium: 0.6, close: 0.85 }, level: { wide: 0.9, medium: 1.05, close: 1.2 }, high: { wide: 1.6, medium: 1.5, close: 1.5 } },
  hang: { low: { wide: 0.6, medium: 1.0, close: 1.3 }, level: { wide: 1.3, medium: 1.6, close: 1.7 }, high: { wide: 2.1, medium: 2.1, close: 2.1 } },
};

/** Clear floor behind the artist, so they don't cast a shadow on the wall and the switch separates them cleanly. */
const BACKROOM: Record<Framing, number> = { wide: 1.5, medium: 1.2, close: 1.0 };

const round1 = (m: number) => Math.round(m * 10) / 10;

/** How far the phone goes so a span of the body fills the frame at a lens, with `room` to spare. */
export function fitDistance(span: [number, number], lensMm: number, room = 1): number {
  return round1(((span[1] - span[0]) * room * lensMm) / FRAME_MM);
}

/** How tall the frame is, in meters, at a distance and lens. */
export function frameHeight(distance: number, lensMm: number): number {
  return (distance * FRAME_MM) / lensMm;
}

export interface Rig {
  distance: number;
  height: number;
  lensMm: number;
  zoom: number;
  backroomM: number;
  frame: [number, number];
  /** The back camera on zoom: sharper, and kinder to faces from further back. */
  backZoom?: number;
  backDistance?: number;
  /** Where the phone goes on the back camera's 0.5x lens, for small rooms. */
  ultraWideDistance?: number;
}

/**
 * Where the phone goes for a framing. Most artists film themselves on the front camera so they can
 * watch the take, and front cameras don't zoom: the guide is laid out for the front camera at 1x.
 * The back camera's zoom is the sharper option for someone filming (`backDistance`, `backZoom`).
 */
export function rigFor(framing: Framing, pose: Pose, angle: ShotAngle): Rig {
  const frame = SPAN[pose][framing];
  const zoom = ZOOM[framing];
  return {
    distance: fitDistance(frame, LENS_MM.wide, ROOM[framing]),
    height: HEIGHT[pose][angle][framing],
    lensMm: LENS_MM.wide,
    zoom: 1,
    backroomM: BACKROOM[framing],
    frame,
    backZoom: zoom > 1 ? zoom : undefined,
    backDistance: zoom > 1 ? fitDistance(frame, LENS_MM[framing], ROOM[framing]) : undefined,
    ultraWideDistance: framing === 'wide' ? fitDistance(frame, ULTRA_WIDE_MM, ROOM[framing]) : undefined,
  };
}

// ---------- What the director reads ----------

/** Everything the director reads in one scene to call its shot. */
export interface SceneRead {
  index: number;
  /** Scenes in the video. */
  count: number;
  /** Verse, hook and so on, for songs laid out that way. Scenes laid out by time have none. */
  kind?: SectionKind;
  /** What happens in the scene, in the plan's words. */
  plan: string;
  /** The words sung in the scene, when the song has lyrics. */
  words: string;
  /** What the artist said the song is about, its message, and the plan's mood. */
  about: string;
  /** How loud the scene is against the whole video: above 1 the song hits harder here. */
  energy?: number;
  /** The loudest scene in the video. */
  peak?: boolean;
  tempo: 'fast' | 'mid' | 'slow';
  vibe?: Vibe;
  /** Framings already called for the scenes before this one, nearest last. */
  before: Framing[];
}

type Where = 'plan' | 'words' | 'about';

interface Cue {
  id: string;
  /** Where it's read: the scene's plan, its lyrics, or what the song is about. */
  in: Where[];
  test: RegExp;
  score: Partial<Record<Framing, number>>;
  /** The reason, said when this cue decides the shot, for the framing it argues for. */
  why?: Partial<Record<Framing, string>>;
  /** Said instead when only what the song is about matched. */
  whyAbout?: Partial<Record<Framing, string>>;
  pose?: Pose;
  angle?: ShotAngle;
  move?: CameraMove;
  /** Lyrics repeat themselves: a cue counts at most this many times from them. */
  max?: number;
}

/** Things that hang in a scene, so a hanging mic or a hanging light doesn't read as you hanging. */
const HANGING_THINGS = /\b(mic|microphone|light|lamp|bulb|chandelier|sign|cable)s? hanging\b[^.,;]*/g;
const MIC_HANGING = /\b((mic|microphone)s? hanging|hanging (mic|microphone)s?)\b/;
const HANG = /\b(hang(s|ing)? (off|from)|hang(s|ing)? out (of|the)|out (of )?the (helicopter|chopper|door|window)|helicopter|chopper|monkey bars?|pull-?ups?|rope ladder)\b/;
const MIC_STAND = /\b(mic|microphone) stands?\b/;
const MIC = /\b(mic stands?|microphone stands?|mics?|microphones?|vocal booth|the booth)\b/;
const IN_CAR =
  /\b(in the (car|whip|truck|jeep|back ?seat|front seat)|(driver'?s?|passenger|front|back) seat|behind the wheel|driving|riding shotgun|shotgun|in (a|my|the|his|her) (lambo|lamborghini|ferrari|bentley|rolls|rolls[- ]royce|maybach|benz|mercedes|bmw|tesla|range rover|cadillac|escalade|g-?wagon|hellcat|charger|camaro|mustang|porsche|mclaren|bugatti|corvette)|inside (a|the|my) (car|truck|jeep|whip))\b/;
const RIDE = /\b(on (a|the|my) (motorcycle|motorbike|bike|dirt ?bike|scooter|four[- ]wheeler|atv|horse|jet ?ski)|riding (a |the |my )?(motorcycle|motorbike|bike|dirt ?bike|scooter|four[- ]wheeler|atv|horse|jet ?ski))\b/;
const JET = /\b(private jet|(on|in) (a|the) (jet|plane)|airplane)\b/;
const SEATED = /\b(couch|sofa|bed|armchair|chair|bench|stool|sitting|seated|sits|sit)\b/;
const THRONE = /\bthrones?\b/;
const LEAN = /\b(lean(s|ing)?|against the (wall|car|rail|railing|fence|window)|on the (railing|rail|balcony|fence|hood)|railing|balcony)\b/;
const TABLE = /\b(table|desk|counter|bar top|dj booth|turntables|pool table)\b/;
const STEPS = /\b(stairs|steps|stoop|staircase)\b/;

const CUES: Cue[] = [
  // How you're placed: read from the plan only. Lyrics say "car" all the time.
  {
    id: 'hang',
    in: ['plan'],
    test: HANG,
    pose: 'hang',
    score: { wide: 5, medium: 1, close: -20 },
    why: { wide: "You're hanging on, so we keep all of you in frame.", medium: "You're hanging on, so your hands stay at the top of the frame." },
  },
  {
    id: 'car',
    in: ['plan'],
    test: IN_CAR,
    pose: 'sit',
    move: 'still',
    score: { medium: 4, close: 1, wide: -20 },
    why: { medium: "You're in the car, so the camera sits on the dash.", close: "You're in the car, so the camera sits on the dash." },
  },
  {
    id: 'ride',
    in: ['plan'],
    test: RIDE,
    pose: 'sit',
    score: { wide: 2, medium: 2 },
    why: { wide: "You're riding, so we keep you and the ride in frame.", medium: "You're riding, so we keep you and the handlebars in frame." },
  },
  { id: 'jet', in: ['plan'], test: JET, pose: 'sit', score: { medium: 3, wide: -1 }, why: { medium: "You're in your seat on the jet, so we frame you waist up." } },
  {
    id: 'throne',
    in: ['plan'],
    test: THRONE,
    pose: 'sit',
    angle: 'low',
    score: { wide: 2, medium: 2 },
    why: { wide: "You're on the throne, so the camera goes low.", medium: "You're on the throne, so the camera goes low." },
  },
  { id: 'seat', in: ['plan'], test: SEATED, pose: 'sit', score: { medium: 3, close: 1, wide: -1 }, why: { medium: "You're seated, so we frame you waist up." } },
  { id: 'lean', in: ['plan'], test: LEAN, pose: 'lean', score: { medium: 2, wide: 1 }, why: { medium: "You're leaning back, so we frame you waist up." } },
  {
    id: 'hangingMic',
    in: ['plan'],
    test: MIC_HANGING,
    score: { medium: 2, close: 2 },
    why: { medium: 'Just you and the mic, waist up.', close: 'Just you and the mic, so the camera comes in close.' },
  },
  { id: 'mic', in: ['plan'], test: MIC, score: { medium: 3 }, why: { medium: 'The mic stand reads best waist up.' } },
  { id: 'table', in: ['plan'], test: TABLE, score: { medium: 3 }, why: { medium: 'The table sits in the shot, so we frame you waist up.' } },
  { id: 'steps', in: ['plan'], test: STEPS, score: { wide: 1.5, medium: 1 }, why: { wide: 'We see the steps and all of you.' } },

  // Where in the song the plan puts the scene.
  {
    id: 'hook',
    in: ['plan'],
    test: /\b(for the hook|on the hook|the hook|hooks?|chorus)\b/,
    angle: 'low',
    move: 'arc',
    score: { wide: 3 },
    why: { wide: "It's the hook, so the camera goes low and you look larger than life." },
  },
  { id: 'verse', in: ['plan'], test: /\b(for the verses?|on the verses?|verses?)\b/, score: { medium: 0.75, close: 0.75 } },

  // What happens, and what's said.
  {
    id: 'dance',
    in: ['plan', 'words'],
    max: 2,
    test: /\b(danc(e|es|ing|er|ers)|two[- ]?step(ping)?|jump(s|ing)?|bounc(e|es|ing)|mosh(ing)?|wil(d|din|ding) out|turnt|turn(ing)? up|crip[- ]?walk|c-?walk|griddy|footwork)\b/,
    move: 'arc',
    score: { wide: 3 },
    why: { wide: "You're moving here, so we keep all of you in frame." },
  },
  {
    id: 'crew',
    in: ['plan', 'words'],
    max: 2,
    test: /\b(crew|gang|squad|homies|the guys|the boys|bros|dawgs|my team|whole team|crowd|fans|party)\b/,
    move: 'arc',
    score: { wide: 2 },
    why: { wide: 'Room for the whole crew.' },
  },
  {
    id: 'fit',
    in: ['plan', 'words'],
    max: 2,
    test: /\b(drip(pin|ping)?|fit|fits|outfit|designer|kicks|sneakers|jordans|tracksuit|fur|mink)\b/,
    score: { wide: 2 },
    why: { wide: 'Head to toe, so the whole fit shows.' },
  },
  {
    id: 'ice',
    in: ['plan', 'words'],
    max: 2,
    test: /\b(chains?|pendant|iced( out)?|icy|jewelry|jewels|grills?|rollie|rolex|patek|diamonds?|bling)\b/,
    score: { medium: 1.5, close: 1 },
    why: { medium: 'Waist up, so the chain catches the light.', close: 'Close, so the ice catches the light.' },
  },
  {
    id: 'flex',
    in: ['plan', 'words'],
    max: 2,
    test: /\b(boss|king|queen|crown|on top|top of the (world|game)|made it|we won|i won|winning|champion|champ|legend|goat|rich|millions?|billions?|bands|racks|flex(in|ing)?|stunt(in|ing)?|ball(in|ing))\b/,
    angle: 'low',
    score: { wide: 1.5 },
    why: { wide: 'This is the flex, so the camera goes low and you look larger than life.' },
  },
  {
    id: 'heat',
    in: ['words', 'about'],
    max: 2,
    test: /\b(opps?|war|beef|slid(e|ing)|spin(ning)? (the|da) block|revenge|enemies|haters?|pressure|menace|goons?)\b/,
    angle: 'low',
    move: 'sway',
    score: { close: 2 },
    why: { close: 'This part hits hard, so the camera gets in your face.' },
  },
  {
    id: 'pain',
    in: ['plan', 'words', 'about'],
    max: 3,
    test: /\b(cry|cried|crying|tears?|pain|hurt(s|ing)?|lonely|alone|grief|griev(e|ing)|heart ?broken|heartbreak|broken|rip|rest in peace|passed (away|on)|funeral|grave|died|dead (homies|friends)|demons|depress(ed|ion)|anxiety|sorry|forgive|pray(ing|ers?)?|god|lord|mama|momma|mom|grandma|granny|my (brother|sister|son|daughter|kids?|father|dad|pops)|scars?|trauma|miss (you|her|him|them|my))\b/,
    move: 'push',
    score: { close: 2.5 },
    why: { close: 'These bars are personal, so the camera stays on your face.' },
    whyAbout: { close: 'The song is personal, so the camera stays close.' },
  },
  {
    id: 'heart',
    in: ['words', 'about'],
    max: 3,
    test: /\b(love|heart|feel(s|in|ing)?|feelings|remember|memories|trust|soul|dream(s|ing)?|real one|truth)\b/,
    move: 'push',
    score: { close: 0.75 },
    why: { close: 'This part comes from the heart, so the camera comes in close.' },
    whyAbout: { close: 'The song comes from the heart, so the camera stays close.' },
  },
  {
    id: 'story',
    in: ['words', 'about'],
    max: 2,
    test: /\b(i remember|back then|growing up|when i was|used to|came up|from the bottom|my story|ain'?t have|struggl(e|ed|ing))\b/,
    move: 'push',
    score: { medium: 1, close: 1 },
    why: { medium: "You're telling the story here, so the camera leans in.", close: "You're telling the story here, so the camera leans in." },
  },
];

/** Words in the plan that name the shot outright. They win over everything the director reads. */
const SAID: [RegExp, Framing][] = [
  [/\b(close[- ]?ups?|closeups?|tight (shot|on (my|your|his|her|the) face)|in (my|your|his|her) face|extreme close|face to the (camera|lens))\b/, 'close'],
  [/\b(wide shots?|wide angle|full[- ]body|head to toe|establishing( shot)?|whole body|full[- ]length)\b/, 'wide'],
  [/\b(medium shots?|mid[- ]shots?|waist[- ]up)\b/, 'medium'],
];

const LOW_WORDS = /\b(low angle|from below|looking up at (me|him|her|you|them))\b/;
const HIGH_WORDS = /\b(high angle|from above|overhead shot|bird'?s[- ]eye|looking down (at|on) (me|him|her|you|them))\b/;

const MOVE_WORDS: [RegExp, CameraMove][] = [
  [/\b(push[- ]?ins?|pushing in|slow push|dolly in|creep(s|ing)? in)\b/, 'push'],
  [/\b(pull[- ]?(back|out)s?|pulling (back|out)|dolly out|reveal)\b/, 'pull'],
  [/\b(orbit(s|ing)?|circl(e|es|ing) (around|me|him|her)|360|spin(s|ning)? around (me|him|her))\b/, 'arc'],
  [/\b(handheld|shaky|run[- ]and[- ]gun)\b/, 'sway'],
  [/\b(locked[- ]off|static shot|still shot|tripod shot)\b/, 'still'],
];

const BASE: Record<Framing, number> = { medium: 1, wide: 0.9, close: 0.8 };

const TEMPO: Record<SceneRead['tempo'], Partial<Record<Framing, number>>> = { fast: { wide: 0.5 }, mid: {}, slow: { close: 0.75 } };

const VIBE: Partial<Record<Vibe, Partial<Record<Framing, number>>>> = {
  Melodic: { close: 0.75 },
  Dark: { close: 0.5 },
  Drill: { wide: 0.5 },
  Trap: { wide: 0.5 },
  'Boom bap': { medium: 0.75 },
};

/** Old projects still say verse and hook. Scenes laid out by time don't. */
const KIND: Record<SectionKind, Omit<Cue, 'id' | 'in' | 'test'>> = {
  hook: { score: { wide: 3 }, angle: 'low', move: 'arc', why: { wide: "It's the hook, so the camera goes low and you look larger than life." } },
  intro: { score: { wide: 2 }, move: 'push', why: { wide: 'We open wide so people see where we are.' } },
  outro: { score: { wide: 1 }, move: 'pull', why: { wide: 'We back away as the song ends.' } },
  bridge: { score: { close: 2 }, move: 'push', why: { close: 'The bridge is the turn, so the camera comes in close.' } },
  verse: { score: { medium: 0.5, close: 0.5 } },
};

/** Said when nothing in particular decides the shot. */
const DEFAULT_WHY: Record<Framing, string> = {
  wide: 'Head to toe, so we see the whole world around you.',
  medium: 'Waist up: close enough to feel you, wide enough to move.',
  close: 'Chest up, so every word lands.',
};

/** The shot the director calls for a scene. */
export interface ShotPick {
  framing: Framing;
  pose: Pose;
  angle: ShotAngle;
  move: CameraMove;
  why: string;
  by: 'director' | 'artist';
  props: Prop[];
}

/** One reason in the running, with how much it weighs for each framing. */
interface Vote {
  score: Partial<Record<Framing, number>>;
  why?: Partial<Record<Framing, string>>;
  angle?: ShotAngle;
  move?: CameraMove;
}

function count(re: RegExp, text: string): number {
  if (!text) return 0;
  return (text.match(new RegExp(re.source, 'g')) ?? []).length;
}

/** The plan without things that hang in the scene, so "a mic hanging from the ceiling" isn't you hanging or a mic stand. */
function cleanPlan(plan: string): string {
  return plan.replace(HANGING_THINGS, ' ').replace(new RegExp(MIC_HANGING.source, 'g'), ' ');
}

/**
 * Calls the shot for one scene. A shot picked on purpose (by the director in the plan or by the
 * artist) sets the framing; otherwise the director scores wide, medium and close on what it read,
 * and the strongest reason for the winner is what the artist reads on set.
 */
export function callShot(read: SceneRead, call?: ShotCall): ShotPick {
  const raw = ` ${read.plan.toLowerCase()} `;
  const plan = cleanPlan(raw);
  const words = ` ${read.words.toLowerCase()} `;
  const about = ` ${read.about.toLowerCase()} `;

  const votes: Vote[] = [];
  const matched = new Set<string>();
  let pose: Pose = 'stand';
  for (const cue of CUES) {
    const text = cue.id === 'hangingMic' ? raw : plan;
    const inPlan = cue.in.includes('plan') && cue.test.test(text) ? 1 : 0;
    const inWords = cue.in.includes('words') ? Math.min(cue.max ?? 1, count(cue.test, words)) : 0;
    const inAbout = cue.in.includes('about') && cue.test.test(about) ? 0.5 : 0;
    const times = inPlan + inWords + inAbout;
    if (!times) continue;
    matched.add(cue.id);
    if (cue.pose && pose === 'stand') pose = cue.pose;
    const score = Object.fromEntries(Object.entries(cue.score).map(([f, s]) => [f, (s as number) * times])) as Vote['score'];
    votes.push({ score, why: inPlan + inWords ? cue.why : (cue.whyAbout ?? cue.why), angle: cue.angle, move: cue.move });
  }
  if (read.kind) votes.push(KIND[read.kind]);
  if (read.energy !== undefined) {
    if (read.energy >= 1.12) {
      votes.push({ score: { wide: 2.5 + (read.peak ? 1 : 0) }, angle: 'low', move: 'arc', why: { wide: 'The song hits hardest here, so the camera goes low and you look larger than life.' } });
    } else if (read.energy <= 0.88) {
      votes.push({ score: { close: 2 }, move: 'push', why: { close: 'The song pulls back here, so the camera comes in close.' } });
    }
  }
  if (read.index === 0 && read.count > 1) votes.push({ score: { wide: 1.5 }, move: 'push', why: { wide: 'We open wide so people see where we are.' } });
  const last = read.count >= 3 && read.index === read.count - 1;
  if (last) votes.push({ score: { wide: 0.5 }, move: 'pull', why: { wide: 'We back away as the song ends.' } });
  votes.push({ score: TEMPO[read.tempo] });
  if (read.vibe && VIBE[read.vibe]) votes.push({ score: VIBE[read.vibe]! });

  const said = SAID.map(([re, f]) => ({ f, at: plan.search(re) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at)[0]?.f;
  const prev = read.before[read.before.length - 1];
  const prev2 = read.before[read.before.length - 2];
  const recent = read.before.slice(-3);
  const total = (f: Framing) => {
    let s = BASE[f];
    for (const v of votes) s += v.score[f] ?? 0;
    if (f === prev) s -= 3;
    if (f === prev && f === prev2) s -= 2;
    // A framing the last few scenes haven't used is fresh for the cut.
    if (recent.length >= 2 && !recent.includes(f)) s += 0.75;
    return s;
  };
  // Ties go to a framing the last scene didn't use, then rotate so a quiet stretch still moves.
  const order = FRAMINGS.map((f, i) => FRAMINGS[(i + read.index) % FRAMINGS.length]);
  const scored = order.slice().sort((a, b) => total(b) - total(a) || Number(a === prev) - Number(b === prev));
  const framing: Framing = call?.framing ?? said ?? scored[0];

  // The reason: what argued hardest for this framing.
  const backing = votes
    .map((v) => ({ v, w: v.score[framing] ?? 0 }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w);
  const decider = backing.find((x) => x.v.why?.[framing])?.v;
  let why: string;
  if (call?.why) why = call.why;
  else if (call?.by === 'artist') why = `Your call. ${DEFAULT_WHY[framing]}`;
  else if (!call && said) why = `The plan calls for ${framing === 'wide' ? 'a wide' : framing === 'medium' ? 'a medium shot' : 'a close-up'}.`;
  else if (decider?.why?.[framing]) why = decider.why[framing]!;
  else if (prev && prev !== framing) why = `A change from the ${FRAMING_NAME[prev].toLowerCase()} before it, so the cut keeps moving.`;
  else why = DEFAULT_WHY[framing];

  // The angle: said outright, or argued for by what backs this framing.
  let angle: ShotAngle = 'level';
  if (call?.angle) angle = call.angle;
  else if (LOW_WORDS.test(plan)) angle = 'low';
  else if (HIGH_WORDS.test(plan)) angle = 'high';
  else {
    const low = backing.filter((x) => x.v.angle === 'low').reduce((sum, x) => sum + x.w, 0);
    if (low >= 1.5) angle = 'low';
  }

  // The move, for someone filming: said outright, then what decided the shot, then the framing's own.
  const saidMove = MOVE_WORDS.find(([re]) => re.test(plan))?.[1];
  const fast = read.tempo === 'fast' || (read.energy ?? 1) >= 1.12;
  // In a car there's nowhere to walk: whoever films holds it still, like it's on the dash.
  const move: CameraMove =
    saidMove ??
    (matched.has('car') ? 'still' : undefined) ??
    decider?.move ??
    (last ? 'pull' : framing === 'close' ? 'push' : framing === 'wide' ? (fast ? 'arc' : 'sway') : pose === 'sit' ? 'still' : 'sway');

  return { framing, pose, angle, move, why, by: call?.by ?? 'director', props: propsFor(read.plan) };
}

// ---------- Props ----------

/**
 * What the scene needs you to hold, lean on or sit in, and what to use at home instead.
 * The switch keeps your body exactly as shot, so the pose has to be real: hang from something,
 * grip something, sit on something.
 */
const PROP_RULES: { kind: PropKind; test: RegExp; raw?: boolean; for: string; say: string }[] = [
  {
    kind: 'bar',
    test: HANG,
    for: 'the grab handle',
    say: 'Hang on to something at head height: a door frame, a pull-up bar, or a broom laid across two chairs. Grip it the way you would in the scene.',
  },
  {
    kind: 'mic',
    test: MIC_HANGING,
    raw: true,
    for: 'the hanging mic',
    say: "Hang a stand-in at mouth height, a hand's width in front of your face: a sock or hairbrush on a string or charger cable, tied to a door frame, a curtain rod or a broom across two chairs. Rap into it like the real mic.",
  },
  {
    kind: 'stand',
    test: MIC,
    for: 'the mic stand',
    say: 'Prop a broom or mop upright where the mic stand goes and hold it like one. Mouth height for the mic.',
  },
  {
    kind: 'seat',
    test: IN_CAR,
    for: 'the car seat',
    say: 'Sit on a chair or stool at car-seat height. Hands where the wheel would be, or on your knee if you ride shotgun.',
  },
  {
    kind: 'seat',
    test: RIDE,
    for: 'the seat',
    say: 'Sit on a stool or the arm of a couch, a leg either side, hands out front where the handlebars are.',
  },
  {
    kind: 'seat',
    test: JET,
    for: 'your seat',
    say: 'Sit in a chair with arms if you have one, leaned back like the seat on the jet.',
  },
  {
    kind: 'seat',
    test: new RegExp(`${THRONE.source}|${SEATED.source}`),
    for: 'the seat',
    say: 'Sit on a chair or the edge of a bed. Same height the seat has in the scene.',
  },
  {
    kind: 'wall',
    test: LEAN,
    for: 'what you lean on',
    say: 'Lean on a wall or the back of a chair at hip height, the way you would in the scene.',
  },
  {
    kind: 'table',
    test: TABLE,
    for: 'the table',
    say: 'Use a table or counter at the same height. Put your hands where they would rest in the scene.',
  },
  {
    kind: 'steps',
    test: STEPS,
    for: 'the steps',
    say: 'Sit or stand on a step or a sturdy box so your height matches the stairs.',
  },
];

export function propsFor(text: string): Prop[] {
  const raw = ` ${text.toLowerCase()} `;
  const clean = cleanPlan(raw);
  const out: Prop[] = [];
  for (const rule of PROP_RULES) {
    if (rule.test.test(rule.raw ? raw : clean) && !out.some((p) => p.kind === rule.kind)) out.push({ kind: rule.kind, for: rule.for, say: rule.say });
  }
  // One mic: a stand the artist asked for by name beats the hanging one, and the hanging one beats a passing "mic".
  const mics = out.filter((p) => p.kind === 'mic' || p.kind === 'stand');
  const drop = mics.length > 1 ? (MIC_STAND.test(clean) ? 'mic' : 'stand') : undefined;
  return out.filter((p) => p.kind !== drop).slice(0, 2);
}

/** One thing to set up before a scene: how you're placed, or a stand-in for something in the scene. */
export interface SetupItem {
  kind: 'pose' | PropKind;
  title: string;
  say: string;
}

const POSE_TITLE: Record<Exclude<Pose, 'stand'>, string> = { sit: 'Sit down', hang: 'Hang on', lean: 'Lean back' };
/** The prop each pose is done on: its instructions become the pose's own. */
const POSE_PROP: Record<Exclude<Pose, 'stand'>, PropKind[]> = { sit: ['seat', 'steps'], hang: ['bar'], lean: ['wall'] };
const POSE_SAY: Record<Exclude<Pose, 'stand'>, string> = {
  sit: 'This scene is seated. Sit on a chair or stool at the height the seat has in the scene.',
  hang: 'This scene has you hanging on. Grip something at head height: a door frame, a pull-up bar, or a broom across two chairs.',
  lean: 'This scene has you leaning. Lean on a wall or the back of a chair at hip height.',
};
const PROP_TITLE: Record<PropKind, string> = {
  bar: 'Something to hang on',
  stand: 'A stand-in for the mic stand',
  mic: 'A stand-in for the hanging mic',
  seat: 'A seat',
  wall: 'Something to lean on',
  table: 'A table',
  steps: 'A step',
};

/**
 * What to set up before a scene, in order: how you're placed first (sit down, hang on, lean back),
 * then a stand-in for everything you touch. The switch keeps your body exactly as shot, so the pose
 * and the props have to be real for the scene to look real.
 */
export function setupList(g: Pick<SetGuide, 'pose' | 'props'>): SetupItem[] {
  const props = g.props ?? [];
  const out: SetupItem[] = [];
  let used: PropKind | undefined;
  if (g.pose !== 'stand') {
    const prop = props.find((p) => POSE_PROP[g.pose as Exclude<Pose, 'stand'>].includes(p.kind));
    used = prop?.kind;
    out.push({ kind: 'pose', title: POSE_TITLE[g.pose as Exclude<Pose, 'stand'>], say: prop?.say ?? POSE_SAY[g.pose as Exclude<Pose, 'stand'>] });
  }
  for (const p of props) if (p.kind !== used) out.push({ kind: p.kind, title: PROP_TITLE[p.kind], say: p.say });
  return out;
}

// ---------- The song ----------

/**
 * How loud a stretch of the song is against the whole video, from the waveform: above 1 the song
 * hits harder there (usually the hook), below 1 it pulls back.
 */
export function sceneEnergy(
  peaks: number[] | undefined,
  durationSec: number,
  range: { start: number; end: number },
  part: { start: number; end: number },
): number | undefined {
  if (!peaks || peaks.length < 8 || durationSec <= 0) return undefined;
  const per = durationSec / peaks.length;
  const avg = (a: number, b: number) => {
    const i0 = Math.max(0, Math.min(peaks.length - 1, Math.floor(a / per)));
    const i1 = Math.max(i0 + 1, Math.min(peaks.length, Math.ceil(b / per)));
    let sum = 0;
    for (let i = i0; i < i1; i++) sum += peaks[i];
    return sum / (i1 - i0);
  };
  const all = avg(range.start, range.end);
  if (all < 1e-4) return undefined;
  return Math.round((avg(Math.max(part.start, range.start), Math.min(part.end, range.end)) / all) * 100) / 100;
}

// ---------- The set guide ----------

/** "2.0 m (6.6 ft)": the guide speaks both, most artists think in feet. */
export function len(m: number): string {
  return `${m.toFixed(1)} m (${(m * 3.281).toFixed(1)} ft)`;
}

function heightWord(h: number, pose: Pose): string {
  if (pose === 'sit') return h < 0.6 ? 'seat height' : h < 1.1 ? 'chest height' : h < 1.4 ? 'eye height' : 'above your head';
  return h < 0.75 ? 'knee height' : h < 1.15 ? 'waist height' : h < 1.45 ? 'chest height' : h < 1.6 ? 'shoulder height' : h < 1.85 ? 'eye height' : 'above your head';
}

const MARK: Record<Pose, (back: string) => string> = {
  stand: (back) => `Stand on your mark, ${back} out from the wall. Plain walls switch cleanest.`,
  lean: (back) => `Your mark is right in front of what you lean on, ${back} out from the wall.`,
  sit: (back) => `Put your seat on the mark, ${back} out from the wall, and sit the way you would in the scene.`,
  hang: (back) => `Your mark is under what you hang on to, ${back} out from the wall behind you. Arms up, both hands on it.`,
};

const FILMING: Record<CameraMove, string> = {
  still: 'Someone filming: same spot and height, phone in both hands, held as still as you can.',
  push: 'Someone filming: start at the same spot and height and walk in slowly, about a step over the scene. Keep you in the middle of the frame.',
  pull: 'Someone filming: start a step closer and back away slowly over the scene. Keep you in the middle of the frame.',
  arc: 'Someone filming: same height, and walk a slow arc around you, about a quarter circle, keeping you in the middle.',
  sway: "Someone filming: same spot and height, phone in both hands. Move a little with the beat, but keep you in frame and don't walk past your mark.",
};

const IN_FRAME: Record<Pose, Record<Framing, string>> = {
  stand: { wide: 'Head to toe in frame', medium: 'Waist up in frame', close: 'Chest up in frame' },
  lean: { wide: 'Head to toe in frame', medium: 'Waist up in frame', close: 'Chest up in frame' },
  sit: { wide: 'All of you in frame, feet to the top of your head', medium: 'Waist up in frame', close: 'Chest up in frame' },
  hang: { wide: 'Head to toe in frame, hands on the bar too', medium: 'Waist up in frame, hands on the bar too', close: 'Chest up in frame, hands on the bar too' },
};

export const MOVE_NAME: Record<CameraMove, string> = {
  still: 'Hold still',
  push: 'Push in slowly',
  pull: 'Back away slowly',
  arc: 'Walk an arc around',
  sway: 'Move with the beat',
};

/** The set guide for a called shot: where everything goes and the plain steps to get there. */
export function buildGuide(scene: number, pick: ShotPick, place: { side: number; light: SetGuide['light'] }): SetGuide {
  const rig = rigFor(pick.framing, pick.pose, pick.angle);
  const { side, light } = place;
  const tilt = pick.angle === 'low' ? ', tilted up at you' : pick.angle === 'high' ? ', tilted down at you' : '';
  const steps = [
    `Find a clear space: a plain wall, nothing busy, and about ${len(rig.backroomM + rig.distance)} from the wall to where the phone goes.`,
    ...pick.props.map((pr) => `For ${pr.for}: ${pr.say}`),
    MARK[pick.pose](len(rig.backroomM)),
    `Propped up: phone on a tripod or books, ${len(rig.distance)} away${side ? ', a half step off center' : ', straight on'}, ${len(rig.height)} off the floor, about ${heightWord(rig.height, pick.pose)}${tilt}. Stay on your mark; the editor adds the zoom-ins and the handheld feel.`,
    FILMING[pick.move],
    `${IN_FRAME[pick.pose][pick.framing]}, front camera at 1x, so you can watch yourself. Leave a little room around you, so the editor can punch in on the beat.`,
    ...(rig.backDistance ? [`Someone filming on the back camera? ${rig.backZoom}x zoom from ${len(rig.backDistance)} is sharper and kinder to your face.`] : []),
    ...(rig.ultraWideDistance ? [`Short on room? The back camera's 0.5x can come in to ${len(rig.ultraWideDistance)}.`] : []),
    light === 'behind camera' ? 'Main light behind the phone, pointing at you.' : `Main light on your ${light}, so the background stays clean.`,
  ];
  return {
    scene,
    framing: pick.framing,
    pose: pick.pose,
    angle: pick.angle,
    move: pick.move,
    why: pick.why,
    by: pick.by,
    frame: rig.frame,
    zoom: rig.zoom,
    camera: { x: side, z: rig.distance, height: rig.height },
    lensMm: rig.lensMm,
    backroomM: rig.backroomM,
    light,
    steps,
    props: pick.props,
  };
}

/** "Close-up", "Wide · low angle", "Medium · seated". */
export function shotTitle(g: Pick<SetGuide, 'framing' | 'angle' | 'pose'>): string {
  return [FRAMING_NAME[g.framing], g.angle === 'low' ? 'low angle' : g.angle === 'high' ? 'high angle' : '', g.pose === 'sit' ? 'seated' : ''].filter(Boolean).join(' · ');
}

/** The lens button: "1x", "1.5x", "2x". */
export function zoomLabel(g: Pick<SetGuide, 'zoom'>): string {
  return `${g.zoom}x`;
}

/**
 * The second framing to shoot a scene at, for coverage: the editor cuts between the two on the beat.
 * Wide and medium go close; a close-up goes wide, or medium when seated; hanging stays wide enough for the hands.
 */
export function coverFor(g: Pick<SetGuide, 'framing' | 'pose'>): Framing {
  if (g.pose === 'hang') return g.framing === 'wide' ? 'medium' : 'wide';
  if (g.framing === 'close') return g.pose === 'sit' ? 'medium' : 'wide';
  return 'close';
}

type OldGuide = Omit<SetGuide, 'pose' | 'angle' | 'move' | 'why' | 'by' | 'frame' | 'zoom'> & Partial<SetGuide>;

/** Guides saved before shot calls: fill in what they didn't have, keep what they said. */
export function upgradeGuide(g: OldGuide): SetGuide {
  const kinds = new Set((g.props ?? []).map((p) => p.kind));
  const pose: Pose = g.pose ?? (kinds.has('bar') ? 'hang' : kinds.has('seat') ? 'sit' : kinds.has('wall') ? 'lean' : 'stand');
  return {
    ...g,
    pose,
    angle: g.angle ?? (g.framing === 'wide' && g.camera.height < 1 ? 'low' : 'level'),
    move: g.move ?? 'sway',
    why: g.why ?? '',
    by: g.by ?? 'director',
    frame: g.frame ?? SPAN[pose][g.framing],
    zoom: g.zoom ?? (g.lensMm >= 45 ? 2 : g.lensMm >= 30 ? 1.5 : 1),
  };
}
