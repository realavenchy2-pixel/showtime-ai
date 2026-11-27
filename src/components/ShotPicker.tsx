import { StyleSheet, View } from 'react-native';

import { canChangeShot, setSceneShot, type Scene } from '@/engine/production';
import { FRAMING_NAME, FRAMINGS, shotTitle } from '@/engine/shots';
import { useApp } from '@/engine/store';
import type { Framing, Project, SetGuide } from '@/engine/types';
import { space } from '@/theme/tokens';

import { Chips } from './Chips';
import { T } from './T';

const OPTIONS = FRAMINGS.map((f) => ({ value: f, label: FRAMING_NAME[f] }));

/**
 * A scene's shot: what the director called, why, and Wide, Medium or Close-up to change it. The set
 * guide follows whatever is picked. Locked scenes and a wrapped shoot keep their shot.
 */
export function ShotPicker({ project, scene, guide }: { project: Project; scene: Scene; guide: SetGuide }) {
  const apply = useApp((s) => s.apply);
  const open = canChangeShot(project, scene.index);
  const where = guide.zoom === 1 ? '1x lens' : `${guide.zoom}x zoom`;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <T v="label" style={styles.flex}>
          {shotTitle(guide)}
        </T>
        <T v="caption" c="smoke">{`${where} · ${guide.camera.z.toFixed(1)} m away`}</T>
      </View>
      {guide.why ? (
        <T v="caption" c="smoke">
          {guide.why}
        </T>
      ) : null}
      {open ? (
        <Chips<Framing>
          label={`Shot for scene ${scene.index + 1}`}
          value={guide.framing}
          options={OPTIONS}
          onChange={(framing) => apply(project.id, (p) => setSceneShot(p, scene.index, framing, { by: 'artist' }))}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.s },
  top: { flexDirection: 'row', alignItems: 'baseline', gap: space.s },
});
