import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check, Clock, Flag, X } from '@/components/icons';
import { approveAllShots, approveShot, redoShot, setSwitchSettings, startSwitch } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { locationTitle } from '@/engine/samples';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import { switchCredits } from '@/engine/switchx';
import type { AlphaMode, Project, Shot } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Chips } from '../Chips';
import { MediaImage } from '../MediaImage';
import { PlayerView } from '../player/PlayerView';
import { Press } from '../Press';
import { T } from '../T';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

const ALPHA: { value: AlphaMode; label: string; detail: string }[] = [
  { value: 'auto', label: 'Auto', detail: 'Keeps you, rebuilds the rest' },
  { value: 'select', label: 'Select', detail: 'Keeps what you point at' },
  { value: 'fill', label: 'Fill', detail: 'Restyles the whole frame' },
  { value: 'custom', label: 'Upload', detail: 'Your own matte' },
];

const RESOLUTIONS: { value: 720 | 1080 | 2160; label: string }[] = [
  { value: 720, label: '720p' },
  { value: 1080, label: '1080p' },
  { value: 2160, label: '4K' },
];

function modelName(model: string): string {
  return model.replace(/^switchx-/, 'SwitchX ').replace(/^switchx$/i, 'SwitchX');
}

/** Stage 5: every shot through SwitchX. Laid out like SwitchX itself: source, alpha mask, references, prompt, settings. */
export function SwitchStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'switch');
  const shots = project.shots;
  const settings = project.switchSettings;
  const firstFlag = shots.find((s) => s.flag || s.status === 'failed');
  const [selectedId, setSelectedId] = useState<string | null>(firstFlag?.id ?? shots[0]?.id ?? null);
  const [cue, setCue] = useState<{ time: number; key: number; play?: boolean; until?: number }>();
  const shot = shots.find((s) => s.id === selectedId) ?? firstFlag ?? shots[0];
  const take = shot ? project.takes.find((t) => t.id === shot.takeId) : undefined;
  const section = shot ? project.song?.sections.find((s) => s.id === shot.sectionId) : undefined;
  const look = shot ? project.looks[shot.sectionId] : undefined;
  const working = project.job?.stage === 'switch';
  const ready = shots.filter((s) => s.status === 'ready').length;
  const failed = shots.filter((s) => s.status === 'failed');
  const editable = shots.length === 0 && !project.job;
  const totalCredits = shots.reduce((sum, s) => sum + switchCredits(s.frames, settings.resolution), 0);

  const select = (s: Shot) => {
    setSelectedId(s.id);
    setCue((c) => ({ time: s.start, key: (c?.key ?? 0) + 1, play: true, until: s.end }));
  };

  return (
    <StageScreen
      project={project}
      stage="switch"
      footer={
        working ? (
          <JobBar project={project} />
        ) : status === 'done' ? (
          <WrappedNote text="Every shot is approved. Tap Switch on the slate to go back and redo it." />
        ) : shots.length === 0 ? (
          // Reference frames are built first, then the shots go up on their own.
          <Button label="Start the switch" disabled={!project.cut.locked} onPress={() => apply(project.id, (p) => startSwitch(p))} />
        ) : ready > 0 ? (
          <Button
            label={ready === 1 ? (failed.length ? 'Approve the shot that’s back' : 'Approve the last shot') : `Approve all ${ready} shots`}
            onPress={() => {
              haptic.success();
              apply(project.id, approveAllShots);
            }}
          />
        ) : failed.length ? (
          <Button
            label={failed.length === 1 ? 'Redo the shot that failed' : `Redo the ${failed.length} shots that failed`}
            onPress={() => apply(project.id, (p) => failed.reduce((acc, s) => redoShot(acc, s.id), p))}
          />
        ) : null
      }>
      {shot && take ? (
        <>
          <PlayerView project={project} effects={false} cue={cue} label={shot.status === 'queued' || shot.status === 'rendering' ? 'Your take' : look ? locationTitle(look.location) : undefined} />

          <View style={stageStyles.card}>
            <View style={stageStyles.row}>
              <View style={stageStyles.flex}>
                <T v="heading">{`Shot ${shot.n} of ${shots.length}${section ? `, ${section.label}` : ''}`}</T>
                <T v="caption" c={shot.flag || shot.status === 'failed' ? 'accent' : 'smoke'}>
                  {shot.status === 'failed' ? shot.error ?? "It didn't render" : shot.flag ?? shotState(shot)}
                </T>
              </View>
            </View>
            {shot.status === 'ready' || shot.status === 'failed' ? (
              <View style={stageStyles.row}>
                {shot.status === 'ready' ? (
                  <Button
                    label="Approve shot"
                    variant="secondary"
                    style={stageStyles.flex}
                    onPress={() => {
                      haptic.select();
                      apply(project.id, (p) => approveShot(p, shot.id));
                    }}
                  />
                ) : null}
                <Button label="Redo" variant={shot.status === 'failed' ? 'secondary' : 'quiet'} style={shot.status === 'failed' ? stageStyles.flex : undefined} onPress={() => apply(project.id, (p) => redoShot(p, shot.id))} />
              </View>
            ) : shot.status === 'approved' && !working ? (
              <Button label="Redo this shot" variant="quiet" onPress={() => apply(project.id, (p) => redoShot(p, shot.id))} />
            ) : null}
          </View>

          <Panel n="1" title="Source">
            <T v="callout">{`${take.label}, ${formatTime(shot.start)} to ${formatTime(shot.end)}`}</T>
            <T v="caption" c="smoke">{`${shot.frames} frames at ${shot.fps} fps. ${modelName(settings.model)} takes up to ${settings.maxFrames} in one shot.`}</T>
          </Panel>
        </>
      ) : (
        <T v="body" c="smoke">
          {project.cut.locked
            ? 'Every shot on screen goes through SwitchX with its scene’s look. Reference frames come first. Seconds under b-roll are skipped.'
            : 'The switch opens once the cut is locked.'}
        </T>
      )}

      <Panel n="2" title="Alpha mask">
        <Chips<AlphaMode> label="Alpha mask" value={settings.alphaMode} disabled={!editable} onChange={(alphaMode) => apply(project.id, (p) => setSwitchSettings(p, { alphaMode }))} options={ALPHA} />
      </Panel>

      {look ? (
        <>
          <Panel n="3" title={`Reference images ${look.refs.length}/${settings.maxRefs}`}>
            {look.refs.length ? (
              <View style={styles.refs}>
                {look.refs.map((ref) => (
                  <View key={ref.id} style={styles.ref}>
                    <MediaImage mediaId={ref.mediaId} uri={ref.uri} style={styles.fill} label={ref.label} />
                  </View>
                ))}
              </View>
            ) : null}
            <T v="caption" c="smoke">
              {look.refs.length ? `${locationTitle(look.location)}, from your references.` : `${locationTitle(look.location)}. The reference is built from a frame of this take so the light matches.`}
            </T>
          </Panel>
          <Panel title="Prompt">
            <T v="body" c="smoke">
              {look.prompt || 'No prompt. SwitchX follows the reference alone.'}
            </T>
          </Panel>
        </>
      ) : null}

      <Panel title="Settings">
        <Chips<720 | 1080 | 2160> label="Resolution" value={settings.resolution} disabled={!editable} onChange={(resolution) => apply(project.id, (p) => setSwitchSettings(p, { resolution }))} options={RESOLUTIONS} />
        <T v="caption" c="smoke">
          {shots.length
            ? `${modelName(settings.model)}. ${shots.length} shots, about ${totalCredits.toLocaleString()} Beeble credits at ${settings.resolution}p.`
            : `${modelName(settings.model)}. Explore at 720p, then finish the keepers sharper.`}
        </T>
      </Panel>

      {shots.length ? (
        <View style={stageStyles.block}>
          <T v="heading">Shots</T>
          <View style={styles.grid}>
            {shots.map((s) => (
              <ShotTile key={s.id} shot={s} selected={s.id === shot?.id} onPress={() => select(s)} />
            ))}
          </View>
        </View>
      ) : null}
    </StageScreen>
  );
}

