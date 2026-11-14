import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Upload, X } from '@/components/icons';
import { addTake, coverage, finishShooting, removeClip, removeTake } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { useApp } from '@/engine/store';
import type { Clip, Project, Take } from '@/engine/types';
import { addImported } from '@/lib/footage';
import { haptic } from '@/lib/haptics';
import { pickVideos } from '@/media/pick';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Frame } from '../Frame';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { StageGlyph } from '../StageGlyph';
import { T } from '../T';
import { showToast } from '../Toast';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

/** Stage 2: every take and clip the director has to work with. */
export function ShootStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [importing, setImporting] = useState<string | null>(null);
  const song = project.song;
  const locked = project.shootLocked;
  const covered = coverage(project);
  const n = project.takes.length;

  const upload = async () => {
    if (importing) return;
    setImporting('Opening your library');
    try {
      const { videos, failed } = await pickVideos(song, (done, total) => setImporting(total ? `Lining up clip ${Math.min(total, done + 1)} of ${total} with the song` : null));
      for (const v of videos) apply(project.id, (p) => addImported(p, v));
      if (videos.length) haptic.success();
      if (failed.length) showToast(`${failed.length === 1 ? `"${failed[0]}"` : `${failed.length} clips`} could not be read. MP4 and MOV work best.`);
    } catch {
      showToast('Those clips could not be added.');
    } finally {
      setImporting(null);
    }
  };

  const record = () => router.push(`/project/${project.id}/record`);
  const wrap = () => {
    haptic.confirm();
    apply(project.id, finishShooting);
    router.replace(`/project/${project.id}`);
  };

  return (
    <StageScreen
      project={project}
      stage="shoot"
      footer={
        project.job ? (
          <JobBar project={project} />
        ) : locked ? (
          <WrappedNote text="The shoot is wrapped. Tap Shoot on the slate to add more takes." />
        ) : n >= 2 ? (
          <>
            <Button label="That's a wrap, cut it" onPress={wrap} />
            <Button label="Record another take" variant="quiet" onPress={record} />
          </>
        ) : (
          <>
            <Button label={n === 0 ? 'Start recording' : 'Record take 2'} onPress={record} />
            {n > 0 ? <Button label="That's a wrap, cut it" variant="quiet" onPress={wrap} /> : null}
          </>
        )
      }>
      <View style={stageStyles.block}>
        <SectionTitle detail={song ? coverageLine(n, covered, song.durationSec) : undefined}>Takes</SectionTitle>
        {project.takes.map((t) => (
          <TakeRow key={t.id} take={t} locked={locked} onRemove={() => apply(project.id, (p) => removeTake(p, t.id))} />
        ))}
        {n === 0 ? (
          <View style={styles.empty}>
            <T v="body" c="smoke">
              Nothing shot yet. Record with the song playing, or bring in clips you already filmed.
            </T>
          </View>
        ) : null}
        {!locked ? (
          <Press onPress={upload} scaleTo={0.99} style={styles.upload} accessibilityLabel="Upload clips">
            {importing ? <StageGlyph status="working" size={20} /> : <Upload size={20} color={color.chalk} />}
            <View style={styles.flex}>
              <T v="callout">{importing ?? 'Upload clips'}</T>
              <T v="caption" c="smoke">
                {importing ? 'Keep this screen open' : 'Any length. I find where each one sits in the song and chop it into shots.'}
              </T>
            </View>
          </Press>
        ) : null}
      </View>

      {project.clips.length ? (
        <View style={stageStyles.block}>
          <SectionTitle detail="I couldn't hear the song in these, so they are not lined up. I use them as cutaways.">Cutaway clips</SectionTitle>
          {project.clips.map((c) => (
            <ClipRow
              key={c.id}
              clip={c}
              locked={locked}
              onRemove={() => apply(project.id, (p) => removeClip(p, c.id))}
              onUseAsTake={() =>
                apply(project.id, (p) =>
                  removeClip(
                    addTake(p, { source: 'upload', label: c.label, fromSec: 0, durationSec: c.durationSec, fps: c.fps, width: c.width, height: c.height, mediaId: c.mediaId, thumb: c.thumb, sync: 'clock' }),
                    c.id,
                  ),
                )
              }
            />
          ))}
        </View>
      ) : null}
    </StageScreen>
  );
}

function coverageLine(takes: number, covered: number, duration: number): string {
  if (takes === 0) return 'One full pass is enough to start. Every extra take is another angle to cut to.';
  if (covered > 0.97) return 'Your takes cover the whole song.';
  return `Your takes cover ${formatTime(covered * duration)} of ${formatTime(duration)}. I carry the rest with b-roll unless you record more.`;
}

function TakeRow({ take, locked, onRemove }: { take: Take; locked: boolean; onRemove: () => void }) {
  const how = take.sync === 'audio' ? 'lined up by ear' : 'lined up by the clock';
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        <Frame kind="room" thumb={take.thumb} relit={false} rounded={false} />
      </View>
      <View style={styles.flex}>
        <T v="callout" numberOfLines={1}>
          {take.label}
        </T>
        <T v="caption" c="smoke" numberOfLines={1}>{`${formatTime(take.start)} to ${formatTime(take.end)}, ${how}`}</T>
        {take.flag ? (
          <T v="caption" c="tungsten" numberOfLines={2}>
            {take.flag}
          </T>
        ) : null}
      </View>
      {!locked ? (
        <Press onPress={onRemove} style={styles.remove} accessibilityLabel={`Remove ${take.label}`}>
          <X size={18} color={color.smoke} />
        </Press>
      ) : null}
    </View>
  );
}

function ClipRow({ clip, locked, onRemove, onUseAsTake }: { clip: Clip; locked: boolean; onRemove: () => void; onUseAsTake: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.thumb}>
        <Frame kind="room" thumb={clip.thumb} relit={false} rounded={false} />
      </View>
      <View style={styles.flex}>
        <T v="callout" numberOfLines={1}>
          {clip.label}
        </T>
        <T v="caption" c="smoke">{`${formatTime(clip.durationSec)} long`}</T>
        {!locked ? (
          <Press onPress={onUseAsTake} style={styles.link} accessibilityLabel={`Use ${clip.label} as a take from the start of the song`}>
            <T v="caption" c="chalk">
              It starts with the song: use it as a take
            </T>
          </Press>
        ) : null}
      </View>
      {!locked ? (
        <Press onPress={onRemove} style={styles.remove} accessibilityLabel={`Remove ${clip.label}`}>
          <X size={18} color={color.smoke} />
        </Press>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: 2,
  },
  empty: {
    paddingVertical: space.m,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.s,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  thumb: {
    width: 104,
    borderRadius: radius.s,
    overflow: 'hidden',
  },
  remove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    minHeight: 32,
    justifyContent: 'center',
  },
  upload: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairlineStrong,
  },
});
