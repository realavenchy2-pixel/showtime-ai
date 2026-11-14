import { useLocalSearchParams } from 'expo-router';
import { Play } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { Frame } from '@/components/Frame';
import { Header, Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { formatTime } from '@/engine/director';
import { STAGE_BY_ID } from '@/engine/stages';
import type { StageId } from '@/engine/types';
import { TUTORIAL_LENGTH, TUTORIAL_LOOK, TUTORIAL_STEPS } from '@/lib/tutorials';
import { color, space } from '@/theme/tokens';

export default function TutorialScreen() {
  const { stage } = useLocalSearchParams<{ stage: StageId }>();
  const def = STAGE_BY_ID[stage as StageId];
  if (!def) return null;
  return (
    <Screen header={<Header title={def.title} kicker={`Tutorial ${String(def.n).padStart(2, '0')}`} close fallback="/tutorials" />}>
      <Frame kind={TUTORIAL_LOOK[def.id] ?? 'room'} relit={!!TUTORIAL_LOOK[def.id]} label={formatTime(TUTORIAL_LENGTH[def.id])}>
        <View style={styles.play} accessibilityLabel="Play tutorial">
          <View style={styles.playBtn}>
            <Play size={26} color={color.stage} fill={color.stage} />
          </View>
        </View>
      </Frame>
      <T v="caption" c="ash">
        The walkthrough video for this stage is still to be filmed. Here’s what it covers.
      </T>
      <View style={styles.steps}>
        {TUTORIAL_STEPS[def.id].map((step, i) => (
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
