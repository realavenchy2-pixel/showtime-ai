import { StyleSheet, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { T } from './T';

interface Props<V extends string | number> {
  /** An option with `disabled` can't be picked, and its `detail` should say why. */
  options: { value: V; label: string; detail?: string; disabled?: boolean }[];
  value: V | undefined;
  onChange: (value: V) => void;
  disabled?: boolean;
  /** Name of the group for screen readers. */
  label: string;
}

/** Pick one of a few options. */
export function Chips<V extends string | number>({ options, value, onChange, disabled, label }: Props<V>) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        const off = !!disabled || !!o.disabled;
        return (
          <Press
            key={String(o.value)}
            disabled={off}
            onPress={() => {
              if (on) return;
              haptic.select();
              onChange(o.value);
            }}
            style={[styles.chip, on && styles.on, off && !on && styles.off]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: off }}
            accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}>
            <T v="callout" style={{ color: on ? color.stage : color.chalk }}>
              {o.label}
            </T>
            {o.detail ? (
              <T v="micro" style={{ color: on ? color.rig : color.smoke }}>
                {o.detail}
              </T>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.l,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    justifyContent: 'center',
  },
  on: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  off: {
    opacity: 0.5,
  },
});
