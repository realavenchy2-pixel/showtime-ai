import type { LucideIcon } from '@/components/icons';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { T } from './T';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/**
 * Primary is the one big tungsten button: what to do next. A screen shows at most one.
 * Secondary and quiet carry everything else.
 */
export function Button({ label, onPress, variant = 'primary', icon: Icon, disabled, busy, style, accessibilityHint }: Props) {
  const primary = variant === 'primary';
  const fg = primary ? color.ink : variant === 'secondary' ? color.chalk : color.smoke;
  return (
    <Press
      onPress={() => {
        if (primary) haptic.confirm();
        onPress();
      }}
      disabled={disabled || busy}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      scaleTo={primary ? 0.97 : 0.98}
      style={[
        styles.base,
        primary && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'quiet' && styles.quiet,
        (disabled || busy) && styles.disabled,
        style,
      ]}>
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={primary ? 20 : 18} color={fg} strokeWidth={2.2} /> : null}
        <T v={primary ? 'label' : 'callout'} style={[{ color: fg }, !primary && styles.weight]} numberOfLines={1}>
          {label}
        </T>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  primary: {
    minHeight: 58,
    backgroundColor: color.tungsten,
  },
  secondary: {
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  quiet: {
    minHeight: 44,
    paddingHorizontal: space.m,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  weight: {
    fontWeight: '600',
  },
});
