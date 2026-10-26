import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { color, radius, space } from '@/theme/tokens';

import { T } from './T';

interface ToastState {
  text: string | null;
  key: number;
  show: (text: string) => void;
  clear: () => void;
}

const useToast = create<ToastState>((set) => ({
  text: null,
  key: 0,
  show: (text) => set((s) => ({ text, key: s.key + 1 })),
  clear: () => set({ text: null }),
}));

/** Short confirmations: "Take 2 saved", "3 credits added". */
export function showToast(text: string) {
  useToast.getState().show(text);
}

export function ToastHost() {
  const { text, key, clear } = useToast();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!text) return;
    const t = setTimeout(clear, 2600);
    return () => clearTimeout(t);
  }, [text, key, clear]);

  if (!text) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <Animated.View key={key} entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(150)} style={styles.toast} accessibilityLiveRegion="polite">
        <T v="callout" numberOfLines={2}>
          {text}
        </T>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  toast: {
    maxWidth: 420,
    backgroundColor: color.rig,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
});
