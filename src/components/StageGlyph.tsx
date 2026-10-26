import { Check, Lock, Minus } from '@/components/icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { StageStatus } from '@/engine/types';
import { color } from '@/theme/tokens';

/** A rotating arc for work in progress. Constant motion, so linear. */
export function Spinner({ size = 18 }: { size?: number }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    turn.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(turn);
  }, [reduced, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View
      accessibilityLabel="Working"
      style={[
        { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color.tungstenSoft, borderTopColor: color.tungsten },
        style,
      ]}
    />
  );
}

/** One symbol per stage state, so state reads without color too. */
export function StageGlyph({ status, size = 20 }: { status: StageStatus; size?: number }) {
  switch (status) {
    case 'done':
      return (
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color.chalk }]} accessibilityLabel="Done">
          <Check size={size * 0.62} color={color.stage} strokeWidth={3} />
        </View>
      );
    case 'working':
      return <Spinner size={size} />;
    case 'needs_you':
      return (
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color.tungsten }]} accessibilityLabel="Needs you">
          <View style={{ width: size * 0.36, height: size * 0.36, borderRadius: size, backgroundColor: color.tungsten }} />
        </View>
      );
    case 'current':
      return <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color.tungsten }]} accessibilityLabel="Up next" />;
    case 'skipped':
      return (
        <View style={[styles.circle, { width: size, height: size }]} accessibilityLabel="Skipped">
          <Minus size={size * 0.8} color={color.ash} strokeWidth={2.4} />
        </View>
      );
    case 'locked':
      return (
        <View style={[styles.circle, { width: size, height: size }]} accessibilityLabel="Locked">
          <Lock size={size * 0.62} color={color.ash} strokeWidth={2} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
