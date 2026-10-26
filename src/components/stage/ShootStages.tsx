import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { lockCut, swapSegmentTake, updateSong } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { SAMPLE_TRACKS } from '@/engine/samples';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { Project } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Frame } from '../Frame';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { SongForm, songChoiceReady, type SongChoice } from '../SongForm';
import { T } from '../T';
import { JobBar, StageScreen, WatchHow, WrappedNote, stageStyles } from './StageChrome';

export function SongStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [choice, setChoice] = useState<SongChoice>({
    track: SAMPLE_TRACKS.find((t) => t.id === project.song?.id),
    vibe: project.vibe,
    formats: project.formats,
  });
  const status = stageStatus(project, 'song');

  return (
    <StageScreen
      project={project}
      stage="song"
      footer={
        status === 'working' ? (
          <JobBar project={project} />
        ) : status === 'done' ? (
          <WrappedNote />
        ) : (
          <Button
            label="Map my track"
            disabled={!songChoiceReady(choice)}
            onPress={() => {
              if (!songChoiceReady(choice)) return;
              apply(project.id, (p) => updateSong(p, choice));
              router.back();
            }}
          />
        )
      }>
      <SongForm value={choice} onChange={setChoice} />
    </StageScreen>
  );
}

const PX_PER_SEC = 9;

export function RoughCutStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'roughcut');
  const segments = project.cut.segments;
  const [selectedId, setSelectedId] = useState(segments[0]?.id);
  const selected = segments.find((s) => s.id === selectedId) ?? segments[0];
  const selectedIndex = selected ? segments.indexOf(selected) : -1;
  const section = project.song?.sections.find((s) => s.id === selected?.sectionId);
  const take = project.takes.find((t) => t.id === selected?.takeId);
  const locked = project.cut.locked;

  return (
    <StageScreen
      project={project}
      stage="roughcut"
      footer={
        status === 'working' ? (
          <JobBar project={project} />
        ) : locked ? (
          <WrappedNote />
        ) : (
          <>
            <Button label="Lock the cut" disabled={!segments.length} onPress={() => apply(project.id, lockCut)} />
            <WatchHow stage="roughcut" />
          </>
        )
      }>
      {selected ? (
        <>
          <Frame kind="room" relit={false} label={`Shot ${selectedIndex + 1}, take ${take?.n ?? ''}`} />
          <View style={stageStyles.block}>
            <SectionTitle detail="A new shot every 4 bars. Tap a shot to swap the take.">Timeline</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeline}>
              {project.song?.sections.map((sec) => (
                <View key={sec.id} style={styles.section}>
                  <T v="micro" c={sec.id === selected.sectionId ? 'chalk' : 'ash'}>
                    {sec.label}
                  </T>
                  <View style={styles.segRow}>
                    {segments
                      .filter((g) => g.sectionId === sec.id)
                      .map((g) => {
                        const t = project.takes.find((x) => x.id === g.takeId);
                        const on = g.id === selected.id;
                        return (
                          <Press
                            key={g.id}
                            onPress={() => {
                              haptic.select();
                              setSelectedId(g.id);
                            }}
                            scaleTo={0.95}
                            accessibilityLabel={`Shot ${segments.indexOf(g) + 1}, take ${t?.n}`}
                            style={[
                              styles.seg,
                              { width: Math.max(30, (g.end - g.start) * PX_PER_SEC) },
                              sec.kind === 'hook' && styles.segHook,
                              on && styles.segOn,
                            ]}>
                            <T v="micro" c={sec.kind === 'hook' ? 'stage' : 'chalk'}>
                              {`T${t?.n ?? ''}`}
                            </T>
                          </Press>
                        );
                      })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={stageStyles.card}>
            <T v="callout">{`Shot ${selectedIndex + 1}, ${section?.label ?? ''}, ${formatTime(selected.start)} to ${formatTime(selected.end)}`}</T>
            <View style={styles.takes}>
              {project.takes.map((t) => {
                const on = t.id === selected.takeId;
                const fits = t.scope === 'Full song' || section?.kind === 'hook';
                return (
                  <Press
                    key={t.id}
                    disabled={locked || !fits}
                    onPress={() => {
                      haptic.select();
                      apply(project.id, (p) => swapSegmentTake(p, selected.id, t.id));
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: locked || !fits }}
                    accessibilityLabel={`Take ${t.n}, ${t.angle}`}
                    style={[styles.take, on && styles.takeOn, (!fits || locked) && styles.takeOff]}>
                    <T v="label" style={{ color: on ? color.stage : color.chalk }}>{`${t.n}`}</T>
                    <T v="caption" style={{ color: on ? color.stage : color.smoke }}>
                      {t.angle}
                    </T>
                  </Press>
                );
              })}
            </View>
            {take?.flag ? (
              <T v="caption" c="tungsten">
                {`Take ${take.n}: ${take.flag}.`}
              </T>
            ) : null}
          </View>
        </>
      ) : (
        <T v="body" c="smoke">
          The cut shows up here once your takes are in.
        </T>
      )}
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  timeline: {
    gap: space.m,
    paddingRight: space.l,
  },
  section: {
    gap: space.xs,
  },
  segRow: {
    flexDirection: 'row',
    gap: 2,
  },
  seg: {
    height: 44,
    borderRadius: 6,
    backgroundColor: color.rig,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segHook: {
    backgroundColor: color.smoke,
  },
  segOn: {
    borderWidth: 2,
    borderColor: color.tungsten,
  },
  takes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
  },
  take: {
    minWidth: 74,
    minHeight: 56,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    justifyContent: 'center',
  },
  takeOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  takeOff: {
    opacity: 0.35,
  },
});
