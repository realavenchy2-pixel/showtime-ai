import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ImagePlus, RefreshCcw } from '@/components/icons';
import { locationRef, REF_QUALITY_NOTE, remakeLocation, sceneName, setOwnLocation, type Scene } from '@/engine/production';
import { useApp } from '@/engine/store';
import { makeLocations } from '@/live/session';
import type { Project } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/media/pick';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Frame } from '../Frame';
import { SetGuide3D } from '../SetGuide3D';
import { T } from '../T';
import { showToast } from '../Toast';

/**
 * One scene's empty location: made before the shoot, with nobody in it, because it is exactly where
 * the artist gets switched into. The artist can remake it or use their own image until the switch starts.
 */
export function LocationCard({ project, scene, showGuide = true }: { project: Project; scene: Scene; showGuide?: boolean }) {
  const apply = useApp((s) => s.apply);
  const ref = locationRef(scene.look);
  const editable = project.shots.length === 0 && !project.job;
  const kind = scene.look && scene.look.location !== 'custom' ? scene.look.location : 'darkVoid';
  const guide = project.guides?.[scene.index];
  return (
    <View style={styles.card}>
      <T v="label">{sceneName(scene)}</T>
      <View style={styles.image}>
        {ref?.uri ? <Image source={{ uri: ref.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Frame kind={kind} noArtist relit rounded={false} />}
        <View style={styles.badge}>
          <T v="micro" c="chalk">
            {ref?.source === 'upload' ? 'Your image' : 'Empty location · you get switched in here'}
          </T>
        </View>
      </View>
      {ref?.prompt ? (
        <T v="caption" c="ash" numberOfLines={3}>
          {ref.prompt}
        </T>
      ) : null}
      <View style={styles.note}>
        <T v="caption" c="chalk">
          {REF_QUALITY_NOTE}
        </T>
      </View>
      {editable ? (
        <View style={styles.actions}>
          <Button
            label="Make another"
            icon={RefreshCcw}
            variant="secondary"
            style={styles.flex}
            onPress={() => {
              haptic.select();
              apply(project.id, (p) => remakeLocation(p, scene.index));
              makeLocations(project.id);
            }}
          />
          <Button
            label="Use my own"
            icon={ImagePlus}
            variant="secondary"
            style={styles.flex}
            onPress={async () => {
              try {
                const img = await pickImage();
                if (img) apply(project.id, (p) => setOwnLocation(p, scene.index, { label: img.name, uri: img.uri, mediaId: img.mediaId }));
              } catch {
                showToast('That image could not be added.');
              }
            }}
          />
        </View>
      ) : null}
      {showGuide && guide ? (
        <View style={styles.guide}>
          <T v="heading">Set guide</T>
          <SetGuide3D guide={guide} height={200} />
          {guide.steps.map((step, i) => (
            <T key={i} v="caption" c="smoke">{`${i + 1}. ${step}`}</T>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.m,
    padding: space.l,
    borderRadius: radius.l,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.m, overflow: 'hidden', backgroundColor: color.flat },
  badge: {
    position: 'absolute',
    left: space.s,
    top: space.s,
    paddingHorizontal: space.s,
    paddingVertical: 4,
    borderRadius: radius.s,
    backgroundColor: color.scrim,
  },
  note: {
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(250, 26, 85, 0.35)',
  },
  actions: { flexDirection: 'row', gap: space.s },
  flex: { flex: 1 },
  guide: { gap: space.s },
});
