import { Platform, type TextStyle } from 'react-native';

// Showtime AI design tokens.
// Look: a stage at night. True black so the video owns the screen, warm graphite surfaces,
// chalk-white type, and one tungsten-amber accent that only ever marks "what to do now".
// Headlines use Big Shoulders Display, drawn from Chicago street signage; everything you read
// uses the phone's own system font.

export const color = {
  /** Base. True black, a deliberate OLED choice for a video app. */
  stage: '#000000',
  /** Sheets, the composer, the slate. */
  curtain: '#121110',
  /** Rows, bubbles, chips. */
  flat: '#1C1A18',
  /** Pressed states and strong borders. */
  rig: '#2C2926',
  hairline: 'rgba(242, 240, 236, 0.10)',
  hairlineStrong: 'rgba(242, 240, 236, 0.18)',
  /** Primary text. */
  chalk: '#F2F0EC',
  /** Secondary text. */
  smoke: '#A9A49D',
  /** Tertiary text, disabled. */
  ash: '#6F6A64',
  /** The accent: the one action to take, the stage you're on, progress. */
  tungsten: '#EDB45F',
  tungstenSoft: 'rgba(237, 180, 95, 0.14)',
  /** Text on tungsten. */
  ink: '#1A1206',
  /** Recording only. */
  rec: '#FF453A',
  scrim: 'rgba(0, 0, 0, 0.55)',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

/** Horizontal screen padding, used everywhere. */
export const gutter = 20;

export const radius = { s: 8, m: 14, l: 22, pill: 999 } as const;

/** Content stays readable on wide screens and the web preview. */
export const maxWidth = 560;

function display(weight: 700 | 800 | 900): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  const name = weight === 900 ? 'BigShouldersDisplay_900Black' : weight === 800 ? 'BigShouldersDisplay_800ExtraBold' : 'BigShouldersDisplay_700Bold';
  // Native needs the exact loaded name. The web gets a fallback stack in case the font is slow.
  return Platform.select({
    web: { fontFamily: `${name}, "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`, fontWeight: String(weight) as TextStyle['fontWeight'] },
    default: { fontFamily: name },
  });
}

const system = Platform.select({
  web: { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  default: {},
});

export const type = {
  /** Rare: the wordmark and the scene number on the slate. */
  display: { ...display(900), fontSize: 44, lineHeight: 44, letterSpacing: 0.2 },
  /** Screen and stage titles. */
  title: { ...display(800), fontSize: 30, lineHeight: 32, letterSpacing: 0.2 },
  /** Big buttons and card titles. */
  label: { ...display(800), fontSize: 22, lineHeight: 24, letterSpacing: 0.3 },
  heading: { ...system, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { ...system, fontSize: 16, lineHeight: 23, fontWeight: '400' },
  callout: { ...system, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  caption: { ...system, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  micro: { ...system, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.2 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
export type ColorName = keyof typeof color;

/** Strong ease-out for things entering or confirming. */
export const easeOut = [0.23, 1, 0.32, 1] as const;
