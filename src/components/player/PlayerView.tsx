import { StyleSheet, View } from 'react-native';

import { aspectOf, previewFormat } from '@/media/composition';
import { coverFor } from '@/lib/preview';
import { color, radius, space } from '@/theme/tokens';

import { Frame } from '../Frame';
import { T } from '../T';
import { Timeline } from './Timeline';
import type { PlayerProps } from './types';

/**
 * Phone build: a still of the video and the song's layout.
 * Live playback with effects runs in the web app today; the phone player lands with the studio server render.
 */
export function PlayerView({ project, format, label, maxHeight, style }: PlayerProps) {
  const cover = coverFor(project);
  const fmt = format ?? previewFormat(project);
  return (
    <View style={[styles.wrap, style]}>
      <View style={[{ aspectRatio: aspectOf(fmt) }, maxHeight ? { maxHeight, alignSelf: 'center' } : null]}>
        <Frame kind={cover.kind} thumb={cover.thumb} relit={cover.relit} format={fmt} label={label} />
      </View>
      <Timeline project={project} time={0} peaks={project.song?.peaks} />
      <View style={styles.note}>
        <T v="caption" c="ash">
          Playback with effects runs in the web app for now.
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.s,
  },
  note: {
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
    borderRadius: radius.s,
    backgroundColor: color.curtain,
    alignSelf: 'flex-start',
  },
});
