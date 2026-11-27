import type { Grade } from './fx';
import type { CameraLookId } from './types';

// Camera looks: each one is modeled on the color science of a camera music videos are actually shot on.
// They are looks "inspired by" those cameras, not the manufacturers' own LUTs.
// Footage is always recorded ungraded; the look is applied in the preview and on render, so the
// artist can change cameras after the shoot without reshooting.
//
// One `Grade` drives everything: the live viewfinder (as a CSS filter on the web), the player and
// export (the WebGL compositor), and the .cube LUTs in assets/luts (scripts/make-luts.mjs) that the
// studio server can hand to ffmpeg's lut3d filter.

export interface CameraLook {
  id: CameraLookId;
  /** What the artist sees on the card. */
  name: string;
  /** The camera it's modeled on. */
  inspiredBy: string;
  /** One line on how it feels. */
  feel: string;
  /** Who shoots on it, so the choice means something. */
  usedFor: string;
  grade: Grade;
  /** Split toning, applied on top of the grade in the LUTs: color pushed into shadows and highlights. */
  shadows: [number, number, number];
  highlights: [number, number, number];
  /** Highlight roll-off, 0 hard clip to 1 very soft (film-like). */
  rolloff: number;
  /**
   * How the camera sees, for the backgrounds generated to match it: lens, light and texture. Not its
   * color grade, which goes on the whole video in the edit; graded backgrounds would get it twice.
   */
  prompt: string;
}

