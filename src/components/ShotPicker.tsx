import { StyleSheet, View } from 'react-native';

import { canChangeShot, setSceneShot, type Scene } from '@/engine/production';
import { FRAMING_NAME, FRAMINGS, setupList, shotTitle, type SetupItem } from '@/engine/shots';
import { useApp } from '@/engine/store';
import type { Framing, Project, SetGuide } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { Armchair, Footprints, HandGrab, MicVocal, PersonStanding } from './icons';

import { Chips } from './Chips';
import { T } from './T';

const OPTIONS = FRAMINGS.map((f) => ({ value: f, label: FRAMING_NAME[f] }));

function iconFor(item: SetupItem, pose: SetGuide['pose']) {
  if (item.kind === 'pose') return pose === 'sit' ? Armchair : pose === 'hang' ? HandGrab : PersonStanding;
  if (item.kind === 'mic' || item.kind === 'stand') return MicVocal;
  if (item.kind === 'seat') return Armchair;
  if (item.kind === 'bar') return HandGrab;
  return Footprints;
}

/**
 * A scene's shot: what the director called, why, and Wide, Medium or Close-up to change it. The set
 * guide follows whatever is picked. Locked scenes and a wrapped shoot keep their shot.
 */
export function ShotPicker({ project, scene, guide }: { project: Project; scene: Scene; guide: SetGuide }) {
  const apply = useApp((s) => s.apply);
  const open = canChangeShot(project, scene.index);
  // How you're placed and what you hold: the switch keeps your body exactly as shot, so it has to be real.
  const needs = setupList(guide, project.backgrounds === 'real');
  const where = guide.zoom === 1 ? 'Front camera, 1x' : `${guide.zoom}x zoom`;
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
      {needs.length ? (
        <View style={styles.needs}>
          <T v="micro" c="accentText">
            Before you shoot
          </T>
          {needs.map((item) => {
            const Icon = iconFor(item, guide.pose);
            return (
              <View key={item.kind} style={styles.need}>
                <Icon size={18} color={color.chalk} />
                <View style={styles.flex}>
                  <T v="callout">{item.title}</T>
                  <T v="caption" c="smoke">
                    {item.say}
                  </T>
                </View>
              </View>
            );
          })}
        </View>
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
  needs: { gap: space.s, padding: space.m, borderRadius: radius.m, backgroundColor: color.rig },
  need: { flexDirection: 'row', gap: space.s, alignItems: 'flex-start' },
});
