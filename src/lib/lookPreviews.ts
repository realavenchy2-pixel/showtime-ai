import type { CameraLookId } from '@/engine/types';

/** The same raw frame through each camera look's LUT (assets/luts), for the picker cards. */
export const LOOK_PREVIEW: Record<CameraLookId, number> = {
  alexa: require('../../assets/looks/alexa.jpg'),
  venice: require('../../assets/looks/venice.jpg'),
  fx3: require('../../assets/looks/fx3.jpg'),
  red: require('../../assets/looks/red.jpg'),
  canon: require('../../assets/looks/canon.jpg'),
  pocket: require('../../assets/looks/pocket.jpg'),
  film500t: require('../../assets/looks/film500t.jpg'),
  natural: require('../../assets/looks/natural.jpg'),
};