export const CAMERA_LOOKS: CameraLook[] = [
  {
    id: 'alexa',
    name: 'Alexa 35',
    inspiredBy: 'ARRI Alexa 35',
    feel: 'Soft highlights, natural skin, rich but quiet color',
    usedFor: 'The default for big-budget videos and films',
    grade: { temp: 0.06, tint: 0.02, contrast: 0.48, saturation: 0.44, crush: 0.02, grain: 0.05, vignette: 0.18 },
    shadows: [0.0, 0.02, 0.05],
    highlights: [0.05, 0.03, -0.02],
    rolloff: 0.85,
    prompt: 'Shot on an ARRI Alexa 35 with cinema primes: soft highlight roll-off, wide dynamic range, shallow depth of field, gentle film-like texture.',
  },
  {
    id: 'venice',
    name: 'Venice 2',
    inspiredBy: 'Sony Venice 2',
    feel: 'Deep blacks, warm glowing skin, polished',
    usedFor: 'High-end rap and R&B videos',
    grade: { temp: 0.24, tint: 0.08, contrast: 0.64, saturation: 0.6, crush: 0.2, grain: 0.04, vignette: 0.28 },
    shadows: [0.0, 0.0, 0.06],
    highlights: [0.08, 0.04, -0.05],
    rolloff: 0.75,
    prompt: 'Shot on a Sony Venice 2 with anamorphic glass: polished glossy light, deep clean shadows, soft background bokeh.',
  },
  {
    id: 'fx3',
    name: 'FX3',
    inspiredBy: 'Sony FX3 (S-Cinetone)',
    feel: 'Warm, punchy, made for faces',
    usedFor: 'The most popular camera for independent music videos',
    grade: { temp: 0.2, tint: 0.05, contrast: 0.6, saturation: 0.64, crush: 0.08, grain: 0.03, vignette: 0.15 },
    shadows: [0.02, 0.0, 0.0],
    highlights: [0.07, 0.05, -0.05],
    rolloff: 0.6,
    prompt: 'Shot on a Sony FX3 with a fast prime: warm practical lights, punchy contrast, shallow depth of field.',
  },
  {
    id: 'red',
    name: 'V-Raptor',
    inspiredBy: 'RED V-Raptor (IPP2)',
    feel: 'Crisp, contrasty, saturated, cool shadows',
    usedFor: 'Glossy, high-energy videos',
    grade: { temp: -0.14, tint: 0.0, contrast: 0.78, saturation: 0.72, crush: 0.22, grain: 0.02, vignette: 0.22 },
    shadows: [-0.05, 0.01, 0.08],
    highlights: [0.05, 0.03, 0.0],
    rolloff: 0.55,
    prompt: 'Shot on a RED V-Raptor: crisp high detail, hard contrasty light, sharp glossy highlights.',
  },
  {
    id: 'canon',
    name: 'C70',
    inspiredBy: 'Canon C70',
    feel: 'Clean, warm, flattering skin tones',
    usedFor: 'Performance videos and live sessions',
    grade: { temp: 0.18, tint: 0.12, contrast: 0.5, saturation: 0.6, crush: 0.04, grain: 0.02, vignette: 0.12 },
    shadows: [0.02, 0.0, 0.03],
    highlights: [0.06, 0.02, 0.0],
    rolloff: 0.65,
    prompt: 'Shot on a Canon C70: clean even light, soft flattering highlights, smooth detail.',
  },
  {
    id: 'pocket',
    name: 'Pocket 6K',
    inspiredBy: 'Blackmagic Pocket 6K',
    feel: 'Filmic and a little raw, cool mids, fine grain',
    usedFor: 'Gritty, indie-film videos',
    grade: { temp: -0.16, tint: -0.05, contrast: 0.5, saturation: 0.36, crush: 0.1, grain: 0.2, vignette: 0.32 },
    shadows: [-0.03, 0.03, 0.07],
    highlights: [0.04, 0.03, -0.01],
    rolloff: 0.7,
    prompt: 'Shot on a Blackmagic Pocket 6K with vintage lenses: filmic, a little raw, fine grain, indie-film light.',
  },
  {
    id: 'film500t',
    name: 'Film 500T',
    inspiredBy: 'Kodak Vision3 500T motion picture film',
    feel: 'Night film: teal shadows, warm lights, visible grain',
    usedFor: 'Night scenes and city lights',
    grade: { temp: -0.22, tint: 0.04, contrast: 0.62, saturation: 0.5, crush: 0.16, grain: 0.34, vignette: 0.42 },
    shadows: [-0.06, 0.04, 0.1],
    highlights: [0.12, 0.06, -0.05],
    rolloff: 0.95,
    prompt: 'Shot on Kodak Vision3 500T film at night: glowing practical lights, halation around highlights, visible grain.',
  },
  {
    id: 'natural',
    name: 'No look',
    inspiredBy: 'Your phone, as shot',
    feel: 'Exactly what the camera saw',
    usedFor: 'When you want to grade it yourself',
    grade: { temp: 0, tint: 0, contrast: 0.5, saturation: 0.5, crush: 0, grain: 0, vignette: 0 },
    shadows: [0, 0, 0],
    highlights: [0, 0, 0],
    rolloff: 0,
    prompt: '',
  },
];

export const DEFAULT_CAMERA_LOOK: CameraLookId = 'fx3';

export function cameraLook(id: CameraLookId | undefined): CameraLook {
  return CAMERA_LOOKS.find((l) => l.id === (id ?? DEFAULT_CAMERA_LOOK)) ?? CAMERA_LOOKS[0];
}

/**
 * The look as a CSS filter, for the live viewfinder on the web. An approximation of the grade:
 * the compositor and the LUTs are exact, this only has to read the same at a glance.
 */