function shotState(shot: Shot): string {
  switch (shot.status) {
    case 'queued':
      return 'Waiting its turn';
    case 'rendering':
      return `Rendering, ${Math.round(shot.progress * 100)}%`;
    case 'ready':
      return 'Back. Play it, then approve or redo.';
    case 'approved':
      return 'Approved';
    case 'failed':
      return "It didn't render";
  }
}

function Panel({ n, title, children }: { n?: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        {n ? (
          <View style={styles.num}>
            <T v="micro" c="smoke">
              {n}
            </T>
          </View>
        ) : null}
        <T v="heading">{title}</T>
      </View>
      {children}
    </View>
  );
}

function ShotTile({ shot, selected, onPress }: { shot: Shot; selected: boolean; onPress: () => void }) {
  const flagged = !!shot.flag || shot.status === 'failed';
  const Icon = shot.status === 'approved' ? Check : shot.status === 'failed' ? X : flagged ? Flag : shot.status === 'ready' ? undefined : Clock;
  return (
    <Press
      onPress={onPress}
      style={[styles.tile, selected && styles.tileOn, flagged && styles.tileFlag]}
      accessibilityLabel={`Shot ${shot.n}, ${shot.status === 'failed' ? 'failed' : flagged ? 'needs a look' : shotState(shot)}`}
      accessibilityState={{ selected }}>
      {shot.status === 'rendering' ? <View style={[styles.tileFill, { width: `${Math.round(shot.progress * 100)}%` }]} /> : null}
      <T v="callout" c={shot.status === 'queued' ? 'ash' : 'chalk'}>
        {String(shot.n)}
      </T>
      {Icon ? <Icon size={12} color={flagged ? color.accent : shot.status === 'approved' ? color.chalk : color.ash} /> : <View style={styles.dot} />}
    </Press>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space.m,
    padding: space.l,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  num: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  refs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
  },
  ref: {
    width: 72,
    height: 72,
    borderRadius: radius.s,
    overflow: 'hidden',
    backgroundColor: color.flat,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tile: {
    width: '15.4%',
    minWidth: 46,
    height: 46,
    borderRadius: radius.s,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
  },
  tileOn: {
    borderColor: color.chalk,
  },
  tileFlag: {
    borderColor: color.accent,
  },
  tileFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: color.rig,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.chalk,
  },
});
