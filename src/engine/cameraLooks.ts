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

/**
 * The look applied to one color, 0 to 1 per channel. Mirrors the compositor's grade, plus split toning
 * and highlight roll-off. Used to write the .cube LUTs.
 */
export function gradeColor(id: CameraLookId | undefined, rgb: [number, number, number]): [number, number, number] {
  const look = cameraLook(id);
  const g = look.grade;
  let [r, gr, b] = rgb;
  r += g.temp * 0.07;
  b -= g.temp * 0.07;
  gr -= g.tint * 0.03;
  r += g.tint * 0.02;
  b += g.tint * 0.02;
  const luma0 = 0.299 * r + 0.587 * gr + 0.114 * b;
  const sat = g.saturation * 2;
  r = luma0 + (r - luma0) * sat;
  gr = luma0 + (gr - luma0) * sat;
  b = luma0 + (b - luma0) * sat;
  const k = 0.6 + g.contrast * 0.8;
  const crush = g.crush * 0.09;
  const tone = (x: number) => {
    let y = (x - 0.5) * k + 0.5;
    y = (y - crush) / (1 - crush);
    // Soft shoulder: highlights roll off instead of clipping.
    if (look.rolloff > 0 && y > 0.7) {
      const over = y - 0.7;
      y = 0.7 + over / (1 + over * look.rolloff * 3);
    }
    return y;
  };
  r = tone(r);
  gr = tone(gr);
  b = tone(b);
  const luma = clamp01(0.299 * r + 0.587 * gr + 0.114 * b);
  const sh = (1 - luma) * (1 - luma);
  const hi = luma * luma;
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
