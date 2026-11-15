import type { FxCue, FxEffectId, FxIntensity, FxPackId, FxPlan, LocationKind, Section, Song } from './types';

export interface FxEffect {
  id: FxEffectId;
  title: string;
  /** When it fires, in beat-map terms. */
  trigger: string;
  /** Needs the subject matte that comes back with a switched shot. */
  usesMatte: boolean;
}

export const FX_EFFECTS: FxEffect[] = [
  { id: 'punchIn', title: 'Punch-in zoom', trigger: 'On snares', usesMatte: false },
  { id: 'shake', title: 'Camera shake', trigger: 'On 808 hits', usesMatte: false },
  { id: 'flash', title: 'Flash and strobe', trigger: 'On drops and downbeats', usesMatte: false },
  { id: 'rgbSplit', title: 'RGB split', trigger: 'On snares in the hook', usesMatte: false },
  { id: 'glitch', title: 'Glitch blocks', trigger: 'On section changes', usesMatte: false },
  { id: 'vhs', title: 'VHS and grain', trigger: 'Across intros and outros', usesMatte: false },
  { id: 'stutter', title: 'Stutter hold', trigger: 'Into every hook', usesMatte: false },
  { id: 'kineticLyrics', title: 'Kinetic lyrics', trigger: 'On every word', usesMatte: false },
  { id: 'textBehind', title: 'Text behind you', trigger: 'Hook title and punchlines', usesMatte: true },
  { id: 'glowOutline', title: 'Glow outline', trigger: 'On hits', usesMatte: true },
];

/** Color and texture that stay on for the whole video. All values are 0 to 1 unless noted. */
export interface Grade {
  /** -1 cold to 1 warm. */
  temp: number;
  /** -1 green to 1 magenta. */
  tint: number;
  contrast: number;
  saturation: number;
  /** How far the blacks are crushed. */
  crush: number;
  grain: number;
  vignette: number;
}

export interface FxPack {
  id: FxPackId;
  title: string;
  feel: string;
  effects: FxEffectId[];
  /** Relative density of hits for the pack preview strip, one value per bar. */
  density: number[];
  grade: Grade;
  /** Cinema bars on wide formats. */
  letterbox: boolean;
}

export const FX_PACKS: FxPack[] = [
  {
    id: 'drill',
    title: 'Drill',
    feel: 'Cold grade, shakes on the 808s, glitch cuts',
    effects: ['shake', 'glitch', 'rgbSplit', 'stutter', 'textBehind'],
    density: [2, 1, 3, 1, 2, 4, 1, 3],
    grade: { temp: -0.35, tint: 0.05, contrast: 0.62, saturation: 0.42, crush: 0.3, grain: 0.22, vignette: 0.5 },
    letterbox: true,
  },
  {
    id: 'trapHype',
    title: 'Trap hype',
    feel: 'Punch-ins on every snare, flashes on the drop',
    effects: ['punchIn', 'flash', 'shake', 'rgbSplit', 'kineticLyrics', 'glowOutline'],
    density: [3, 2, 4, 3, 4, 2, 4, 4],
    grade: { temp: 0.1, tint: 0.12, contrast: 0.6, saturation: 0.68, crush: 0.15, grain: 0.1, vignette: 0.35 },
    letterbox: false,
  },
  {
    id: 'melodic',
    title: 'Melodic',
    feel: 'Slow push-ins, soft glow, warm grade',
    effects: ['punchIn', 'stutter', 'kineticLyrics', 'glowOutline'],
    density: [1, 1, 2, 1, 1, 2, 1, 2],
    grade: { temp: 0.3, tint: 0.08, contrast: 0.45, saturation: 0.55, crush: 0.05, grain: 0.14, vignette: 0.4 },
    letterbox: true,
  },
  {
    id: 'boomBap',
    title: 'Boom bap',
    feel: 'Film grain, VHS sections, holds on punchlines',
    effects: ['vhs', 'punchIn', 'stutter', 'textBehind'],
    density: [1, 2, 1, 2, 1, 2, 1, 3],
    grade: { temp: 0.18, tint: -0.06, contrast: 0.5, saturation: 0.38, crush: 0.1, grain: 0.42, vignette: 0.45 },
    letterbox: false,
  },
  {
    id: 'dark',
    title: 'Dark',
    feel: 'Strobes, crushed blacks, glitch in the shadows',
    effects: ['flash', 'glitch', 'vhs', 'shake', 'glowOutline'],
    density: [2, 1, 1, 3, 2, 1, 4, 2],
    grade: { temp: -0.2, tint: -0.05, contrast: 0.72, saturation: 0.25, crush: 0.45, grain: 0.3, vignette: 0.65 },
    letterbox: true,
  },
];

export const NEUTRAL_GRADE: Grade = { temp: 0, tint: 0, contrast: 0.5, saturation: 0.5, crush: 0, grain: 0, vignette: 0 };