export function cssFilter(id: CameraLookId | undefined): string {
  const g = cameraLook(id).grade;
  const parts = [
    `contrast(${(0.6 + g.contrast * 0.8).toFixed(3)})`,
    `saturate(${(g.saturation * 2).toFixed(3)})`,
    `brightness(${(1 - g.crush * 0.12).toFixed(3)})`,
  ];
  if (g.temp > 0.01) parts.push(`sepia(${(g.temp * 0.45).toFixed(3)})`);
  if (g.temp < -0.01) parts.push(`hue-rotate(${(g.temp * 25).toFixed(1)}deg)`);
  return parts.join(' ');
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** ACES filmic curve (Narkowicz fit): soft toe, long highlight shoulder, the way cinema cameras roll off. */
function aces(x: number): number {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return Math.max(0, (x * (a * x + b)) / (x * (c * x + d) + e));
}

function hueOf(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * The look applied to one color, 0 to 1 per channel, for the .cube LUTs. A small cinema pipeline:
 * linearize the phone's Rec.709, white balance, a filmic tone curve with a soft highlight shoulder,
 * saturation that protects skin and fades into the highlights, then split toning. Same parameters
 * as the compositor's grade, built the way colorists build camera LUTs.
 */
export function gradeColor(id: CameraLookId | undefined, rgb: [number, number, number]): [number, number, number] {
  const look = cameraLook(id);
  const g = look.grade;
  if (look.id === 'natural') return rgb;
  // 1. To linear light.
  let [r, gr, b] = rgb.map((v) => Math.pow(Math.max(0, v), 2.2)) as [number, number, number];
  // 2. White balance: warm pulls red up and blue down; tint trades green for magenta.
  r *= 1 + g.temp * 0.22 + g.tint * 0.04;
  b *= 1 - g.temp * 0.22 + g.tint * 0.04;
  gr *= 1 - g.tint * 0.08;
  // 3. Filmic tone curve. Exposure lifts mids into the curve; contrast steepens it; roll-off softens the shoulder.
  const exposure = 0.78 + (1 - look.rolloff) * 0.12;
  const k = 0.7 + g.contrast * 0.9;
  const curve = (x: number) => {
    const filmic = aces(x * exposure);
    const pivot = 0.18;
    const contrasted = pivot * Math.pow(Math.max(1e-6, filmic) / pivot, k * 0.55 + 0.45);
    return Math.min(1, contrasted);
  };
  r = curve(r);
  gr = curve(gr);
  b = curve(b);
  // 4. Back to display.
  [r, gr, b] = [r, gr, b].map((v) => Math.pow(Math.max(0, v), 1 / 2.2)) as [number, number, number];
  // 5. Black level: crushed blacks sit a touch lower, then lift back so they never clip hard.
  const crush = g.crush * 0.06;
  [r, gr, b] = [r, gr, b].map((v) => Math.max(0, (v - crush) / (1 - crush))) as [number, number, number];
  // 6. Saturation: skin tones move half as much; highlights and deep shadows lose color first.
  const luma = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  const hue = hueOf(r, gr, b);
  const skin = Math.exp(-(((hue - 28) / 20) ** 2));
  const target = g.saturation * 2;
  const amount = 1 + (target - 1) * (1 - 0.5 * skin);
  const highFade = luma > 0.8 ? 1 - (luma - 0.8) / 0.2 * 0.6 : 1;
  const shadowFade = luma < 0.06 ? 0.7 + (luma / 0.06) * 0.3 : 1;
  const sat = amount * highFade * shadowFade;
  r = luma + (r - luma) * sat;
  gr = luma + (gr - luma) * sat;
  b = luma + (b - luma) * sat;
  // 7. Split toning: color into the shadows and the highlights, weighted by brightness.
  const l2 = clamp01(0.2126 * r + 0.7152 * gr + 0.0722 * b);
  const sh = (1 - l2) * (1 - l2);
  const hi = l2 * l2;
  r += look.shadows[0] * sh + look.highlights[0] * hi;
  gr += look.shadows[1] * sh + look.highlights[1] * hi;
  b += look.shadows[2] * sh + look.highlights[2] * hi;
  return [clamp01(r), clamp01(gr), clamp01(b)];
}

/** A 3D LUT in the .cube format, for ffmpeg's lut3d, DaVinci Resolve, Premiere or Final Cut. */
export function cubeLut(id: CameraLookId, size = 33): string {
  const look = cameraLook(id);
  const lines = [`TITLE "Showtime ${look.name} (inspired by ${look.inspiredBy})"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const out = gradeColor(id, [ri / (size - 1), gi / (size - 1), bi / (size - 1)]);
        lines.push(out.map((v) => v.toFixed(6)).join(' '));
      }
    }
  }
  return lines.join('\n') + '\n';
}
