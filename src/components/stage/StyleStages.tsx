import { Lightbulb } from '@/components/icons';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { approveBroll, ensureBroll, generateBroll, lockFx, setFxIntensity, setFxPack, skipStage, toggleBrollKeep, toggleEffect } from '@/engine/actions';
import { FX_EFFECTS, FX_INTENSITIES, FX_PACKS, fxPack } from '@/engine/fx';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { FxPackId, LocationKind, Project, Vibe } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Frame } from '../Frame';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { Toggle } from '../Toggle';
import { JobBar, StageScreen, WatchHow, WrappedNote, stageStyles } from './StageChrome';

const CLIP_LOOKS: LocationKind[] = ['alley', 'beach', 'hangingMic', 'darkVoid', 'whiteVoid'];

export function BrollStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'broll');
  useEffect(() => {
    apply(project.id, ensureBroll);
  }, [apply, project.id]);
  const ideas = project.broll.ideas;
  const kept = ideas.filter((i) => i.keep).length;
  const generated = ideas.some((i) => i.status === 'clip' || i.status === 'approved');
  const working = project.job?.stage === 'broll';

  return (
    <StageScreen
      project={project}
      stage="broll"
      footer={
        working ? (
          <JobBar project={project} />
        ) : status === 'done' || status === 'skipped' ? (
          <WrappedNote text={status === 'skipped' ? 'Skipped. To add b-roll, tap B-roll on the slate and go back.' : undefined} />
        ) : generated ? (
          <Button label="Approve b-roll" onPress={() => apply(project.id, approveBroll)} />
        ) : (
          <>
            <Button label={kept ? `Generate ${kept} ${kept === 1 ? 'clip' : 'clips'}` : 'Keep at least one idea'} disabled={!kept} onPress={() => apply(project.id, generateBroll)} />
            <Button label="Skip B-roll" variant="quiet" onPress={() => apply(project.id, (p) => skipStage(p, 'broll'))} />
          </>
        )
      }>
      <T v="body" c="smoke">
        Cutaways matched to your lyrics. Ideas you dropped in chat land here too.
      </T>
      {ideas.map((idea, i) => (
        <View key={idea.id} style={stageStyles.card}>
          {idea.status !== 'idea' ? (
            <Frame kind={CLIP_LOOKS[i % CLIP_LOOKS.length]} noArtist label={idea.status === 'approved' ? 'Clip, approved' : 'Clip ready'} />
          ) : null}
          <View style={stageStyles.row}>
            <View style={stageStyles.flex}>
              {idea.fromInbox ? (
                <View style={styles.inbox}>
                  <Lightbulb size={14} color={color.smoke} />
                  <T v="micro" c="smoke">
                    From your idea inbox
                  </T>
                </View>
              ) : (
                <T v="caption" c="ash">{`"${idea.lyric}"`}</T>
              )}
              <T v="callout">{idea.shot}</T>
            </View>
            <Toggle
              value={idea.keep}
              label={`Keep: ${idea.shot}`}
              disabled={generated || working || project.broll.approved}
              onChange={() => apply(project.id, (p) => toggleBrollKeep(p, idea.id))}
            />
          </View>
        </View>
      ))}
    </StageScreen>
  );
}

const VIBE_PACK: Record<Vibe, FxPackId> = {
  Drill: 'drill',
  Trap: 'trapHype',
  Melodic: 'melodic',
  'Boom bap': 'boomBap',
  Dark: 'dark',
};

export function VfxStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  useEffect(() => {
    if (!project.fx.pack && project.vibe && !project.fx.locked) apply(project.id, (p) => setFxPack(p, VIBE_PACK[project.vibe!]));
  }, [apply, project.id, project.fx.pack, project.fx.locked, project.vibe]);

  const fx = project.fx;
  const pack = fxPack(fx.pack);
  const hook = project.song?.sections.find((s) => s.kind === 'hook');
  const look = (hook && project.locations[hook.id]) || 'darkVoid';
  const locked = fx.locked;
  const intensity = FX_INTENSITIES.find((x) => x.id === fx.intensity);

  return (
    <StageScreen
      project={project}
      stage="vfx"
      footer={
        locked ? (
          <WrappedNote />
        ) : (
          <>
            <Button label="Lock FX plan" disabled={!fx.pack} onPress={() => apply(project.id, lockFx)} />
            <WatchHow stage="vfx" />
          </>
        )
      }>
      <Frame kind={look} relit behindText={fx.effects.textBehind ? project.title.toUpperCase() : undefined} label={pack ? `${pack.title} pack, ${fx.intensity.toLowerCase()}` : 'Pick a pack'} />

      <View style={stageStyles.block}>
        <SectionTitle detail="Every effect lands on the beat map: snares, 808s, drops, words.">Pack</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packs}>
          {FX_PACKS.map((p) => {
            const on = fx.pack === p.id;
            return (
              <Press
                key={p.id}
                disabled={locked}
                onPress={() => {
                  haptic.select();
                  apply(project.id, (x) => setFxPack(x, p.id));
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: locked }}
                accessibilityLabel={`${p.title} pack. ${p.feel}`}
                style={[styles.pack, on && styles.packOn]}>
                <T v="label" style={{ color: on ? color.stage : color.chalk }}>
                  {p.title}
                </T>
                <View style={styles.density} accessibilityElementsHidden>
                  {p.density.map((d, i) => (
                    <View key={i} style={[styles.bar, { height: 6 + d * 6, backgroundColor: on ? color.stage : color.smoke }]} />
                  ))}
                </View>
                <T v="caption" numberOfLines={3} style={{ color: on ? color.rig : color.smoke }}>
                  {p.feel}
                </T>
              </Press>
            );
          })}
        </ScrollView>
      </View>

      <View style={stageStyles.block}>
        <SectionTitle detail={intensity?.detail}>How hard it hits</SectionTitle>
        <View style={styles.segment}>
          {FX_INTENSITIES.map((x) => {
            const on = fx.intensity === x.id;
            return (
              <Press
                key={x.id}
                disabled={locked}
                onPress={() => {
                  haptic.select();
                  apply(project.id, (p) => setFxIntensity(p, x.id));
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: locked }}
                accessibilityLabel={x.id}
                style={[styles.segBtn, on && styles.segOn]}>
                <T v="callout" style={{ color: on ? color.stage : color.chalk }}>
                  {x.id}
                </T>
              </Press>
            );
          })}
        </View>
      </View>

      <View style={stageStyles.block}>
        <SectionTitle detail="The pack turns these on. Change any of them.">Effects</SectionTitle>
        <View>
          {FX_EFFECTS.map((e) => (
            <View key={e.id} style={styles.effect}>
              <View style={stageStyles.flex}>
                <T v="callout">{e.title}</T>
                <T v="caption" c="smoke">
                  {e.usesMatte ? `${e.trigger}. Uses your cutout from the switch.` : e.trigger}
                </T>
              </View>
              <Toggle value={fx.effects[e.id]} label={e.title} disabled={locked} onChange={() => apply(project.id, (p) => toggleEffect(p, e.id))} />
            </View>
          ))}
        </View>
      </View>
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  inbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  packs: {
    gap: space.m,
    paddingRight: space.l,
  },
  pack: {
    width: 168,
    minHeight: 150,
    padding: space.l,
    gap: space.s,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  packOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  density: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 30,
  },
  bar: {
    width: 8,
    borderRadius: 2,
  },
  segment: {
    flexDirection: 'row',
    gap: space.s,
  },
  segBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  effect: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingVertical: space.s,
  },
});
