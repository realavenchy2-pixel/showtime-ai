import { StyleSheet, View } from 'react-native';

import type { TrackerView } from '@/engine/stages';
import { color } from '@/theme/tokens';

interface Props {
  view: TrackerView;
  height?: number;
}

/** One tick per stage: chalk when done, accent where the work is. */
export function ProgressTicks({ view, height = 4 }: Props) {
  return (
    <View style={styles.wrap} accessibilityLabel={`${view.completed} of ${view.total} stages done`}>
      {view.stages.map((s) => {
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
              active && { backgroundColor: color.accentSoft },
            ]}>
            {active ? (
              <View
                style={{
                  width: s.status === 'working' ? `${Math.max(6, Math.round((s.progress ?? 0) * 100))}%` : '100%',
                  height,
                  borderRadius: height / 2,
                  backgroundColor: color.accent,
                }}
              />
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
    gap: 4,
  },
  tick: {
    flex: 1,
    overflow: 'hidden',
  },
});
