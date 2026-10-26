import { Check, Clock, Flag } from '@/components/icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  approveAllShots,
  approvePlates,
  approveShot,
  ensureSwaps,
  keepSwaps,
  makePlates,
  redoShot,
  runSwaps,
  setLocation,
  skipStage,
  startSwitch,
  toggleSwap,
} from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { LOCATIONS, locationTitle } from '@/engine/samples';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { LocationKind, Project, Shot } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { SceneArt } from '../art/SceneArt';
import { Button } from '../Button';
import { Compare } from '../Compare';
import { Frame } from '../Frame';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { Toggle } from '../Toggle';
import { JobBar, StageScreen, WatchHow, WrappedNote, stageStyles } from './StageChrome';

export function LocationStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'location');
  const sections = project.song?.sections ?? [];
  const approved = project.plates === 'approved';
  const editable = !approved && !project.job;
  const working = project.job?.stage === 'location';

  return (
    <StageScreen
      project={project}
      stage="location"
      footer={
        working ? (
          <JobBar project={project} />
        ) : status === 'done' ? (
          <WrappedNote />
        ) : project.plates === 'ready' ? (
          <Button label="Approve plates" onPress={() => apply(project.id, approvePlates)} />
        ) : (
          <>
            <Button label="Make my plates" onPress={() => apply(project.id, makePlates)} />
            <WatchHow stage="location" />
          </>
        )
      }>
      <T v="body" c="smoke">
        Pick a look for each part of the song. Your director pitched these; change anything.
      </T>
      {sections.map((sec) => {
        const chosen = project.locations[sec.id];
        return (
          <View key={sec.id} style={stageStyles.block}>
            <SectionTitle detail={`${formatTime(sec.start)} to ${formatTime(sec.end)}`}>{sec.label}</SectionTitle>
            {project.plates !== 'none' && chosen ? (
              <Frame kind={chosen} relit label={`${locationTitle(chosen)} plate${approved ? ', approved' : ''}`} />
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.looks}>
              {LOCATIONS.map((loc) => {
                const on = chosen === loc.id;
                return (
                  <Press
                    key={loc.id}
                    disabled={!editable}
                    onPress={() => {
                      haptic.select();
                      apply(project.id, (p) => setLocation(p, sec.id, loc.id));
                    }}
                    scaleTo={0.96}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on, disabled: !editable }}
                    accessibilityLabel={`${loc.title} for ${sec.label}`}
                    style={[styles.look, !editable && !on && styles.dim]}>
                    <View style={[styles.lookArt, on && styles.lookOn]}>
                      <SceneArt kind={loc.id} noArtist={loc.id === 'hangingMic'} />
                      {on ? (
                        <View style={styles.check}>
                          <Check size={14} color={color.stage} strokeWidth={3} />
                        </View>
                      ) : null}
                    </View>
                    <T v="caption" c={on ? 'chalk' : 'smoke'} numberOfLines={1}>
                      {loc.title}
                    </T>
                  </Press>
                );
              })}
            </ScrollView>
          </View>
        );
      })}
    </StageScreen>
  );
}

export function SwitchStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'switch');
  const shots = project.shots;
  const flagged = shots.find((s) => s.flag);
  const [selectedId, setSelectedId] = useState<string | undefined>(flagged?.id ?? shots[0]?.id);
  const selected = shots.find((s) => s.id === selectedId) ?? shots[0];
  const section = project.song?.sections.find((s) => s.id === selected?.sectionId);
  const location = selected ? project.locations[selected.sectionId] ?? 'darkVoid' : 'darkVoid';
  const working = project.job?.stage === 'switch';

  return (
    <StageScreen
      project={project}
      stage="switch"
      footer={
        working ? (
          <JobBar project={project} />
        ) : status === 'done' ? (
          <WrappedNote />
        ) : shots.length === 0 ? (
          <>
            <Button label="Start the switch" onPress={() => apply(project.id, startSwitch)} />
            <WatchHow stage="switch" />
          </>
        ) : (
          <Button label={`Approve all ${shots.length} shots`} onPress={() => apply(project.id, approveAllShots)} />
        )
      }>
      {selected ? (
        <>
          {selected.status === 'ready' || selected.status === 'approved' ? (
            <Compare location={location} label={locationTitle(location)} />
          ) : (
            <Frame kind="room" relit={false} label={selected.status === 'rendering' ? `Rendering, ${Math.round(selected.progress * 100)}%` : 'In the queue'} />
          )}
          <View style={stageStyles.card}>
            <View style={stageStyles.row}>
              <View style={stageStyles.flex}>
                <T v="callout">{`Shot ${selected.n} of ${shots.length}, ${section?.label ?? ''}`}</T>
                <T v="caption" c="smoke">{`${formatTime(selected.start)} to ${formatTime(selected.end)}, ${selected.frames} frames, ${locationTitle(location)}`}</T>
              </View>
              {selected.status === 'approved' ? <Check size={20} color={color.chalk} /> : null}
            </View>
            {selected.flag ? (
              <T v="caption" c="tungsten">
                {selected.flag}
              </T>
            ) : null}
            {selected.status === 'ready' && !working ? (
              <View style={stageStyles.row}>
                <Button label="Approve shot" variant="secondary" style={stageStyles.flex} onPress={() => apply(project.id, (p) => approveShot(p, selected.id))} />
                <Button label="Redo" variant="quiet" onPress={() => apply(project.id, (p) => redoShot(p, selected.id))} />
              </View>
            ) : null}
          </View>
          <View style={stageStyles.block}>
            <SectionTitle detail="Tap a shot to compare it. Only the seconds in your cut get rendered.">Shots</SectionTitle>
            <View style={styles.grid}>
              {shots.map((s) => (
                <ShotTile
                  key={s.id}
                  shot={s}
                  location={project.locations[s.sectionId] ?? 'darkVoid'}
                  selected={s.id === selected.id}
                  onPress={() => {
                    haptic.select();
                    setSelectedId(s.id);
                  }}
                />
              ))}
            </View>
          </View>
        </>
      ) : (
        <View style={stageStyles.block}>
          <Frame kind={project.locations[project.song?.sections[0]?.id ?? ''] ?? 'alley'} relit label="Your first plate" />
          <T v="body" c="smoke">
            {`${project.cut.segments.length} shots go through the switch, 5 at a time. Your lips and performance stay exactly as filmed; the world around you changes.`}
          </T>
        </View>
      )}
    </StageScreen>
  );
}

