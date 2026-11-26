import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Check } from '@/components/icons';
import { CAMERA_LOOKS, cameraLook } from '@/engine/cameraLooks';
import type { CameraLookId } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { playShutter } from '@/lib/shutter';
import { LOOK_PREVIEW } from '@/lib/lookPreviews';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { T } from './T';

/**
 * Pick a camera: each card is the same raw frame through that camera's look, so the difference is
 * the look, not the picture. Footage is saved ungraded, so this can change after the shoot.
 */
export function CameraLookPicker({ value, onChange, compact }: { value?: CameraLookId; onChange: (id: CameraLookId) => void; compact?: boolean }) {
  const current = cameraLook(value);
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CAMERA_LOOKS.map((look) => {
          const on = look.id === current.id;
          return (
            <Press
              key={look.id}
              onPress={() => {
                haptic.select();
                playShutter();
                onChange(look.id);
              }}
              scaleTo={0.97}
              style={[styles.card, compact && styles.cardCompact]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${look.name}, inspired by ${look.inspiredBy}. ${look.feel}`}>
              <View style={[styles.preview, compact && styles.previewCompact, on && styles.previewOn]}>
                <Image source={LOOK_PREVIEW[look.id]} style={StyleSheet.absoluteFill} contentFit="cover" />
                {on ? (
                  <View style={styles.check}>
                    <Check size={14} color={color.ink} strokeWidth={3} />
                  </View>
                ) : null}
              </View>
              <T v="label" numberOfLines={1} style={compact ? styles.nameCompact : undefined}>
                {look.name}
              </T>
              {!compact ? (
                <T v="caption" c="smoke" numberOfLines={2}>
                  {look.inspiredBy === 'Your phone, as shot' ? look.inspiredBy : `Inspired by ${look.inspiredBy}`}
                </T>
              ) : null}
            </Press>
          );
        })}
      </ScrollView>
      {!compact ? (
        <View style={styles.info}>
          <T v="callout">{current.feel}</T>
          <T v="caption" c="smoke">
            {current.usedFor}. Your footage is saved untouched, so you can switch cameras after the shoot.
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.m },
  row: { gap: space.m, paddingRight: space.l },
  card: { width: 112, gap: 6 },
  cardCompact: { width: 76 },
  preview: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: radius.m,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: color.flat,
  },
  previewCompact: { borderRadius: radius.s },
  previewOn: { borderColor: color.accent },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameCompact: { fontSize: 13, lineHeight: 16 },
  info: { gap: 2 },
});
