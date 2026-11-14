import type { LocationKind, StageId } from '@/engine/types';

/** Runtime of each stage's walkthrough video, in seconds. */
export const TUTORIAL_LENGTH: Record<StageId, number> = {
  song: 38,
  shoot: 64,
  cut: 41,
  looks: 55,
  switch: 49,
  broll: 46,
  edit: 58,
  export: 33,
};

/** The set each tutorial's cover is dressed in. */
export const TUTORIAL_LOOK: Partial<Record<StageId, LocationKind>> = {
  looks: 'alley',
  switch: 'alley',
  broll: 'beach',
  edit: 'hangingMic',
  export: 'darkVoid',
};

export const TUTORIAL_STEPS: Record<StageId, string[]> = {
  song: ['Upload your master track, or try a demo beat.', 'Check the tempo and sections the director found.', 'Pick the vibe and where it posts: YouTube, Reels, or both.'],
  shoot: [
    'Light on your face, phone steady. The song plays while you record.',
    'One full pass is enough. Every extra take is another angle to cut to.',
    'Already shot it? Upload your clips and the director lines them up with the song.',
  ],
  cut: ['The director sorts your takes and cuts on the beat.', 'Shuffle for a different cut, or swap the take on any shot.', 'Nothing is rendered yet, so changing your mind is free.'],
  looks: [
    'The director pitches a world for every section.',
    'Change the look, write what happens in the scene, or add up to four reference images.',
    'Hit Run it. From here the director works on its own.',
  ],
  switch: [
    'Every shot is moved into its world. You stay exactly as you performed.',
    'Shots that need a second look come back flagged.',
    'Drag to compare, redo what looks off, approve the rest.',
  ],
  broll: ['Cutaways are matched to your lyrics.', 'Add your own ideas in the chat.', 'Keep the ones that hit, or skip b-roll completely.'],
  edit: ['Watch the full edit: cuts, b-roll and effects on the beat.', 'Tell the director what to change, or tune the effects yourself.', 'Lock it when it feels right.'],
  export: ['Pick every format you post to.', '1080p comes with every video. 4K costs one more credit.', 'Download and post.'],
};
