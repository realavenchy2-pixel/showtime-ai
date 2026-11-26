import { create } from 'zustand';

// Which viewfinder tools are on. A camera setting, not part of any video, so it lives on the
// device and carries from one shoot to the next.

export interface CamPrefs {
  /** The whole pro layer: frame lines and the aim, the whole recorded frame on screen, readouts, tools. Off is the clean look. */
  pro: boolean;
  /** Rule of thirds. */
  grid: boolean;
  /** A box for each place the video posts that keeps less than the frame. */
  guides: boolean;
  /** Stripes where the picture is close to blowing out. */
  zebra: boolean;
  /** Edges in focus light up. */
  peak: boolean;
  /** Histogram and mic meter. */
  scopes: boolean;
  /** Horizon line from the tilt sensor. */
  level: boolean;
}

export type CamTool = Exclude<keyof CamPrefs, 'pro'>;

const DEFAULTS: CamPrefs = { pro: true, grid: false, guides: true, zebra: false, peak: false, scopes: true, level: false };
const KEY = 'showtime:cam';

function read(): CamPrefs {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CamPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: CamPrefs): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // A private window: the tools still work, they just aren't remembered.
  }
}

interface CamPrefsState extends CamPrefs {
  toggle: (key: keyof CamPrefs) => void;
  set: (key: keyof CamPrefs, on: boolean) => void;
}

export const useCamPrefs = create<CamPrefsState>((setState, get) => ({
  ...read(),
  toggle: (key) => get().set(key, !get()[key]),
  set: (key, on) => {
    setState({ [key]: on } as Partial<CamPrefs>);
    const { toggle: _t, set: _s, ...prefs } = { ...get(), [key]: on };
    write(prefs);
  },
}));