/** Stand-in color for each built-in look, used until the real switched shot is back. */
export const LOOK_GRADE: Record<LocationKind, Grade> = {
  alley: { temp: -0.3, tint: 0.3, contrast: 0.62, saturation: 0.6, crush: 0.25, grain: 0.1, vignette: 0.55 },
  hangingMic: { temp: 0.05, tint: 0, contrast: 0.75, saturation: 0.2, crush: 0.4, grain: 0.12, vignette: 0.85 },
  beach: { temp: 0.55, tint: 0.1, contrast: 0.48, saturation: 0.66, crush: 0, grain: 0.06, vignette: 0.25 },
  whiteVoid: { temp: 0, tint: 0, contrast: 0.38, saturation: 0.36, crush: 0, grain: 0.02, vignette: 0 },
  darkVoid: { temp: -0.4, tint: 0, contrast: 0.7, saturation: 0.3, crush: 0.5, grain: 0.14, vignette: 0.75 },
};

export const FX_INTENSITIES: { id: FxIntensity; detail: string }[] = [
  { id: 'Clean', detail: 'Effects on hooks only' },
  { id: 'Hype', detail: 'Effects on every section, heaviest on the hooks' },
  { id: 'Unhinged', detail: 'Everything, everywhere, still on the beat' },
];

export function emptyEffects(): Record<FxEffectId, boolean> {
  return Object.fromEntries(FX_EFFECTS.map((e) => [e.id, false])) as Record<FxEffectId, boolean>;
}

export function planForPack(pack: FxPackId, intensity: FxIntensity): FxPlan {
  const effects = emptyEffects();
  const def = FX_PACKS.find((p) => p.id === pack);
  for (const id of def?.effects ?? []) effects[id] = true;
  return { pack, intensity, effects };
}

export function fxPack(id: FxPackId | undefined): FxPack | undefined {
  return FX_PACKS.find((p) => p.id === id);
}

// ---------- Cues ----------

const LEVEL: Record<FxIntensity, number> = { Clean: 0.55, Hype: 0.8, Unhinged: 1 };

function sectionAt(sections: Section[], t: number): Section | undefined {
  return sections.find((s) => t >= s.start - 1e-6 && t < s.end - 1e-6);
}

/**
 * Lays every enabled effect on the song's beat grid.
 * Snares sit on beat 3 in half-time songs (120 BPM and up) and on 2 and 4 below that.
 */
export function buildCues(song: Song, fx: FxPlan): FxCue[] {
  if (!fx.pack) return [];
  const on = fx.effects;
  const level = LEVEL[fx.intensity];
  const beat = 60 / song.bpm;
  const halfTime = song.bpm >= 120;
  const cues: FxCue[] = [];
  const add = (t: number, dur: number, id: FxEffectId, amount: number) => {
    if (on[id] && t >= 0 && t < song.durationSec) cues.push({ t: round(t), dur: round(dur), fx: id, amount: Math.min(1, round(amount)) });
  };
  const everywhere = fx.intensity !== 'Clean';

  const totalBeats = Math.ceil((song.durationSec - song.downbeatSec) / beat);
  for (let b = 0; b < totalBeats; b++) {
    const t = song.downbeatSec + b * beat;
    const section = sectionAt(song.sections, t);
    if (!section) continue;
    const hook = section.kind === 'hook';
    const quiet = !section.scene && (section.kind === 'intro' || section.kind === 'outro');
    // Scenes carry the video on their own, so they get the effects a hook would, a touch lighter.
    if (!hook && !section.scene && (!everywhere || quiet)) continue;
    const inBar = b % 4;
    const bar = Math.floor(b / 4);
    const snare = halfTime ? inBar === 2 : inBar === 1 || inBar === 3;
    const weight = hook ? 1 : section.scene ? 0.85 : 0.7;

    if (snare) {
      add(t, beat * 0.9, 'punchIn', level * weight);
      if (hook || fx.intensity === 'Unhinged') add(t, 0.22, 'rgbSplit', level * weight);
    }
    if (inBar === 0) {
      add(t, 0.38, 'shake', level * weight);
      if (hook && (bar % 4 === 0 || fx.intensity === 'Unhinged')) add(t, 0.18, 'flash', level * 0.8);
    }
    if (fx.intensity === 'Unhinged') {
      if (inBar === 3) add(t + beat * 0.5, 0.25, 'shake', 0.7 * weight);
      if (inBar === 3 && bar % 2 === 1) add(t, beat, 'glitch', 0.7);
    }
  }

  song.sections.forEach((section, i) => {
    const length = section.end - section.start;
    if (i > 0) {
      // The drop: every new section lands with a hit.
      const big = section.kind === 'hook';
      add(section.start, 0.28, 'flash', big ? 1 : 0.6 * level);
      add(section.start, beat * (big ? 1.5 : 1), 'glitch', big ? level : level * 0.6);
      if (big) {
        add(section.start - beat, beat, 'stutter', 1);
        if (fx.intensity !== 'Clean') {
          for (let k = 0; k < 4; k++) add(section.start - beat + (k * beat) / 4, 0.07, 'flash', 0.5);
        }
      }
    }
    if (section.kind === 'intro' || section.kind === 'outro' || section.kind === 'bridge') {
      add(section.start, length, 'vhs', 0.75);
    } else if (fx.intensity === 'Unhinged') {
      add(section.start, length, 'vhs', 0.35);
    }
  });

  return cues.sort((a, b) => a.t - b.t || a.fx.localeCompare(b.fx));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
