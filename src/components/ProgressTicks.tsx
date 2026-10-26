import { StyleSheet, View } from 'react-native';

import { ACTS, type TrackerView } from '@/engine/stages';
import { color } from '@/theme/tokens';

import { T } from './T';

interface Props {
  view: TrackerView;
  /** Show act names under each group of ticks. */
  labels?: boolean;
  height?: number;
}

/** Eleven ticks in four acts: Shoot, Set, Style, Ship. */
export function ProgressTicks({ view, labels = false, height = 4 }: Props) {
  const currentAct = view.current?.act;
  return (
    <View style={styles.wrap} accessibilityLabel={`${view.completed} of ${view.total} stages done`}>
      {ACTS.map((act) => {
        const stages = view.stages.filter((s) => s.def.act === act.id);
        return (
          <View key={act.id} style={[styles.group, { flex: stages.length }]}>
            <View style={styles.ticks}>
              {stages.map((s) => {
                const active = s.status === 'current' || s.status === 'needs_you' || s.status === 'working';
                return (
                  <View
                    key={s.def.id}
                    style={[
                      styles.tick,
                      { height, borderRadius: height / 2 },
                      s.status === 'done' && { backgroundColor: color.chalk },
                      s.status === 'skipped' && { backgroundColor: color.ash },
                      s.status === 'locked' && { backgroundColor: color.rig },
                      active && { backgroundColor: color.tungstenSoft },
                    ]}>
                    {active ? (
                      <View
                        style={{
                          width: s.status === 'working' ? `${Math.round((s.progress ?? 0) * 100)}%` : '100%',
                          height,
                          borderRadius: height / 2,
                          backgroundColor: color.tungsten,
                        }}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
            {labels ? (
              <T v="micro" c={act.id === currentAct ? 'chalk' : 'ash'} numberOfLines={1}>
                {act.title}
              </T>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8,
  },
  group: {
    gap: 6,
  },
  ticks: {
    flexDirection: 'row',
    gap: 3,
  },
  tick: {
    flex: 1,
    overflow: 'hidden',
  },
});
