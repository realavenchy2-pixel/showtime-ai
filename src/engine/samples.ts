import type {
  BrollIdea,
  GenjutsuSwap,
  LocationKind,
  LyricLine,
  PlannedTake,
  Section,
  Song,
} from './types';

// Sample content for the prototype. Lyrics are placeholders written for this demo.

export interface SampleTrack {
  id: string;
  title: string;
  durationSec: number;
  bpm: number;
}

export const SAMPLE_TRACKS: SampleTrack[] = [
  { id: 'out-the-mud', title: 'Out the Mud', durationSec: 178, bpm: 142 },
  { id: 'late-night', title: 'Late Night Freestyle', durationSec: 126, bpm: 92 },
  { id: 'windy-city', title: 'Windy City', durationSec: 164, bpm: 140 },
];

function sectionsFor(durationSec: number): Section[] {
  // A common rap song layout, scaled to the track length.
  const shape: [Section['kind'], string, number][] = [
    ['intro', 'Intro', 0.04],
    ['verse', 'Verse 1', 0.23],
    ['hook', 'Hook', 0.15],
    ['verse', 'Verse 2', 0.23],
    ['hook', 'Hook', 0.15],
    ['outro', 'Outro', 0.2],
  ];
  const out: Section[] = [];
  let t = 0;
  shape.forEach(([kind, label, share], i) => {
    const end = i === shape.length - 1 ? durationSec : Math.round((t + share * durationSec) * 10) / 10;
    out.push({ id: `sec-${i + 1}`, kind, label, start: t, end });
    t = end;
  });
  return out;
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
    let t = section.start + beat * 2;
    for (const text of source) {
      if (t >= section.end) break;
      const words = text.split(' ');
      const step = (beat * 8) / words.length;
      lines.push({
        sectionId: section.id,
        words: words.map((w, i) => ({ text: w, t: Math.round((t + i * step) * 100) / 100 })),
      });
      t += beat * 8;
    }
  }
  return lines;
}

export function songFromTrack(track: SampleTrack, analyzed = false): Song {
  const sections = sectionsFor(track.durationSec);
  return {
    id: track.id,
    title: track.title,
    durationSec: track.durationSec,
    bpm: track.bpm,
    sections,
    lyrics: lyricsFor(sections, track.bpm),
    analyzed,
  };
}

export const DEFAULT_TAKE_PLAN: PlannedTake[] = [
  { angle: 'Wide', scope: 'Full song' },
  { angle: 'Close-up', scope: 'Full song' },
  { angle: 'Low angle', scope: 'Hook only' },
  { angle: 'Second outfit', scope: 'Full song' },
];

/** The director's first pitch for locations: verses in the alley, hooks under the hanging mic. */
export function suggestedLocations(sections: Section[]): Record<string, LocationKind> {
  const pick: Record<Section['kind'], LocationKind> = {
    intro: 'darkVoid',
    verse: 'alley',
    hook: 'hangingMic',
    bridge: 'whiteVoid',
    outro: 'beach',
  };
  return Object.fromEntries(sections.map((s) => [s.id, pick[s.kind]]));
}

export const LOCATIONS: { id: LocationKind; title: string; detail: string }[] = [
  { id: 'alley', title: 'Alley', detail: 'Wet brick, neon, steam' },
  { id: 'hangingMic', title: 'Hanging mic', detail: 'One light, one mic, black room' },
  { id: 'beach', title: 'Beach', detail: 'Dusk, low sun, waves' },
  { id: 'whiteVoid', title: 'White room', detail: 'Clean white cyclorama' },
  { id: 'darkVoid', title: 'Dark room', detail: 'Black void with a rim light' },
];

export function locationTitle(id: LocationKind): string {
  return LOCATIONS.find((l) => l.id === id)?.title ?? id;
}

export function sampleSwaps(): GenjutsuSwap[] {
  return [
    { id: 'swap-mic', label: 'Gold studio mic', detail: 'Swap the mic in your hand for a gold studio mic', where: 'Every hook shot', selected: true },
    { id: 'swap-chain', label: 'Iced-out chain', detail: 'Swap your chain for a full iced piece', where: 'Verse 2', selected: true },
    { id: 'swap-jacket', label: 'Leather jacket', detail: 'Swap the hoodie for a black leather jacket', where: 'Outro', selected: false },
  ];
}

export function sampleBroll(sections: Section[]): BrollIdea[] {
  const verse = sections.find((s) => s.kind === 'verse');
  const hook = sections.find((s) => s.kind === 'hook');
  return [
    {
      id: 'broll-1',
      lyric: 'Late nights in the studio, the city on mute',
      shot: 'Empty city street at 3 a.m., wet pavement, slow push in',
      sectionId: verse?.id,
      status: 'idea',
      keep: true,
    },
    {
      id: 'broll-2',
      lyric: 'Every bar a brick, now I am building the roof',
      shot: 'Bricks stacking into a skyline, time-lapse',
      sectionId: verse?.id,
      status: 'idea',
      keep: true,
    },
    {
      id: 'broll-3',
      lyric: 'From the block to the stage, we out the mud',
      shot: 'Stage lights snapping on over an empty crowd barrier',
      sectionId: hook?.id,
      status: 'idea',
      keep: true,
    },
  ];
}
