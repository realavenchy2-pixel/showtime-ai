import type { FxEffectId, FxIntensity, FxPackId, FxPlan } from './types';

export interface FxEffect {
  id: FxEffectId;
  title: string;
  /** When it fires, in beat-map terms. */
  trigger: string;
  /** Needs the subject matte from the switch (AI compositing layer). */
  usesMatte: boolean;
}

export const FX_EFFECTS: FxEffect[] = [
  { id: 'punchIn', title: 'Punch-in zoom', trigger: 'On snares', usesMatte: false },
  { id: 'shake', title: 'Camera shake', trigger: 'On 808 hits', usesMatte: false },
  { id: 'flash', title: 'Flash and strobe', trigger: 'On downbeats and drops', usesMatte: false },
  { id: 'rgbSplit', title: 'RGB split', trigger: 'On hits', usesMatte: false },
  { id: 'glitch', title: 'Glitch blocks', trigger: 'On section changes', usesMatte: false },
  { id: 'vhs', title: 'VHS and grain', trigger: 'Across a whole section', usesMatte: false },
  { id: 'speedRamp', title: 'Speed ramp', trigger: 'On ad-libs and drops', usesMatte: false },
  { id: 'kineticLyrics', title: 'Kinetic lyrics', trigger: 'On every word', usesMatte: false },
  { id: 'textBehind', title: 'Text behind you', trigger: 'Hook title and punchlines', usesMatte: true },
  { id: 'glowOutline', title: 'Glow outline', trigger: 'On hits', usesMatte: true },
];

export interface FxPack {
  id: FxPackId;
  title: string;
  feel: string;
  effects: FxEffectId[];
  /** Relative density of hits for the pack preview strip, one value per bar. */
  density: number[];
}

export const FX_PACKS: FxPack[] = [
  {
    id: 'drill',
    title: 'Drill',
    feel: 'Cold grade, sliding shakes on the 808s, glitch cuts',
    effects: ['shake', 'glitch', 'rgbSplit', 'textBehind'],
    density: [2, 1, 3, 1, 2, 4, 1, 3],
  },
  {
    id: 'trapHype',
    title: 'Trap hype',
    feel: 'Punch-ins on every snare, flashes on the drop',
    effects: ['punchIn', 'flash', 'shake', 'kineticLyrics', 'glowOutline'],
    density: [3, 2, 4, 3, 4, 2, 4, 4],
  },
  {
    id: 'melodic',
    title: 'Melodic',
    feel: 'Slow zooms, light leaks, soft glow',
    effects: ['speedRamp', 'glowOutline', 'kineticLyrics'],
    density: [1, 1, 2, 1, 1, 2, 1, 2],
  },
  {
    id: 'boomBap',
    title: 'Boom bap',
    feel: 'Film grain, VHS sections, freeze frames on punchlines',
    effects: ['vhs', 'punchIn', 'textBehind'],
    density: [1, 2, 1, 2, 1, 2, 1, 3],
  },
  {
    id: 'dark',
    title: 'Dark',
    feel: 'Strobes, depth fog, outlines in the dark',
    effects: ['flash', 'glowOutline', 'glitch', 'vhs'],
    density: [2, 1, 1, 3, 2, 1, 4, 2],
  },
];

export const FX_INTENSITIES: { id: FxIntensity; detail: string }[] = [
  { id: 'Clean', detail: 'Effects on hooks only' },
  { id: 'Hype', detail: 'Effects on every section, heaviest on the drop' },
  { id: 'Unhinged', detail: 'Everything, everywhere, still on the beat' },
];

export function emptyEffects(): Record<FxEffectId, boolean> {
  return Object.fromEntries(FX_EFFECTS.map((e) => [e.id, false])) as Record<FxEffectId, boolean>;
}

export function planForPack(pack: FxPackId, intensity: FxIntensity): FxPlan {
  const effects = emptyEffects();
  const def = FX_PACKS.find((p) => p.id === pack);
  for (const id of def?.effects ?? []) effects[id] = true;
  return { pack, intensity, effects, locked: false };
}

export function fxPack(id: FxPackId | undefined): FxPack | undefined {
  return FX_PACKS.find((p) => p.id === id);
}
