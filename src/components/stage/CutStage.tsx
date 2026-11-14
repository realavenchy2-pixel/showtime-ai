import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Play, Shuffle } from '@/components/icons';
import { cutLine, lockCut, reshuffleCut, swapSegmentTake } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { useApp } from '@/engine/store';
import type { CutSegment, Project } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { PlayerView } from '../player/PlayerView';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

/** Stage 3: the takes cut to the beat. Every shot can be played and handed to another take. */
export function CutStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [selected, setSelected] = useState<string | null>(null);
  const [cue, setCue] = useState<{ time: number; key: number; play?: boolean; until?: number }>();
  const song = project.song;
  const segments = project.cut.segments;
  const takes = new Map(project.takes.map((t) => [t.id, t]));
  // The cut can change until the plan runs and shots go to the switch.
  const open = !project.planApproved && project.shots.length === 0 && !project.job;
  const working = project.job?.stage === 'cut';
  const current = segments.find((s) => s.id === selected);
  const options = current ? project.takes.filter((t) => t.start <= current.start + 0.05 && t.end >= current.end - 0.05 && (!t.hookOnly || song?.sections.find((s) => s.id === current.sectionId)?.kind === 'hook')) : [];

  const play = (seg: CutSegment) => {
    setSelected(seg.id);
    setCue((c) => ({ time: seg.start, key: (c?.key ?? 0) + 1, play: true, until: seg.end }));
  };

  return (
    <StageScreen
      project={project}
      stage="cut"
      footer={
        working ? (
          <JobBar project={project} />
        ) : segments.length && !project.cut.locked ? (
          <Button label="Lock the cut" onPress={() => apply(project.id, lockCut)} />
        ) : open && segments.length ? (
          <Button
            label="Shuffle the cut"
            variant="secondary"
            icon={Shuffle}
            onPress={() => {
              haptic.select();
              setSelected(null);
              apply(project.id, reshuffleCut);
            }}
          />
        ) : (
          <WrappedNote text={segments.length ? 'The cut is locked in. Tap Cut on the slate to go back and change it.' : 'The cut shows up here once the shoot is wrapped.'} />
        )
      }>
      {segments.length ? (
        <>
          <PlayerView project={project} effects={false} label="Cut on the beat" cue={cue} />
          <T v="body" c="smoke">
            {cutLine(project)} {open ? 'Tap a shot to play it or hand it to another take.' : ''}
          </T>

          {current ? (
            <View style={stageStyles.card}>
              <View style={stageStyles.row}>
                <View style={stageStyles.flex}>
                  <T v="heading">{`Shot ${segments.filter((s) => s.takeId).findIndex((s) => s.id === current.id) + 1}`}</T>
                  <T v="caption" c="smoke">{`${formatTime(current.start)} to ${formatTime(current.end)}, ${(current.end - current.start).toFixed(1)} s`}</T>
                </View>
                <Press onPress={() => play(current)} style={styles.playBtn} accessibilityLabel="Play this shot">
                  <Play size={18} color={color.chalk} fill={color.chalk} />
                </Press>
              </View>
              <View style={styles.wrap} accessibilityRole="radiogroup">
                {options.map((t) => {
                  const on = t.id === current.takeId;
                  return (
                    <Press
                      key={t.id}
                      disabled={!open || on}
                      onPress={() => {
                        haptic.select();
                        apply(project.id, (p) => swapSegmentTake(p, current.id, t.id));
                      }}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={t.label}>
                      <T v="caption" style={{ color: on ? color.stage : color.chalk }}>
                        {t.label}
                      </T>
                    </Press>
                  );
                })}
                {options.length === 0 ? (
                  <T v="caption" c="smoke">
                    No take covers this part of the song.
                  </T>
                ) : null}
              </View>
            </View>
          ) : null}

          {song?.sections.map((section) => {
            const list = segments.filter((s) => s.sectionId === section.id);
            if (!list.length) return null;
            return (
              <View key={section.id} style={stageStyles.block}>
                <SectionTitle detail={`${formatTime(section.start)} to ${formatTime(section.end)}`}>{section.label}</SectionTitle>
                <View style={styles.wrap}>
                  {list.map((seg) => {
                    const take = takes.get(seg.takeId);
                    const on = seg.id === selected;
                    return (
                      <Press
                        key={seg.id}
                        onPress={() => play(seg)}
                        style={[styles.shot, on && styles.shotOn, !take && styles.gap]}
                        accessibilityLabel={`${take ? take.label : 'No take'}, ${formatTime(seg.start)} to ${formatTime(seg.end)}`}>
                        <T v="caption" c={take ? 'chalk' : 'ash'} numberOfLines={1}>
                          {take ? take.label : 'No take'}
                        </T>
                        <T v="micro" c="ash">{`${(seg.end - seg.start).toFixed(1)} s`}</T>
                      </Press>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </>
      ) : (
        <T v="body" c="smoke">
          {working ? "I'm sorting your takes and cutting on the beat." : "Wrap the shoot and I'll cut your takes on the beat."}
        </T>
      )}
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
  },
  shot: {
    minWidth: 76,
    minHeight: 48,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.s,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
    justifyContent: 'center',
  },
  shotOn: {
    borderColor: color.chalk,
  },
  gap: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.rig,
  },
});
