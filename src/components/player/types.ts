import type { StyleProp, ViewStyle } from 'react-native';

import type { Format, Project } from '@/engine/types';

export interface PlayerProps {
  project: Project;
  /** Draw effects and the pack's grade. Defaults to on once the edit exists. */
  effects?: boolean;
  /** Show one take alone, start to finish. */
  soloTakeId?: string;
  format?: Format;
  /** Chip in the corner that says which version this is. */
  label?: string;
  /** Jump the playhead: change `key` to seek to `time`. */
  cue?: { time: number; key: number; play?: boolean; until?: number };
  /** Tallest the picture may get, for vertical formats on a phone. */
  maxHeight?: number;
  style?: StyleProp<ViewStyle>;
}
