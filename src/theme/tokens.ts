import { Platform, type TextStyle } from 'react-native';

// Showtime AI design tokens, matched to the Figma file "Showtime AI — App Design".
// Look: premium night. Near-black blue-grey surfaces so the video owns the screen, white type,
// and one Showtime pink that only ever marks "what to do now".
// Headlines use Sora; everything you read uses Inter.

export const color = {
  /** Base (Figma bg/base). */
  stage: '#07070A',
  /** Sheets, the composer, the slate (bg/surface). */
  curtain: '#0E0E13',
  /** Rows, bubbles, chips (bg/raised). */
  flat: '#15151C',
  /** Pressed states and strong borders (bg/overlay). */
  rig: '#1D1D26',
  hairline: '#2B2B37',
  hairlineStrong: '#3C3C4B',
  /** Primary text. */
  chalk: '#FFFFFF',
  /** Secondary text. */
  smoke: '#A1A1B5',
  /** Tertiary text, disabled. */
  ash: '#70708A',
  /** The accent: the one action to take, the stage you're on, progress. */
  accent: '#FA1A55',
  accentSoft: 'rgba(250, 26, 85, 0.16)',
  /** Accent as text on dark surfaces. */
  accentText: '#FF4D78',
  /** Text on accent. */
  ink: '#FFFFFF',
  /** Recording only. */
  rec: '#FF4757',
  success: '#2FD58A',
  scrim: 'rgba(0, 0, 0, 0.6)',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

/** Horizontal screen padding, used everywhere. */
export const gutter = 20;

export const radius = { s: 8, m: 14, l: 22, pill: 999 } as const;

/** Content stays readable on wide screens and the web preview. */
export const maxWidth = 560;

function display(weight: 600 | 700 | 800): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  const name = weight === 800 ? 'Sora_800ExtraBold' : weight === 700 ? 'Sora_700Bold' : 'Sora_600SemiBold';
  // Native needs the exact loaded name. The web gets a fallback stack in case the font is slow.
  return Platform.select({
    web: { fontFamily: `${name}, Sora, system-ui, sans-serif`, fontWeight: String(weight) as TextStyle['fontWeight'] },
    default: { fontFamily: name },
  });
}

/** Body text in Inter. On native each weight is its own loaded family. */
function inter(weight: 400 | 500 | 600): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  const name = weight === 600 ? 'Inter_600SemiBold' : weight === 500 ? 'Inter_500Medium' : 'Inter_400Regular';
  return Platform.select({
    web: { fontFamily: `${name}, Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, fontWeight: String(weight) as TextStyle['fontWeight'] },
    default: { fontFamily: name },
  });
}

export const type = {
  /** Rare: the wordmark and the scene number on the slate. */
  display: { ...display(800), fontSize: 40, lineHeight: 44, letterSpacing: -0.6 },
  /** Screen and stage titles. */
  title: { ...display(700), fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  /** Big buttons and card titles. */
  label: { ...display(600), fontSize: 17, lineHeight: 22, letterSpacing: -0.1 },
  heading: { ...display(600), fontSize: 17, lineHeight: 22 },
  body: { ...inter(400), fontSize: 15, lineHeight: 22 },
  callout: { ...inter(500), fontSize: 15, lineHeight: 20 },
  caption: { ...inter(400), fontSize: 13, lineHeight: 18 },
  micro: { ...inter(600), fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
export type ColorName = keyof typeof color;

/** Strong ease-out for things entering or confirming. */
export const easeOut = [0.23, 1, 0.32, 1] as const;
