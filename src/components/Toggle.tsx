import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { color, easeOut } from '@/theme/tokens';

const curve = Easing.bezier(...easeOut);

/** On/off switch. Selection haptic on change. */
export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.set(reduced ? (value ? 1 : 0) : withTiming(value ? 1 : 0, { duration: 180, easing: curve }));
  }, [value, reduced, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * 20 }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        haptic.select();
        onChange(!value);
      }}
      style={[styles.track, value && styles.on, disabled && styles.disabled]}>
      <Animated.View style={[styles.knob, value && styles.knobOn, knob]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.rig,
    padding: 3,
  },
  on: {
    backgroundColor: color.chalk,
  },
  disabled: {
    opacity: 0.45,
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.smoke,
  },
  knobOn: {
    backgroundColor: color.stage,
  },
});
