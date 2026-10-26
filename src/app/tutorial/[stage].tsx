import { useLocalSearchParams } from 'expo-router';
import { Play } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { Frame } from '@/components/Frame';
import { Header, Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { formatTime } from '@/engine/director';
import { STAGE_BY_ID } from '@/engine/stages';
import type { LocationKind, StageId } from '@/engine/types';
import { TUTORIAL_LENGTH } from '@/lib/tutorials';
import { color, space } from '@/theme/tokens';

const LOOK: Partial<Record<StageId, LocationKind>> = {
  location: 'alley',
  switch: 'alley',
  genjutsu: 'hangingMic',
  broll: 'beach',
  vfx: 'darkVoid',
  final: 'hangingMic',
};

const STEPS: Record<StageId, string[]> = {
  song: ['Upload your master track.', 'Pick the vibe that matches the song.', 'Choose YouTube, Reels, or both.'],
  record: ['Phone sideways, light on your face.', 'Rap along while the song plays. The director counts you in.', 'Do every take in the plan: wide, close-up, hook, second outfit.'],
  roughcut: ['Watch the cut the director built on the beat.', 'Tap any shot to swap in a different take.', 'Lock the cut when it feels right.'],
  location: ['Pick a look for each section of the song.', 'The director makes a plate from a real frame of your take.', 'Approve the plates before the switch.'],
  switch: ['Every shot in the cut gets moved into its location.', 'Drag the slider to compare your take with the switch.', 'Redo any shot that looks off, then approve.'],
  genjutsu: ['Pick what to swap: mic, chain, fit.', 'Run the swaps and check every shot.', 'Skip it if you are happy with the look.'],
  broll: ['Keep the cutaways that match your lyrics.', 'Your own ideas from chat show up here too.', 'Generate, review, approve.'],
  vfx: ['Pick an effects pack.', 'Set how hard it hits: Clean, Hype or Unhinged.', 'Turn single effects on or off, then lock.'],
  final: ['Watch the full edit with audio locked to your master.', 'Leave notes for the director if anything is off.', 'Lock the edit.'],
  resize: ['Pick every format you post to.', 'Each one is laid out for its frame, no cropping.', 'Render them all at once.'],
  export: ['1080p comes with every video.', '4K costs one more credit.', 'Download and post.'],
};

export default function TutorialScreen() {
  const { stage } = useLocalSearchParams<{ stage: StageId }>();
  const def = STAGE_BY_ID[stage as StageId];
  if (!def) return null;
  return (
    <Screen header={<Header title={def.title} kicker={`Tutorial ${String(def.n).padStart(2, '0')}`} close fallback="/tutorials" />}>
      <Frame kind={LOOK[def.id] ?? 'room'} relit={!!LOOK[def.id]} label={formatTime(TUTORIAL_LENGTH[def.id])}>
        <View style={styles.play} accessibilityLabel="Play tutorial">
          <View style={styles.playBtn}>
            <Play size={26} color={color.stage} fill={color.stage} />
          </View>
        </View>
      </Frame>
      <T v="caption" c="ash">
        The walkthrough video for this stage gets filmed in the app once it’s built. Here’s what it covers.
      </T>
      <View style={styles.steps}>
        {STEPS[def.id].map((step, i) => (
          <View key={step} style={styles.step}>
            <T v="label" c="smoke" style={styles.num}>
              {i + 1}
            </T>
            <T v="body" style={styles.flex}>
              {step}
            </T>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  play: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  steps: {
    gap: space.l,
  },
  step: {
    flexDirection: 'row',
    gap: space.m,
  },
  num: {
    width: 22,
  },
  flex: {
    flex: 1,
  },
});
