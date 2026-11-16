import type { BrollIdea, LocationKind, Look, LyricLine, PlannedTake, Section, SectionKind, Song, Vibe } from './types';

// Demo content. The three beats are original instrumentals made by scripts/make-demo-beats.py;
// the lyrics are placeholders written for the demo.

export interface DemoTrack {
  id: string;
  title: string;
  bpm: number;
  /** Section kind, label and length in bars, in song order. */
  layout: [SectionKind, string, number][];
}

const FULL: DemoTrack['layout'] = [
  ['intro', 'Intro', 4],
  ['verse', 'Verse 1', 12],
  ['hook', 'Hook', 8],
  ['verse', 'Verse 2', 12],
  ['hook', 'Hook', 8],
  ['outro', 'Outro', 4],
];

const SHORT: DemoTrack['layout'] = [
  ['intro', 'Intro', 2],
  ['verse', 'Verse 1', 8],
  ['hook', 'Hook', 4],
  ['verse', 'Verse 2', 8],
  ['hook', 'Hook', 4],
  ['outro', 'Outro', 2],
];

export const DEMO_TRACKS: DemoTrack[] = [
  { id: 'out-the-mud', title: 'Out the Mud', bpm: 142, layout: FULL },
  { id: 'late-night', title: 'Late Night Freestyle', bpm: 92, layout: SHORT },
  { id: 'windy-city', title: 'Windy City', bpm: 140, layout: FULL },
];

export function barSec(bpm: number): number {
  return (4 * 60) / bpm;
}

