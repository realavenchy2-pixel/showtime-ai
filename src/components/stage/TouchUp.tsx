import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ArrowUp, ChevronDown, ChevronRight, Download, Film, Images, Music, Scissors, Video } from '@/components/icons';
import { formatName } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { sceneName, scenesOf } from '@/engine/production';
import { useApp } from '@/engine/store';
import { makeFullSong, newBackground, reshootScene, touchUpBroll, touchUpEdit, touchUpOptions } from '@/engine/touchup';
import type { Format, Project, Version } from '@/engine/types';
import { partTitle, versionTitle } from '@/engine/versions';
import { exportFileName } from '@/lib/exportRun';
import { haptic } from '@/lib/haptics';
import { makeLocations, sendToDirector } from '@/live/session';
import { mediaBlob, saveToDevice } from '@/media/library';
import { color, radius, space, type } from '@/theme/tokens';

import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { showToast } from '../Toast';
import { stageStyles } from './StageChrome';

const FORMAT_TITLE: Record<Format, string> = { '16:9': 'YouTube', '9:16': 'Reels and TikTok', '1:1': 'Square', '4:5': 'Instagram feed' };

type Pick = 'background' | 'reshoot' | null;

/**
 * Come back any time and change one thing. Each option opens only what it needs; everything
 * else stays as it is, so only what changed renders again. The next export is the next version.
 */
