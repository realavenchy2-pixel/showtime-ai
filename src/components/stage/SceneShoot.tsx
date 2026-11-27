import { router } from 'expo-router';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Check, Lock, Sparkles, X } from '@/components/icons';
import { removeTake } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { autoStills, canChangeShot, coverageTakes, isSceneLocked, lockScene, locationRef, nextScene, sceneName, scenesOf, setSceneShot, takesFor, unlockScene, type Scene } from '@/engine/production';
import { coverFor, FRAMING_NAME, shotTitle } from '@/engine/shots';
import { useApp } from '@/engine/store';
import type { Project } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Frame } from '../Frame';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { SetGuide3D } from '../SetGuide3D';
import { ShotPicker } from '../ShotPicker';
import { T } from '../T';

/**
 * The shoot, one scene at a time. Each scene opens with its set guide (where to stand, where the
 * phone goes), then the artist records it as many times as they want and locks it. The AI editor
 * picks the best take of every scene.
 */
export function SceneShoot({ project }: { project: Project }) {
  const scenes = scenesOf(project);
  const next = nextScene(project);
  const stills = autoStills(project);
  return (
    <>
      <View style={styles.explain}>
        <T v="heading">How the shoot works</T>
        <T v="caption" c="smoke">
          1. Before each scene, the set guide shows the shot, where to stand and where to put your phone.{'\n'}2. Record that scene as many times as you want. Shoot it again closer or wider and the editor cuts between the two on the beat.{'\n'}3. Lock it when you&apos;re happy. The AI editor picks your best take.{'\n'}4. I screenshot your best take and match it to the location we planned. No extra steps.
        </T>
      </View>
      {scenes.map((scene) => (
        <SceneBlock key={scene.section.id} project={project} scene={scene} open={next?.index === scene.index} />
      ))}
      {stills.length ? (
        <View style={styles.block}>
          <SectionTitle detail="Pulled from each scene's best take and matched to its planned location automatically. These are the start frames for the switch.">Screenshots, matched</SectionTitle>
          {stills.map((s) => {
            const scene = scenes[s.scene];
            const kind = scene?.look && scene.look.location !== 'custom' ? scene.look.location : 'darkVoid';
            return (
              <View key={`${s.takeId}-${s.scene}`} style={styles.matchRow}>
                <View style={styles.matchThumb}>
                  <Frame kind="room" thumb={s.thumb} relit={false} rounded={false} />
                </View>
                <T v="caption" c="smoke">
                  →
                </T>
                <View style={styles.matchThumb}>
                  {s.location?.uri ? <Image source={{ uri: s.location.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Frame kind={kind} noArtist relit rounded={false} />}
                </View>
                <View style={styles.flex}>
                  <T v="callout" numberOfLines={1}>
                    {scene ? sceneName(scene) : `Scene ${s.scene + 1}`}
                  </T>
                  <T v="caption" c="smoke">{`Frame at ${formatTime(s.t)}`}</T>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

function SceneBlock({ project, scene, open }: { project: Project; scene: Scene; open: boolean }) {
  const apply = useApp((s) => s.apply);
  const takes = takesFor(project, scene.index);
  const locked = isSceneLocked(project, scene.index);
  // The AI editor's best take, and the best of any other framing: the cut moves between them.
  const carry = coverageTakes(project, scene.index);
  const guide = project.guides?.[scene.index];
  const shotAt = [...new Set(takes.map((t) => t.framing ?? guide?.framing))].filter((f) => f !== undefined);
  const cover = guide ? coverFor(guide) : undefined;
  const offerCover = !!guide && !!cover && takes.length > 0 && shotAt.length === 1 && !shotAt.includes(cover) && canChangeShot(project, scene.index);
  // Scene 1 places the video in the song, so it goes first.
  const waiting = project.takes.length === 0 && scene.index > 0 && !project.partPicked;
  // The background is locked first, so you know exactly where you're going.
  const needsBackground = !!scene.look?.options?.length && !scene.look.locationLocked;
  const ref = locationRef(scene.look);
  const kind = scene.look && scene.look.location !== 'custom' ? scene.look.location : 'darkVoid';
  const record = () => router.push(`/project/${project.id}/record?scene=${scene.index}`);

  return (
    <View style={[styles.scene, open && styles.sceneOpen]}>
      <View style={styles.sceneTop}>
        <View style={styles.locThumb}>
          {ref?.uri ? <Image source={{ uri: ref.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Frame kind={kind} noArtist relit rounded={false} />}
        </View>
        <View style={styles.flex}>
          <T v="label" numberOfLines={1}>
            {sceneName(scene)}
          </T>
          <T v="caption" c="smoke">{`${formatTime(scene.section.end - scene.section.start)} · ${takes.length} ${takes.length === 1 ? 'take' : 'takes'}${guide ? ` · ${shotTitle(guide)}` : ''}`}</T>
        </View>
        {locked ? (
          <View style={styles.lockedPill}>
            <Lock size={12} color={color.ink} />
            <T v="micro" c="ink">
              Locked
            </T>
          </View>
        ) : null}
      </View>

      {open && guide ? (
        <>
          <ShotPicker project={project} scene={scene} guide={guide} />
          <SetGuide3D guide={guide} height={240} />
          {guide.steps.map((step, i) => (
            <T key={i} v="caption" c="smoke">{`${i + 1}. ${step}`}</T>
          ))}
        </>
      ) : null}

      {takes.map((t) => (
        <View key={t.id} style={styles.take}>
          <View style={styles.takeThumb}>
            <Frame kind="room" thumb={t.thumb} relit={false} rounded={false} />
          </View>
          <View style={styles.flex}>
            <T v="callout">{`Take ${takes.indexOf(t) + 1}`}</T>
            <T v="caption" c="smoke">{`${formatTime(t.end - t.start)}${t.framing ? ` · ${FRAMING_NAME[t.framing]}` : ''}${t.flag ? ` · ${t.flag}` : ''}`}</T>
          </View>
          {carry.some((c) => c.id === t.id) ? (
            <View style={styles.bestPill}>
              <Sparkles size={12} color={color.accentText} />
              <T v="micro" c="accentText">
                AI pick
              </T>
            </View>
          ) : null}
          {!locked && !project.shootLocked ? (
            <Press onPress={() => apply(project.id, (p) => removeTake(p, t.id))} hitSlop={8} accessibilityLabel={`Delete take ${takes.indexOf(t) + 1}`}>
              <X size={18} color={color.ash} />
            </Press>
          ) : null}
        </View>
      ))}

      {offerCover && cover ? (
        <View style={styles.cover}>
          <T v="caption" c="smoke">{`Shoot it again as a ${FRAMING_NAME[cover].toLowerCase()} and I'll cut between the two on the beat.`}</T>
          <Button
            label={`Set up a ${FRAMING_NAME[cover].toLowerCase()} take`}
            variant="quiet"
            onPress={() => {
              haptic.select();
              apply(project.id, (p) => setSceneShot(p, scene.index, cover, { by: 'artist' }));
            }}
          />
        </View>
      ) : shotAt.length > 1 ? (
        <T v="caption" c="smoke">{`I'll cut between your ${shotAt.map((f) => FRAMING_NAME[f!].toLowerCase()).join(' and ')} on the beat.`}</T>
      ) : null}

      {project.shootLocked ? null : locked ? (
        <Button label="Unlock to shoot more" variant="quiet" onPress={() => apply(project.id, (p) => unlockScene(p, scene.index))} />
      ) : (
        <View style={styles.actions}>
          <Button label={takes.length ? `Another take` : `Record scene ${scene.index + 1}`} variant={open ? 'primary' : 'secondary'} disabled={waiting || needsBackground} style={styles.flex} onPress={record} />
          {takes.length ? (
            <Button
              label="Lock scene"
              icon={Check}
              variant="secondary"
              style={styles.flex}
              onPress={() => {
                haptic.confirm();
                apply(project.id, (p) => lockScene(p, scene.index));
              }}
            />
          ) : null}
        </View>
      )}
      {needsBackground ? (
        <Button label="Lock this scene's background first" variant="quiet" onPress={() => router.push(`/project/${project.id}/looks`)} />
      ) : null}
      {waiting ? (
        <T v="caption" c="ash">
          Shoot scene 1 first: it sets where the video starts in the song.
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: space.m },
  explain: { gap: space.s, padding: space.l, borderRadius: radius.l, backgroundColor: color.flat, borderWidth: 1, borderColor: color.hairline },
  scene: { gap: space.m, padding: space.l, borderRadius: radius.l, backgroundColor: color.curtain, borderWidth: 1, borderColor: color.hairline },
  sceneOpen: { borderColor: color.accent },
  sceneTop: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  locThumb: { width: 72, height: 48, borderRadius: radius.s, overflow: 'hidden', backgroundColor: color.flat },
  lockedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.s, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: color.accent },
  take: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  takeThumb: { width: 40, height: 56, borderRadius: radius.s, overflow: 'hidden', backgroundColor: color.flat },
  bestPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.s, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: color.accentSoft },
  actions: { flexDirection: 'row', gap: space.s },
  cover: { gap: space.xs },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  matchThumb: { width: 64, height: 40, borderRadius: radius.s, overflow: 'hidden', backgroundColor: color.flat },
});