function ShotTile({ shot, location, selected, onPress }: { shot: Shot; location: LocationKind; selected: boolean; onPress: () => void }) {
  const done = shot.status === 'ready' || shot.status === 'approved';
  return (
    <Press
      onPress={onPress}
      scaleTo={0.94}
      accessibilityLabel={`Shot ${shot.n}, ${shot.flag ? 'needs a look' : shot.status}`}
      style={[styles.shot, selected && styles.shotSelected, shot.flag ? styles.shotFlag : null]}>
      <SceneArt kind={done ? location : 'room'} relit={done} />
      {!done ? (
        <View style={styles.shotOverlay}>
          {shot.status === 'rendering' ? (
            <T v="micro">{`${Math.round(shot.progress * 100)}%`}</T>
          ) : (
            <Clock size={14} color={color.smoke} />
          )}
        </View>
      ) : null}
      {shot.status === 'approved' ? (
        <View style={styles.shotBadge}>
          <Check size={10} color={color.stage} strokeWidth={3.5} />
        </View>
      ) : null}
      {shot.flag ? (
        <View style={[styles.shotBadge, styles.flagBadge]}>
          <Flag size={10} color={color.ink} strokeWidth={3} />
        </View>
      ) : null}
    </Press>
  );
}

export function GenjutsuStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'genjutsu');
  useEffect(() => {
    apply(project.id, ensureSwaps);
  }, [apply, project.id]);
  const swaps = project.genjutsu.swaps;
  const selectedCount = swaps.filter((s) => s.selected).length;
  const working = project.job?.stage === 'genjutsu';
  const hook = project.song?.sections.find((s) => s.kind === 'hook');

  return (
    <StageScreen
      project={project}
      stage="genjutsu"
      footer={
        working ? (
          <JobBar project={project} />
        ) : status === 'done' || status === 'skipped' ? (
          <WrappedNote text={status === 'skipped' ? 'Skipped. To use it, tap Genjutsu on the slate and go back.' : undefined} />
        ) : project.genjutsu.status === 'ready' ? (
          <Button label="Keep swaps" onPress={() => apply(project.id, keepSwaps)} />
        ) : (
          <>
            <Button label={selectedCount ? `Run ${selectedCount} ${selectedCount === 1 ? 'swap' : 'swaps'}` : 'Pick a swap'} disabled={!selectedCount} onPress={() => apply(project.id, runSwaps)} />
            <Button label="Skip Genjutsu" variant="quiet" onPress={() => apply(project.id, (p) => skipStage(p, 'genjutsu'))} />
          </>
        )
      }>
      <Frame
        kind={(hook && project.locations[hook.id]) || 'hangingMic'}
        relit
        label={project.genjutsu.status === 'idle' ? 'Hook, before swaps' : 'Hook, with swaps'}
      />
      <T v="body" c="smoke">
        Point at something already in frame and swap it. Your motion and timing stay the same.
      </T>
      <View>
        {swaps.map((s) => (
          <View key={s.id} style={styles.swap}>
            <View style={stageStyles.flex}>
              <T v="callout">{s.label}</T>
              <T v="caption" c="smoke">
                {s.detail}
              </T>
              <T v="caption" c="ash">
                {s.where}
              </T>
            </View>
            <Toggle
              value={s.selected}
              label={s.label}
              disabled={project.genjutsu.status !== 'idle' || working}
              onChange={() => apply(project.id, (p) => toggleSwap(p, s.id))}
            />
          </View>
        ))}
      </View>
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  looks: {
    gap: space.m,
    paddingRight: space.l,
  },
  look: {
    width: 92,
    gap: space.xs,
  },
  dim: {
    opacity: 0.4,
  },
  lookArt: {
    width: 92,
    aspectRatio: 3 / 4,
    borderRadius: radius.m,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  lookOn: {
    borderColor: color.chalk,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  shot: {
    width: '23.4%',
    aspectRatio: 16 / 9,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  shotSelected: {
    borderColor: color.chalk,
  },
  shotFlag: {
    borderColor: color.tungsten,
  },
  shotOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagBadge: {
    backgroundColor: color.tungsten,
  },
  swap: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingVertical: space.m,
  },
});
