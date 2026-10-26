import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Format } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { SceneArt, type SceneKind } from './art/SceneArt';
import { T } from './T';

interface Props {
  kind: SceneKind;
  format?: Format;
  label?: string;
  relit?: boolean;
  behindText?: string;
  noArtist?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  rounded?: boolean;
}

const RATIO: Record<Format, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

/** A video frame. Stands in for footage in the prototype. */
export function Frame({ kind, format = '16:9', label, relit, behindText, noArtist, style, children, rounded = true }: Props) {
  return (
    <View
      style={[styles.frame, { aspectRatio: RATIO[format] }, rounded && styles.rounded, style]}
      accessibilityRole="image"
      accessibilityLabel={label ? `${label} preview` : 'Video preview'}>
      <SceneArt kind={kind} relit={relit} behindText={behindText} noArtist={noArtist} />
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