export function demoDuration(track: DemoTrack): number {
  return round(track.layout.reduce((sum, [, , bars]) => sum + bars, 0) * barSec(track.bpm));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Sections laid on the bar grid. */
export function sectionsFromLayout(layout: [SectionKind, string, number][], bpm: number, downbeatSec = 0): Section[] {
  const bar = barSec(bpm);
  let bars = 0;
  return layout.map(([kind, label, n], i) => {
    const start = round(downbeatSec + bars * bar);
    bars += n;
    return { id: `sec-${i + 1}`, kind, label, start: i === 0 ? 0 : start, end: round(downbeatSec + bars * bar) };
  });
}

const VERSE_LINES = [
  'Came up from the bottom with a plan in my pocket',
  'Mama said keep going so I never could stop it',
  'Late nights in the studio, the city on mute',
  'Every bar a brick, now I am building the roof',
];

const HOOK_LINES = [
  'Out the mud, yeah, we out the mud',
  'Lights on me, it is showtime, cuz',
  'Out the mud, yeah, they know what it was',
  'From the block to the stage, we out the mud',
];

/** Spreads each line's words over two bars of the beat, starting at the section start. */
function lyricsFor(sections: Section[], bpm: number): LyricLine[] {
  const beat = 60 / bpm;
  const lines: LyricLine[] = [];
  for (const section of sections) {
    const source = section.kind === 'hook' ? HOOK_LINES : section.kind === 'verse' ? VERSE_LINES : [];
    let t = section.start;
    let i = 0;
    while (source.length && t < section.end - beat * 4) {
      const words = source[i % source.length].split(' ');
      const step = (beat * 7) / words.length;
      lines.push({
        sectionId: section.id,
        words: words.map((w, k) => ({ text: w, t: Math.round((t + k * step) * 100) / 100 })),
      });
      t += beat * 8;
      i += 1;
    }
  }
  return lines;
}

export function songFromDemo(track: DemoTrack, analyzed = false): Song {
  const sections = sectionsFromLayout(track.layout, track.bpm);
  return {
    id: track.id,
    title: track.title,
    durationSec: demoDuration(track),
    bpm: track.bpm,
    downbeatSec: 0,
    sections,
    lyrics: lyricsFor(sections, track.bpm),
    analyzed,
    source: 'demo',
    audioId: track.id,
  };
}

/** What the analyzer found in an imported file. */
export interface ImportedTrack {
  title: string;
  durationSec: number;
  bpm: number;
  downbeatSec: number;
  sections: Section[];
  audioId: string;
  peaks?: number[];
}

export function songFromImport(track: ImportedTrack, analyzed = false): Song {
  return {
    id: `song-${track.audioId}`,
    title: track.title,
    durationSec: track.durationSec,
    bpm: track.bpm,
    downbeatSec: track.downbeatSec,
    sections: track.sections,
    lyrics: [],
    analyzed,
    source: 'import',
    audioId: track.audioId,
    peaks: track.peaks,
  };
}

/** Shots that cut well together. A suggestion, not a requirement. */
export const DEFAULT_TAKE_PLAN: PlannedTake[] = [
  { angle: 'Wide', scope: 'Full song' },
  { angle: 'Close-up', scope: 'Full song' },
  { angle: 'Low angle', scope: 'Hook only' },
  { angle: 'Second outfit', scope: 'Full song' },
];

export interface LocationPreset {
  id: LocationKind;
  title: string;
  detail: string;
  /** Scene direction for SwitchX: what the world is and how it moves. */
  prompt: string;
}

export const LOCATIONS: LocationPreset[] = [
  {
    id: 'alley',
    title: 'Alley',
    detail: 'Wet brick, neon, steam',
    prompt:
      'Night in a narrow city alley just after rain. Wet brick walls, neon signs glowing teal and magenta, steam drifting from a vent, puddles catching the light. The camera stays with the performer.',
  },
  {
    id: 'hangingMic',
    title: 'Hanging mic',
    detail: 'One light, one mic, black room',
    prompt:
      'A black studio with one microphone hanging from the ceiling and a single hard spotlight overhead. Haze drifts through the beam, deep shadows, a faint rim light from behind.',
  },
  {
    id: 'beach',
    title: 'Beach',
    detail: 'Dusk, low sun, waves',
    prompt:
      'An empty beach at dusk. Low orange sun on the horizon, waves rolling in slowly, wind moving the palms, warm light on the skin.',
  },
  {
    id: 'whiteVoid',
    title: 'White room',
    detail: 'Clean white cyclorama',
    prompt: 'A seamless white cyclorama studio. Soft even light, a clean floor reflection, nothing else in frame.',
  },
  {
    id: 'darkVoid',
    title: 'Dark room',
    detail: 'Black void with a rim light',
    prompt: 'A black void. One cold rim light from behind, low haze near the floor, everything else falls to black.',
  },
];

export function locationPreset(id: LocationKind): LocationPreset {
  return LOCATIONS.find((l) => l.id === id) ?? LOCATIONS[0];
}

export function locationTitle(id: LocationKind | 'custom'): string {
  return id === 'custom' ? 'Custom' : locationPreset(id).title;
}

export function lookFor(location: LocationKind): Look {
  return { location, prompt: locationPreset(location).prompt, refs: [] };
}

/** The director's first pitch: verses in the alley, hooks under the hanging mic. */
export function suggestedLooks(sections: Section[]): Record<string, Look> {
  const pick: Record<SectionKind, LocationKind> = {
    intro: 'darkVoid',
    verse: 'alley',
    hook: 'hangingMic',
    bridge: 'whiteVoid',
    outro: 'beach',
  };
  // Scenes take turns, so a video moves through worlds instead of sitting in one.
  const rotation: LocationKind[] = ['alley', 'hangingMic', 'beach', 'darkVoid', 'whiteVoid'];
  let scene = 0;
  return Object.fromEntries(sections.map((s) => [s.id, lookFor(s.scene ? rotation[scene++ % rotation.length] : pick[s.kind])]));
}

/** About how long a scene runs before the video moves to its next look. */
export const SCENE_SEC = 20;

/**
 * Lays the video out in scenes by time, on whole bars: no verse or hook needed.
 * `range` is where recording starts and stops; song outside it is kept as unused "Before" and "After".
 */
export function scenesFor(song: Song, range?: { start: number; end: number }): Section[] {
  const duration = song.durationSec;
  const start = Math.max(0, Math.min(range?.start ?? 0, duration));
  const end = Math.max(start, Math.min(range?.end ?? duration, duration));
  const bar = barSec(song.bpm);
  const totalBars = Math.max(1, Math.round((end - start) / bar));
  const count = Math.max(1, Math.round((end - start) / SCENE_SEC));
  const perScene = Math.max(1, Math.ceil(totalBars / count));
  const out: Section[] = [];
  if (start > 0.05) out.push({ id: 'before', kind: 'intro', label: 'Before', start: 0, end: round(start) });
  let t = start;
  let n = 0;
  while (t < end - 0.05) {
    let e = Math.min(end, t + perScene * bar);
    if (end - e < bar * 0.5) e = end;
    n += 1;
    out.push({ id: `scene-${n}`, kind: 'verse', label: `Scene ${n}`, start: round(t), end: round(e), scene: true });
    t = e;
  }
  if (end < duration - 0.05) out.push({ id: 'after', kind: 'outro', label: 'After', start: round(end), end: round(duration) });
  return out;
}

export function withScenes(song: Song, range?: { start: number; end: number }): Song {
  return { ...song, sections: scenesFor(song, range) };
}

const BROLL_BY_VIBE: Record<Vibe, string[]> = {
  Drill: [
    'Headlights cutting through fog on an empty street, slow push in',
    'A chain swinging in slow motion against black, hard side light',
    'City skyline at night, clouds racing, cold blue grade',
  ],
  Trap: [
    'Stage lights snapping on over an empty crowd barrier',
    'Money counter fanning bills in slow motion, shallow focus',
    'A sports car door lifting open under a parking garage light',
  ],
  Melodic: [
    'Rain running down a window with city lights soft behind it',
    'A long empty highway at blue hour, slow drift forward',
    'Smoke curling through a single beam of warm light',
  ],
  'Boom bap': [
    'A vinyl record spinning, needle dropping, dust in the light',
    'Subway train doors closing, 16mm film grain',
    'Hands flipping through crates of records, handheld',
  ],
  Dark: [
    'A flickering streetlight over an empty lot, slow zoom',
    'Black smoke rolling across a concrete floor, low angle',
    'A crow taking off from a power line against a gray sky',
  ],
};

/** Cutaway shots that fit a vibe, for when the director needs one of its own. */
export function brollShots(vibe: Vibe | undefined): string[] {
  return BROLL_BY_VIBE[vibe ?? 'Trap'];
}

/** B-roll the director pitches: lyric-matched for the demo songs, vibe-matched otherwise. */
export function pitchBroll(song: Song, vibe: Vibe | undefined, model: BrollIdea['model'] = 'omni'): BrollIdea[] {
  const bar = barSec(song.bpm);
  const verses = song.sections.filter((s) => s.kind === 'verse');
  const outro = song.sections.find((s) => s.kind === 'outro');
  const spots: { section: Section; at: number }[] = [];
  // Halfway into each verse, and the top of the outro. Hooks stay on the performance.
  for (const v of verses.slice(0, 2)) {
    const bars = Math.max(1, Math.round((v.end - v.start) / bar));
    spots.push({ section: v, at: v.start + Math.floor(bars / 2) * bar });
  }
  if (outro) spots.push({ section: outro, at: outro.start });
  const shots = BROLL_BY_VIBE[vibe ?? 'Trap'];
  const lyricAt = (t: number) => {
    const line = song.lyrics.find((l) => l.words.length && l.words[0].t >= t - 0.01);
    return line ? line.words.map((w) => w.text).join(' ') : undefined;
  };
  return spots.map((spot, i) => ({
    id: `broll-${i + 1}`,
    lyric: lyricAt(spot.at) ?? `${spot.section.label}, ${formatBar(spot.at, song)}`,
    shot: shots[i % shots.length],
    sectionId: spot.section.id,
    at: Math.round(spot.at * 1000) / 1000,
    durationSec: Math.round(Math.max(3, bar * 2) * 1000) / 1000,
    status: 'idea',
    keep: true,
    model,
  }));
}

function formatBar(t: number, song: Song): string {
  const n = Math.floor((t - song.downbeatSec) / barSec(song.bpm)) + 1;
  return `bar ${Math.max(1, n)}`;
}
