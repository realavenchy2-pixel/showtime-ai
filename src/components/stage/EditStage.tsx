import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { buildEdit, lockEdit, setCopiedFx, setFxIntensity, setFxPack, toggleEffect } from '@/engine/actions';
import { copyFxFromVideo } from '@/media/copyFx';
import { Upload } from '@/components/icons';
import { showToast } from '../Toast';
import { FX_EFFECTS, FX_INTENSITIES, FX_PACKS } from '@/engine/fx';
import { useApp } from '@/engine/store';
import type { FxIntensity, Project } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Chips } from '../Chips';
import { PlayerView } from '../player/PlayerView';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { Toggle } from '../Toggle';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

/** Stage 7: the edit. Watch it with every effect live, change the pack or single effects, then lock it. */
export function EditStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [copying, setCopying] = useState(false);
  const working = project.job?.stage === 'edit';
  const built = project.final.builds > 0;
  const locked = project.final.locked;
  const hasLyrics = (project.song?.lyrics.length ?? 0) > 0;
  // Effects that sit behind or around the artist need the matte that comes back with a real switched shot.
  const hasMatte = project.shots.some((s) => !!s.alphaUrl);

  return (
    <StageScreen
      project={project}
      stage="edit"
      footer={
        working ? (
          <JobBar project={project} />
        ) : locked ? (
          <WrappedNote text="The edit is locked. Tap Edit on the slate to reopen it." />
        ) : built ? (
          <Button
            label="Lock the edit"
            onPress={() => {
              haptic.success();
              apply(project.id, lockEdit);
            }}
          />
        ) : (
          <Button label="Build the edit" onPress={() => apply(project.id, (p) => buildEdit(p))} />
        )
      }>
      <PlayerView project={project} effects label={built ? 'Edit with effects' : 'Effects preview'} />
      {!locked ? (
        <T v="caption" c="smoke">
          Every change below shows up in the player right away. Hits land on the beat grid of your song.
        </T>
      ) : null}

      <View style={stageStyles.block}>
        <SectionTitle>Effects pack</SectionTitle>
        <View style={styles.packs} accessibilityRole="radiogroup">
          {FX_PACKS.map((pack) => {
            const on = project.fx.pack === pack.id;
            return (
              <Press
                key={pack.id}
                scaleTo={0.99}
                disabled={locked}
                onPress={() => {
                  if (on) return;
                  haptic.select();
                  apply(project.id, (p) => setFxPack(p, pack.id));
                }}
                style={[styles.pack, on && styles.packOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${pack.title}. ${pack.feel}`}>
                <View style={stageStyles.flex}>
                  <T v="label">{pack.title}</T>
                  <T v="caption" c="smoke">
                    {pack.feel}
                  </T>
                </View>
                <View style={styles.density} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {pack.density.map((d, i) => (
                    <View key={i} style={[styles.bar, { height: 6 + d * 5 }, on && styles.barOn]} />
                  ))}
                </View>
              </Press>
            );
          })}
          {project.fx.pack === 'copied' && project.fx.copied ? (
            <View style={[styles.pack, styles.packOn]}>
              <View style={stageStyles.flex}>
                <T v="label">{project.fx.copied.title}</T>
                <T v="caption" c="smoke">{`${project.fx.copied.feel}. ${project.fx.copied.cutsPerSec} cuts a second.`}</T>
              </View>
              <View style={styles.density} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {project.fx.copied.density.map((d, i) => (
                  <View key={i} style={[styles.bar, styles.barOn, { height: 6 + d * 5 }]} />
                ))}
              </View>
            </View>
          ) : null}
          <Press
            scaleTo={0.99}
            disabled={locked || copying}
            onPress={async () => {
              setCopying(true);
              try {
                const copied = await copyFxFromVideo();
                if (copied) {
                  haptic.success();
                  apply(project.id, (p) => setCopiedFx(p, copied));
                }
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'That video could not be read.');
              } finally {
                setCopying(false);
              }
            }}
            style={[styles.pack, styles.copy]}
            accessibilityLabel="Copy the effects from a video you upload">
            <Upload size={20} color={color.chalk} />
            <View style={stageStyles.flex}>
              <T v="label">{copying ? 'Watching your video' : 'Copy from a video'}</T>
              <T v="caption" c="smoke">
                Upload a video you love. I copy its color, how fast it cuts, its flashes and shakes. See one on YouTube? Screen-record it and upload that.
              </T>
            </View>
          </Press>
        </View>
      </View>

      <View style={stageStyles.block}>
        <SectionTitle detail={FX_INTENSITIES.find((i) => i.id === project.fx.intensity)?.detail}>How hard</SectionTitle>
        <Chips<FxIntensity>
          label="Effects intensity"
          value={project.fx.intensity}
          disabled={locked}
          onChange={(intensity) => apply(project.id, (p) => setFxIntensity(p, intensity))}
          options={FX_INTENSITIES.map((x) => ({ value: x.id, label: x.id }))}
        />
      </View>

      <View style={stageStyles.block}>
        <SectionTitle>Effects</SectionTitle>
        {FX_EFFECTS.map((fx) => {
          const blocked = (fx.usesMatte && !hasMatte) || (fx.id === 'kineticLyrics' && !hasLyrics);
          const why = fx.usesMatte && !hasMatte ? 'Needs the matte from a live switched shot' : fx.id === 'kineticLyrics' && !hasLyrics ? 'Needs timed lyrics for this song' : fx.trigger;
          return (
            <View key={fx.id} style={styles.row}>
              <View style={stageStyles.flex}>
                <T v="callout" c={blocked ? 'smoke' : 'chalk'}>
                  {fx.title}
                </T>
                <T v="caption" c="ash">
                  {why}
                </T>
              </View>
              <Toggle value={project.fx.effects[fx.id] && !blocked} onChange={(v) => apply(project.id, (p) => toggleEffect(p, fx.id, v))} label={fx.title} disabled={locked || blocked} />
            </View>
          );
        })}
      </View>
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  packs: {
    gap: space.s,
  },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  copy: { borderStyle: 'dashed' },
  packOn: {
    borderColor: color.chalk,
    backgroundColor: color.flat,
  },
  density: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 28,
  },
  bar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: color.rig,
  },
  barOn: {
    backgroundColor: color.chalk,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: 56,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
});
