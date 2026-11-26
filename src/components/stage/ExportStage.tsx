import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Check, Monitor, Smartphone } from '@/components/icons';
import { exportCost, isSubscribed, setExportFormats, setResolution } from '@/engine/actions';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { Format, Project, Resolution } from '@/engine/types';
import { latestVersion } from '@/engine/versions';
import { cancelExport, runExport, targetDimensions } from '@/lib/exportRun';
import { haptic } from '@/lib/haptics';
import { canExport, prepareExportAudio } from '@/media/exporter';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Chips } from '../Chips';
import { PlayerView } from '../player/PlayerView';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';
import { latestTitle, TouchUpCard, VersionFiles, VersionsList } from './TouchUp';

const FORMATS: { id: Format; title: string; detail: string }[] = [
  { id: '16:9', title: 'YouTube', detail: 'Wide, 16:9' },
  { id: '9:16', title: 'Reels and TikTok', detail: 'Tall, 9:16' },
  { id: '1:1', title: 'Square', detail: 'Feed posts, 1:1' },
  { id: '4:5', title: 'Instagram feed', detail: 'Portrait, 4:5' },
];

/** Stage 8: pick where it posts and how sharp, render, and save the files. */
export function ExportStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const credits = useApp((s) => s.credits);
  const plan = useApp((s) => s.plan);
  const status = stageStatus(project, 'export');
  const state = project.exportState;
  const working = project.job?.stage === 'export';
  const onDevice = canExport();
  const live = project.pipeline === 'live';
  const cost = exportCost(project, plan);
  // What each size adds on top of the base price, for this video on this plan.
  const extraAt = (resolution: Resolution) => exportCost({ ...project, exportState: { ...state, resolution } }, plan) - exportCost({ ...project, exportState: { ...state, resolution: '1080p' } }, plan);
  const sizeNote = (resolution: Resolution) => (extraAt(resolution) > 0 ? `+${extraAt(resolution)} credit` : 'Included');
  const editable = !state.done && !project.job && project.final.locked;

  const toggle = (format: Format) => {
    haptic.select();
    const next = state.formats.includes(format) ? state.formats.filter((f) => f !== format) : [...state.formats, format];
    apply(project.id, (p) => setExportFormats(p, FORMATS.map((f) => f.id).filter((f) => next.includes(f))));
  };

  const start = async () => {
    // Before anything waits: wake the song's player while this is still the tap.
    const audio = onDevice ? prepareExportAudio(project.song) : undefined;
    const outcome = await runExport(project.id, audio);
    if (outcome === 'needCredits') router.push('/paywall');
    if (outcome === 'done') haptic.success();
  };

  const latest = latestVersion(project);
  const subscribed = isSubscribed(plan);
  const exportLabel = latest ? `Export v${latest.n + 1}, ${cost === 0 ? 'free' : `${cost} ${cost === 1 ? 'credit' : 'credits'}`}` : `Export, ${cost} ${cost === 1 ? 'credit' : 'credits'}`;
  const priceNote = latest ? (subscribed ? 'Touch-ups are free on your plan.' : `You have ${credits} ${credits === 1 ? 'credit' : 'credits'}. Touch-ups are free on a plan.`) : `You have ${credits} ${credits === 1 ? 'credit' : 'credits'}.`;

  return (
    <StageScreen
      project={project}
      stage="export"
      footer={
        working ? (
          <>
            <JobBar project={project} />
            {project.job?.external ? <Button label="Cancel" variant="quiet" onPress={() => cancelExport(project.id)} /> : null}
          </>
        ) : state.done ? (
          <WrappedNote text={`${latest ? `v${latest.n} is exported.` : 'Exported.'} Touch it up below, or tap Export on the slate to render it again in other sizes.`} />
        ) : status === 'locked' ? null : (
          <>
            <Button label={exportLabel} disabled={state.formats.length === 0} onPress={() => void start()} />
            <T v="caption" c="ash" style={styles.center}>
              {`${priceNote}${onDevice ? ' It renders on this device in about the length of the song per format.' : ''}`}
            </T>
          </>
        )
      }>
      <PlayerView project={project} effects label={state.done && latest ? `v${latest.n}, exported` : latest ? `v${latest.n + 1}, not exported yet` : 'Final edit'} />

      {state.done ? (
        <>
          {latest ? (
            <View style={stageStyles.block}>
              <SectionTitle detail={latest.changes.length ? latest.changes.join('. ') : 'Tap one to save it or send it straight to an app.'}>{latestTitle(latest)}</SectionTitle>
              <VersionFiles project={project} version={latest} />
            </View>
          ) : null}
          {project.isSample ? null : <TouchUpCard project={project} />}
          <VersionsList project={project} skipLatest={!!latest} />
        </>
      ) : (
        <>
          <View style={stageStyles.block}>
            <SectionTitle detail="Each one is laid out for its frame from the same edit.">Where it posts</SectionTitle>
            {FORMATS.map((f) => {
              const on = state.formats.includes(f.id);
              const Icon = f.id === '9:16' ? Smartphone : Monitor;
              return (
                <Press
                  key={f.id}
                  onPress={() => toggle(f.id)}
                  disabled={!editable}
                  scaleTo={0.99}
                  style={[styles.format, on && styles.formatOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${f.title}, ${f.detail}`}>
                  <Icon size={20} color={on ? color.chalk : color.smoke} />
                  <View style={stageStyles.flex}>
                    <T v="callout">{f.title}</T>
                    <T v="caption" c="smoke">
                      {`${f.detail}, ${targetDimensions(f.id, state.resolution).width} x ${targetDimensions(f.id, state.resolution).height}`}
                    </T>
                  </View>
                  <View style={[styles.check, on && styles.checkOn]}>{on ? <Check size={14} color={color.stage} /> : null}</View>
                </Press>
              );
            })}
          </View>

          <View style={stageStyles.block}>
            <SectionTitle detail={live ? '1440p and 4K are upscaled on the studio server. Always 24 fps.' : '720p and 1080p render here. 1440p and 4K finish on the studio server once it is connected. Always 24 fps.'}>How sharp</SectionTitle>
            <Chips<Resolution>
              label="Resolution"
              value={state.resolution}
              disabled={!editable}
              onChange={(resolution) => apply(project.id, (p) => setResolution(p, resolution))}
              options={[
                { value: '720p', label: '720p', detail: 'Smallest file' },
                { value: '1080p', label: '1080p HD', detail: 'Included' },
                { value: '1440p', label: '1440p 2K', detail: sizeNote('1440p') },
                { value: '4K', label: '4K', detail: sizeNote('4K') },
              ]}
            />
          </View>
          <VersionsList project={project} />
        </>
      )}
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  format: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: 64,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  formatOn: {
    borderColor: color.hairlineStrong,
    backgroundColor: color.flat,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  checkOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
});
