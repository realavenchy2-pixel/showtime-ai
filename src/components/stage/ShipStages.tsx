import { router } from 'expo-router';
import { Check, Download, Pause, Play, Share2 } from '@/components/icons';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { exportCost, lockFinal, renderFinal, renderFormats, setResizeFormats, setResolution } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { fxPack } from '@/engine/fx';
import { isSkipped, stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { Format, Project, Resolution } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { previewFor } from '@/lib/preview';
import { color, radius, space, type } from '@/theme/tokens';

import { Button } from '../Button';
import { Frame } from '../Frame';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { showToast } from '../Toast';
import { JobBar, StageScreen, WatchHow, WrappedNote, stageStyles } from './StageChrome';

/** Fake playback so the preview feels like a player. */
function usePlayhead(duration: number) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setT((x) => (x + 0.25 >= duration ? 0 : x + 0.25)), 250);
    return () => clearInterval(timer);
  }, [playing, duration]);
  return { playing, t, toggle: () => setPlaying((p) => !p) };
}

function Player({ project, label }: { project: Project; label: string }) {
  const preview = previewFor(project);
  const duration = project.song?.durationSec ?? 0;
  const { playing, t, toggle } = usePlayhead(duration);
  return (
    <View style={stageStyles.block}>
      <Frame kind={preview.kind} relit behindText={preview.behindText} label={label}>
        <Press onPress={toggle} accessibilityLabel={playing ? 'Pause' : 'Play'} style={styles.playWrap}>
          <View style={styles.playBtn}>{playing ? <Pause size={24} color={color.stage} fill={color.stage} /> : <Play size={24} color={color.stage} fill={color.stage} />}</View>
        </Press>
      </Frame>
      <View style={styles.scrub}>
        <View style={styles.scrubTrack}>
          <View style={[styles.scrubFill, { width: `${duration ? (t / duration) * 100 : 0}%` }]} />
        </View>
        <T v="micro" c="smoke" style={styles.tabular}>{`${formatTime(t)} / ${formatTime(duration)}`}</T>
      </View>
    </View>
  );
}

export function FinalStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'final');
  const [notes, setNotes] = useState('');
  const working = project.job?.stage === 'final';
  const pack = fxPack(project.fx.pack);
  const kept = project.broll.ideas.filter((i) => i.status === 'approved').length;

  const rows: [string, string][] = [
    ['Audio', 'Your master track, every take synced to it'],
    ['Shots', `${project.shots.length} switched shots on the beat`],
    ['B-roll', isSkipped(project, 'broll') ? 'Skipped' : `${kept} ${kept === 1 ? 'clip' : 'clips'}`],
    ['Effects', pack ? `${pack.title} pack, ${project.fx.intensity.toLowerCase()}` : 'None'],
    ['Length', formatTime(project.song?.durationSec ?? 0)],
  ];

  return (
    <StageScreen
      project={project}
      stage="final"
      footer={
        working ? (
          <JobBar project={project} />
        ) : status === 'done' ? (
          <WrappedNote />
        ) : project.final.renders === 0 ? (
          <>
            <Button label="Render the final" onPress={() => apply(project.id, renderFinal)} />
            <WatchHow stage="final" />
          </>
        ) : (
          <Button label="Lock the edit" onPress={() => apply(project.id, lockFinal)} />
        )
      }>
      {project.final.renders > 0 ? <Player project={project} label={`Final, version ${project.final.renders}`} /> : <Frame kind={previewFor(project).kind} relit label="Not rendered yet" />}
      <View>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.summary}>
            <T v="callout" c="smoke" style={styles.key}>
              {k}
            </T>
            <T v="callout" style={stageStyles.flex}>
              {v}
            </T>
          </View>
        ))}
      </View>
      {project.final.renders > 0 && status !== 'done' ? (
        <View style={stageStyles.block}>
          <SectionTitle detail="Say what to change and render again. Notes go to your director.">Notes</SectionTitle>
          <TextInput
            nativeID="final-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Example: hold the hook shot a beat longer"
            placeholderTextColor={color.ash}
            multiline
            style={styles.notes}
            accessibilityLabel="Notes for the director"
            keyboardAppearance="dark"
          />
          <Button
            label="Render again with notes"
            variant="secondary"
            disabled={!notes.trim() || working}
            onPress={() => {
              apply(project.id, renderFinal);
              setNotes('');
            }}
          />
        </View>
      ) : null}
    </StageScreen>
  );
}

const FORMATS: { id: Format; title: string; detail: string }[] = [
  { id: '16:9', title: 'YouTube', detail: '16:9, the official video' },
  { id: '9:16', title: 'Reels and TikTok', detail: '9:16, full screen on phones' },
  { id: '1:1', title: 'Square', detail: '1:1, for feed posts' },
];

