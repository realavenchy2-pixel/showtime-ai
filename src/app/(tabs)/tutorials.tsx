import { router } from 'expo-router';
import { PlayCircle } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { Press } from '@/components/Press';
import { Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { formatTime } from '@/engine/director';
import { ACTS, STAGES } from '@/engine/stages';
import { TUTORIAL_LENGTH } from '@/lib/tutorials';
import { color, space } from '@/theme/tokens';

export default function TutorialsScreen() {
  return (
    <Screen>
      <View style={styles.head}>
        <T v="title" accessibilityRole="header">
          Tutorials
        </T>
        <T v="body" c="smoke">
          One short video for every stage, in the order you’ll use them. The director opens the right one when you tap Watch how.
        </T>
      </View>
      {ACTS.map((act) => (
        <View key={act.id} style={styles.act}>
          <T v="micro" c="ash">
            {act.title}
          </T>
          {STAGES.filter((s) => s.act === act.id).map((s) => (
            <Press
              key={s.id}
              onPress={() => router.push(`/tutorial/${s.id}`)}
              scaleTo={0.99}
              style={styles.row}
              accessibilityLabel={`Tutorial ${s.n}, ${s.title}`}>
              <T v="label" c="smoke" style={styles.num}>
                {String(s.n).padStart(2, '0')}
              </T>
              <View style={styles.text}>
                <T v="callout">{s.title}</T>
                <T v="caption" c="smoke" numberOfLines={2}>
                  {s.summary}
                </T>
              </View>
              <View style={styles.time}>
                <PlayCircle size={22} color={color.chalk} strokeWidth={1.8} />
                <T v="micro" c="ash">
                  {formatTime(TUTORIAL_LENGTH[s.id])}
                </T>
              </View>
            </Press>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingTop: space.l,
    gap: space.s,
  },
  act: {
    gap: space.xs,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingVertical: space.s,
  },
  num: {
    width: 30,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  time: {
    alignItems: 'center',
    gap: 2,
  },
});