export function TouchUpCard({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [picking, setPicking] = useState<Pick>(null);
  const [text, setText] = useState('');
  const options = touchUpOptions(project);
  const scenes = scenesOf(project);
  const song = project.song;
  const go = (stage: string) => router.push(`/project/${project.id}/${stage}`);

  const run = (fn: (p: Project) => Project, stage: string) => {
    haptic.select();
    apply(project.id, fn);
    go(stage);
  };

  const full = () => {
    haptic.select();
    apply(project.id, (p) => makeFullSong(p));
    // New scenes need their backgrounds made (real images when the studio server is connected).
    makeLocations(project.id);
    go('looks');
  };

  const tell = () => {
    const said = text.trim();
    if (!said) return;
    haptic.select();
    sendToDirector(project.id, said);
    setText('');
    router.push(`/project/${project.id}`);
  };

  const rows: { key: string; icon: typeof Scissors; title: string; detail: string; on: boolean; onPress: () => void; open?: boolean }[] = [
    { key: 'edit', icon: Scissors, title: 'Change the edit', detail: 'Effects, how hard they hit, the camera look. Nothing gets switched again.', on: options.edit, onPress: () => run(touchUpEdit, 'edit') },
    { key: 'broll', icon: Film, title: 'Swap or add b-roll', detail: 'Keep the clips you like, drop the rest, describe new ones. Only new ones get made.', on: options.broll, onPress: () => run(touchUpBroll, 'broll') },
    {
      key: 'background',
      icon: Images,
      title: 'New background for a scene',
      detail: 'Pick another or type a change. Only that scene goes through the switch again.',
      on: options.background,
      onPress: () => setPicking((x) => (x === 'background' ? null : 'background')),
      open: picking === 'background',
    },
    {
      key: 'reshoot',
      icon: Video,
      title: 'Reshoot a scene',
      detail: 'Back to the camera with the same set guide. The editor picks the best take, old or new.',
      on: options.reshoot,
      onPress: () => setPicking((x) => (x === 'reshoot' ? null : 'reshoot')),
      open: picking === 'reshoot',
    },
    {
      key: 'full',
      icon: Music,
      title: 'Make it the full song',
      detail: song ? `${formatTime(song.durationSec)} in all. Your ${scenes.length} ${scenes.length === 1 ? 'scene stays' : 'scenes stay'} as shot; the rest of the song gets new scenes.` : '',
      on: options.full,
      onPress: full,
    },
  ];

  return (
    <View style={stageStyles.block}>
      <SectionTitle detail={`Change one thing any time. What you don't touch stays as it is, so only what changed renders again. Your next export is v${options.nextVersion}.`}>Touch it up</SectionTitle>
      {rows
        .filter((r) => r.on)
        .map((r) => {
          const Icon = r.icon;
          const expands = r.key === 'background' || r.key === 'reshoot';
          return (
            <View key={r.key} style={styles.option}>
              <Press onPress={r.onPress} scaleTo={0.99} style={styles.optionHead} accessibilityLabel={`${r.title}. ${r.detail}`} accessibilityState={expands ? { expanded: !!r.open } : undefined}>
                <Icon size={20} color={color.chalk} />
                <View style={stageStyles.flex}>
                  <T v="callout">{r.title}</T>
                  <T v="caption" c="smoke">
                    {r.detail}
                  </T>
                </View>
                {expands && r.open ? <ChevronDown size={18} color={color.smoke} /> : <ChevronRight size={18} color={color.smoke} />}
              </Press>
              {r.open ? (
                <View style={styles.scenes} accessibilityRole="radiogroup" accessibilityLabel="Which scene">
                  {scenes.map((scene) => (
                    <Press
                      key={scene.section.id}
                      onPress={() => (r.key === 'background' ? run((p) => newBackground(p, scene.index), 'looks') : run((p) => reshootScene(p, scene.index), 'shoot'))}
                      style={styles.scene}
                      accessibilityLabel={`${r.key === 'background' ? 'New background for' : 'Reshoot'} ${sceneName(scene)}`}>
                      <T v="caption" c="chalk" numberOfLines={1}>
                        {sceneName(scene)}
                      </T>
                    </Press>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

      <View style={styles.tellRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={tell}
          placeholder="Or tell the director: reshoot scene 2, make it rain"
          placeholderTextColor={color.ash}
          style={styles.input}
          returnKeyType="send"
          accessibilityLabel="Tell the director what to change"
        />
        <Press onPress={tell} disabled={!text.trim()} style={[styles.send, !text.trim() && styles.sendOff]} accessibilityLabel="Send to the director">
          <ArrowUp size={20} color={color.stage} />
        </Press>
      </View>
    </View>
  );
}

/** One version's files, each saved with the version in its name so nothing overwrites anything. */
export function VersionFiles({ project, version }: { project: Project; version: Version }) {
  const [saving, setSaving] = useState<Format | null>(null);
  const save = async (file: NonNullable<Version['files']>[number]) => {
    setSaving(file.format);
    try {
      const blob = await mediaBlob(file.mediaId);
      if (!blob) throw new Error('missing');
      const how = await saveToDevice(blob, exportFileName(project.title, file.format, file.extension, version));
      if (how === 'downloaded') showToast('Saved to your downloads');
    } catch {
      showToast('That file is no longer on this device. Export again to get it back.');
    }
    setSaving(null);
  };
  if (!version.files?.length) {
    return (
      <T v="caption" c="smoke">
        {project.isSample ? 'This sample was exported ahead of time, so there is no file to save.' : `${version.formats.map(formatName).join(', ')}. The files download from the web app.`}
      </T>
    );
  }
  return (
    <>
      {version.files.map((file) => (
        <Press key={file.format} onPress={() => void save(file)} disabled={saving !== null} scaleTo={0.99} style={styles.file} accessibilityLabel={`Save ${versionTitle(version)}, ${FORMAT_TITLE[file.format]}`}>
          <Download size={20} color={color.chalk} />
          <View style={stageStyles.flex}>
            <T v="callout">{FORMAT_TITLE[file.format]}</T>
            <T v="caption" c="smoke" numberOfLines={1}>
              {exportFileName(project.title, file.format, file.extension, version)}
            </T>
          </View>
          <T v="callout" c="smoke">
            {saving === file.format ? 'Saving' : 'Save'}
          </T>
        </Press>
      ))}
    </>
  );
}

function when(at: number): string {
  try {
    return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/** Every version, newest first. The latest is shown above it, so this is the earlier ones. */
export function VersionsList({ project, skipLatest }: { project: Project; skipLatest?: boolean }) {
  const all = (project.versions ?? []).slice().reverse();
  const list = skipLatest ? all.slice(1) : all;
  const [open, setOpen] = useState<string | null>(null);
  if (list.length === 0) return null;
  return (
    <View style={stageStyles.block}>
      <SectionTitle detail="Every export is kept, numbered in order. Nothing overwrites anything.">{skipLatest ? 'Earlier versions' : 'Versions'}</SectionTitle>
      {list.map((v) => (
        <View key={v.id} style={styles.version}>
          <Press onPress={() => setOpen((x) => (x === v.id ? null : v.id))} scaleTo={0.99} style={styles.versionHead} accessibilityLabel={`${versionTitle(v)}, ${when(v.at)}`} accessibilityState={{ expanded: open === v.id }}>
            <View style={stageStyles.flex}>
              <T v="callout">{versionTitle(v)}</T>
              <T v="caption" c="smoke" numberOfLines={open === v.id ? undefined : 1}>
                {[when(v.at), v.resolution, v.changes.length ? v.changes.join('. ') : v.n === 1 ? 'The first cut' : ''].filter(Boolean).join(' · ')}
              </T>
            </View>
            {open === v.id ? <ChevronDown size={18} color={color.smoke} /> : <ChevronRight size={18} color={color.smoke} />}
          </Press>
          {open === v.id ? <VersionFiles project={project} version={v} /> : null}
        </View>
      ))}
    </View>
  );
}

/** "v2 · Full song" for the export screen title. */
export function latestTitle(v: Version): string {
  return `Your video · v${v.n} · ${partTitle(v)}`;
}

const styles = StyleSheet.create({
  option: {
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  optionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    minHeight: 64,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
  scenes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
    paddingHorizontal: space.l,
    paddingBottom: space.l,
  },
  scene: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  tellRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  input: {
    ...type.body,
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    color: color.chalk,
    minHeight: 48,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.chalk,
  },
  sendOff: {
    opacity: 0.35,
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
  version: {
    gap: space.s,
  },
  versionHead: {
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