export function ResizeStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const status = stageStatus(project, 'resize');
  const preview = previewFor(project);
  const chosen = project.resize.formats;
  const working = project.job?.stage === 'resize';

  return (
    <StageScreen
      project={project}
      stage="resize"
      footer={
        working ? (
          <JobBar project={project} />
        ) : status === 'done' ? (
          <WrappedNote />
        ) : (
          <Button
            label={chosen.length ? `Render ${chosen.length} ${chosen.length === 1 ? 'format' : 'formats'}` : 'Pick a format'}
            disabled={!chosen.length}
            onPress={() => apply(project.id, renderFormats)}
          />
        )
      }>
      <T v="body" c="smoke">
        Every format is rendered from the same edit, so lyrics and effects sit right in each frame. Nothing gets cropped off.
      </T>
      <View style={styles.formatRow}>
        {FORMATS.map((f) => {
          const on = chosen.includes(f.id);
          return (
            <Press
              key={f.id}
              disabled={status === 'done' || working}
              onPress={() => {
                haptic.select();
                apply(project.id, (p) => setResizeFormats(p, on ? chosen.filter((x) => x !== f.id) : [...chosen, f.id]));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${f.title}, ${f.detail}`}
              style={[styles.formatCard, on && styles.formatOn]}>
              <View style={styles.formatArt}>
                <Frame kind={preview.kind} relit behindText={preview.behindText} format={f.id} style={styles.formatFrame} />
              </View>
              <View style={stageStyles.row}>
                <T v="callout" style={stageStyles.flex}>
                  {f.title}
                </T>
                {on ? <Check size={18} color={color.chalk} /> : null}
              </View>
              <T v="caption" c="smoke">
                {f.detail}
              </T>
            </Press>
          );
        })}
      </View>
    </StageScreen>
  );
}

export function ExportStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const credits = useApp((s) => s.credits);
  const plan = useApp((s) => s.plan);
  const startExport = useApp((s) => s.exportVideo);
  const status = stageStatus(project, 'export');
  const working = project.job?.stage === 'export';
  const res = project.exportState.resolution;
  const fourKIncluded = plan === 'Premium';
  const cost = exportCost(project, fourKIncluded);
  const done = project.exportState.done;

  return (
    <StageScreen
      project={project}
      stage="export"
      footer={
        working ? (
          <JobBar project={project} />
        ) : done ? (
          <>
            <Button label="Download video" icon={Download} onPress={() => showToast('Downloads save to your phone in the app build.')} />
            <Button label="Share" variant="quiet" icon={Share2} onPress={() => showToast('Sharing opens the share sheet in the app build.')} />
          </>
        ) : (
          <Button
            label={`Export the video, ${cost} ${cost === 1 ? 'credit' : 'credits'}`}
            disabled={status === 'locked'}
            onPress={() => {
              const result = startExport(project.id);
              if (result === 'needCredits') {
                showToast(`You need ${cost} ${cost === 1 ? 'credit' : 'credits'} for this export.`);
                router.push('/paywall');
              }
            }}
          />
        )
      }>
      {done ? (
        <>
          <Player project={project} label="Final, exported" />
          <T v="title">{"That's a wrap."}</T>
          <T v="body" c="smoke">
            {`${project.title} is ready in ${project.resize.formats.length === 1 ? 'one format' : `${project.resize.formats.length} formats`}, at ${res}.`}
          </T>
        </>
      ) : (
        <>
          <T v="body" c="smoke">
            Everything is generated at 720p to keep it fast, then upscaled once at the end so faces stay sharp.
          </T>
          <View>
            {(['1080p', '4K'] as Resolution[]).map((r) => {
              const on = res === r;
              return (
                <Press
                  key={r}
                  disabled={working}
                  onPress={() => {
                    haptic.select();
                    apply(project.id, (p) => setResolution(p, r));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${r}, ${r === '4K' && !fourKIncluded ? 'one more credit' : 'included'}`}
                  style={styles.resRow}>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <View style={stageStyles.flex}>
                    <T v="label">{r}</T>
                    <T v="caption" c="smoke">
                      {r === '4K' ? 'Sharpest for YouTube and big screens' : 'Right for every phone'}
                    </T>
                  </View>
                  <T v="callout" c="smoke">
                    {r === '4K' && !fourKIncluded ? '+1 credit' : 'Included'}
                  </T>
                </Press>
              );
            })}
          </View>
          <T v="caption" c="ash">{`You have ${credits} ${credits === 1 ? 'credit' : 'credits'}. This export uses ${cost}.`}</T>
        </>
      )}
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  playWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  scrub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  scrubTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.rig,
    overflow: 'hidden',
  },
  scrubFill: {
    height: 3,
    backgroundColor: color.chalk,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  summary: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  key: {
    width: 76,
  },
  notes: {
    ...type.body,
    minHeight: 92,
    padding: space.l,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    color: color.chalk,
    textAlignVertical: 'top',
  },
  formatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.m,
  },
  formatCard: {
    flexBasis: '46%',
    flexGrow: 1,
    padding: space.m,
    gap: space.s,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  formatOn: {
    borderColor: color.chalk,
  },
  formatArt: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatFrame: {
    width: undefined,
    height: '100%',
    maxWidth: '100%',
  },
  resRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.l,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: color.smoke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: color.chalk,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: color.chalk,
  },
});
