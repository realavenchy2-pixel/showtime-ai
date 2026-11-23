import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Frame } from '@/components/Frame';
import { Header, Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { libraryView } from '@/engine/production';
import { useProject } from '@/engine/store';
import type { LibraryKind } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

const KIND: Record<LibraryKind, string> = { location: 'Location', startFrame: 'Start frame', still: 'Screenshot', broll: 'B-roll' };

/** Every image this video generated, so nothing gets lost: locations, remakes, screenshots and start frames. */
export default function LibraryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProject(id);
  const items = project ? libraryView(project) : [];
  return (
    <Screen header={<Header title="Library" kicker={project?.title} fallback={project ? `/project/${project.id}` : '/'} />}>
      <T v="body" c="smoke">
        Everything this video made, newest first. Old versions stay here when you remake one.
      </T>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <T v="body" c="smoke">
            Nothing yet. Lock in the shoot plan and the empty locations for every scene land here.
          </T>
        </View>
      ) : (
        <View style={styles.grid}>
          {items.map((item) => (
            <View key={item.id} style={styles.cell}>
              <View style={styles.image}>
                {item.uri ? <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Frame kind={item.kind === 'still' ? 'room' : item.art && item.art !== 'custom' ? item.art : 'darkVoid'} noArtist={item.kind === 'location'} relit rounded={false} />}
              </View>
              <T v="micro" c="accentText">
                {KIND[item.kind]}
              </T>
              <T v="caption" numberOfLines={2}>
                {item.label}
              </T>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m },
  cell: { width: '47%', gap: 4 },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.m, overflow: 'hidden', backgroundColor: color.flat },
});
