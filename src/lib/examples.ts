// Real Showtime results, shown before anyone pays. Every "after" is SwitchX output from the
// artist's own raw take, frame for frame. Nothing here is a mock-up or a reference photo.

export interface SwitchExample {
  id: string;
  title: string;
  /** What the raw take was, and where it went. */
  line: string;
  /** Raw frame and the switched frame at the same moment. */
  before: number;
  after: number;
  /** The reference image the location was built from. */
  ref: number;
  /** The raw take wiping into the switched one, 9:16. */
  wipe: number;
  /** The finished look on its own, 9:16. */
  snippet: number;
}

export const SWITCH_EXAMPLES: SwitchExample[] = [
  {
    id: 'rooftop',
    title: 'Rooftop helipad',
    line: 'A bedroom with two flags on the wall, switched to a helipad over the city at night.',
    before: require('../../assets/examples/rooftop_before.jpg'),
    after: require('../../assets/examples/rooftop_after.jpg'),
    ref: require('../../assets/examples/rooftop_ref.jpg'),
    wipe: require('../../assets/examples/wipe_rooftop_916.mp4'),
    snippet: require('../../assets/examples/snip_rooftop.mp4'),
  },
  {
    id: 'garage',
    title: 'Steel garage',
    line: 'The same bedroom, switched to a corrugated steel garage in black and white.',
    before: require('../../assets/examples/garage_before.jpg'),
    after: require('../../assets/examples/garage_after.jpg'),
    ref: require('../../assets/examples/garage_ref.jpg'),
    wipe: require('../../assets/examples/wipe_garage_916.mp4'),
    snippet: require('../../assets/examples/snip_garage.mp4'),
  },
];

/** Short loops from finished Showtime videos. */
export const FINISHED_SNIPPETS: { id: string; title: string; source: number }[] = [
  { id: 'rooftop', title: 'Rooftop', source: require('../../assets/examples/snip_rooftop.mp4') },
  { id: 'garage', title: 'Garage', source: require('../../assets/examples/snip_garage.mp4') },
  { id: 'carlot', title: 'Car lot', source: require('../../assets/examples/snip_carlot.mp4') },
];

/** The before-and-after for the welcome screen and the credits screen. */
export const HERO_WIPE: number = require('../../assets/examples/wipe_rooftop_916.mp4');
export const HERO_WIPE_WIDE: number = require('../../assets/examples/wipe_rooftop_169.mp4');
