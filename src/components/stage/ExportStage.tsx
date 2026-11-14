import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Check, Download, Monitor, Smartphone } from '@/components/icons';
import { exportCost, formatName, setExportFormats, setResolution } from '@/engine/actions';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { Format, Project, Resolution } from '@/engine/types';
import { cancelExport, exportDimensions, exportFileName, runExport } from '@/lib/exportRun';
import { haptic } from '@/lib/haptics';
import { canExport } from '@/media/exporter';
import { mediaBlob, saveToDevice } from '@/media/library';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Chips } from '../Chips';
import { PlayerView } from '../player/PlayerView';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { showToast } from '../Toast';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

const FORMATS: { id: Format; title: string; detail: string }[] = [
  { id: '16:9', title: 'YouTube', detail: 'Wide, 16:9' },
  { id: '9:16', title: 'Reels and TikTok', detail: 'Tall, 9:16' },
  { id: '1:1', title: 'Square', detail: 'Feed posts, 1:1' },
];

/** Stage 8: pick where it posts and how sharp, render, and save the files. */
export function ExportStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const credits = useApp((s) => s.credits);
  const plan = useApp((s) => s.plan);
  const [saving, setSaving] = useState<Format | null>(null);
  const status = stageStatus(project, 'export');
  const state = project.exportState;
  const working = project.job?.stage === 'export';
  const onDevice = canExport();
  const live = project.pipeline === 'live';
  const cost = exportCost(project, plan === 'Premium');
  const editable = !state.done && !project.job && project.final.locked;

  const toggle = (format: Format) => {
    haptic.select();
    const next = state.formats.includes(format) ? state.formats.filter((f) => f !== format) : [...state.formats, format];
    apply(project.id, (p) => setExportFormats(p, FORMATS.map((f) => f.id).filter((f) => next.includes(f))));
  };

  const start = async () => {
    const outcome = await runExport(project.id);
    if (outcome === 'needCredits') router.push('/paywall');
    if (outcome === 'done') haptic.success();
  };

  const save = async (file: NonNullable<typeof state.files>[number]) => {
    setSaving(file.format);
    try {
      const blob = await mediaBlob(file.mediaId);
      if (!blob) throw new Error('missing');
      const how = await saveToDevice(blob, exportFileName(project.title, file.format, file.extension));
      if (how === 'downloaded') showToast('Saved to your downloads');
    } catch {
      showToast('That file is no longer on this device. Export again to get it back.');
    }
    setSaving(null);
  };

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
          <WrappedNote text="Exported. Tap Export on the slate to render it again with different settings." />
        ) : status === 'locked' ? null : (
          <>
            <Button label={`Export, ${cost} ${cost === 1 ? 'credit' : 'credits'}`} disabled={state.formats.length === 0} onPress={() => void start()} />
            <T v="caption" c="ash" style={styles.center}>
              {`You have ${credits} ${credits === 1 ? 'credit' : 'credits'}.${onDevice ? ' It renders on this device in about the length of the song per format.' : ''}`}
            </T>
          </>
        )
      }>
      <PlayerView project={project} effects label={state.done ? 'Final, exported' : 'Final edit'} />

      {state.done ? (
        <View style={stageStyles.block}>
          <SectionTitle detail={state.files?.length ? 'Tap one to save it or send it straight to an app.' : undefined}>Your video</SectionTitle>
          {state.files?.length ? (
            state.files.map((file) => {
              const dims = exportDimensions(file.format);
              return (
                <Press key={file.format} onPress={() => void save(file)} disabled={saving !== null} scaleTo={0.99} style={styles.file} accessibilityLabel={`Save the ${formatName(file.format)} video`}>
                  <Download size={20} color={color.chalk} />
                  <View style={stageStyles.flex}>
                    <T v="callout">{FORMATS.find((f) => f.id === file.format)?.title ?? file.format}</T>
                    <T v="caption" c="smoke">{`${dims.width} x ${dims.height}, ${file.extension.toUpperCase()}`}</T>
                  </View>
                  <T v="callout" c="smoke">
                    {saving === file.format ? 'Saving' : 'Save'}
                  </T>
                </Press>
              );
            })
          ) : (
            <T v="body" c="smoke">
              {project.isSample ? 'This sample was exported ahead of time, so there is no file to save. Start your own video to get one.' : 'The finished files download from the web app.'}
            </T>
          )}
        </View>
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
                      {onDevice ? `${f.detail}, ${exportDimensions(f.id).width} x ${exportDimensions(f.id).height}` : f.detail}
                    </T>
                  </View>
                  <View style={[styles.check, on && styles.checkOn]}>{on ? <Check size={14} color={color.stage} /> : null}</View>
                </Press>
              );
            })}
          </View>

          <View style={stageStyles.block}>
            <SectionTitle detail={live ? 'The 4K finish reruns every shot at full size on the studio server.' : 'The 4K finish runs on the studio server once it is connected.'}>How sharp</SectionTitle>
            <Chips<Resolution>
              label="Resolution"
              value={state.resolution}
              disabled={!editable || !live}
              onChange={(resolution) => apply(project.id, (p) => setResolution(p, resolution))}
              options={[
                { value: '1080p', label: 'HD', detail: 'Included' },
                { value: '4K', label: '4K finish', detail: plan === 'Premium' ? 'Included' : '+1 credit' },
              ]}
            />
          </View>
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
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: 64,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
});
