import type { StageId } from '@/engine/types';

/** Runtime of each stage's walkthrough video, in seconds. */
export const TUTORIAL_LENGTH: Record<StageId, number> = {
  song: 38,
  record: 61,
  roughcut: 44,
  location: 52,
  switch: 49,
  genjutsu: 41,
  broll: 46,
  vfx: 58,
  final: 35,
  resize: 29,
  export: 33,
};
