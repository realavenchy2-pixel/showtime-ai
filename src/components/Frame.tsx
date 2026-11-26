import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Format } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { SceneArt, type SceneKind } from './art/SceneArt';
import { T } from './T';

interface Props {
  kind: SceneKind;
  /** A real frame of the artist's footage. Shown instead of the drawn set. */
  thumb?: string;
  format?: Format;
  label?: string;
  relit?: boolean;
  behindText?: string;
  noArtist?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  rounded?: boolean;
}

const RATIO: Record<Format, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5 };

/** A video frame: a still of real footage, or the drawn set for sample projects. */
export function Frame({ kind, thumb, format = '16:9', label, relit, behindText, noArtist, style, children, rounded = true }: Props) {
  return (
    <View
      style={[styles.frame, { aspectRatio: RATIO[format] }, rounded && styles.rounded, style]}
      accessibilityRole="image"
      accessibilityLabel={label ? `${label} preview` : 'Video preview'}>
      {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <SceneArt kind={kind} relit={relit} behindText={behindText} noArtist={noArtist} />}
      {label ? (
        <View style={styles.label}>
          <T v="micro" c="chalk" numberOfLines={1}>
            {label}
          </T>
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: color.flat,
  },
  rounded: {
    borderRadius: radius.m,
  },
  label: {
    position: 'absolute',
    left: space.s,
    bottom: space.s,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.s,
    backgroundColor: color.scrim,
  },
});
