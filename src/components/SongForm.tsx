import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { Check, Music, Pause, Play, Upload } from '@/components/icons';
import { formatTime } from '@/engine/director';
import { songFromImport, withScenes } from '@/engine/samples';
import { useApp } from '@/engine/store';
import type { Format, Song } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { pickSong } from '@/media/pick';
import { useSongPreview } from '@/media/preview';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { SectionTitle } from './Screen';
import { StageGlyph } from './StageGlyph';
import { T } from './T';
import { showToast } from './Toast';

export interface SongChoice {
  song?: Song;
  formats: Format[];
}

/** Stage 1: the track. Where it gets posted is picked at export. The video is laid out in scenes by time, not by verse and hook. */
export function SongForm({ value, onChange }: { value: SongChoice; onChange: (v: SongChoice) => void }) {
  const [busy, setBusy] = useState(false);
  const song = value.song;
  // Songs from earlier videos, newest first. No demo beats: this is for your own music.
  const projects = useApp((st) => st.projects);
  const order = useApp((st) => st.order);
  const recent = recentSongs(order.map((id) => projects[id]).filter(Boolean).map((pr) => pr.song));
  const imported = song?.source === 'import' ? song : undefined;


  const upload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickSong();
      if (!picked) return;
      if (picked.durationSec > 0 && picked.durationSec < 10) {
        showToast('That file is under 10 seconds. Pick the full song.');
        return;
      }
      const bpm = picked.bpm > 0 ? picked.bpm : 120;
      // No guessing at verses and hooks: the director lays the video out in scenes on the beat.
      onChange({ ...value, song: withScenes(songFromImport({ ...picked, bpm, sections: [] }, true)) });
      haptic.success();
    } catch {
      showToast('That file could not be read. Try an MP3, WAV or M4A.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.block}>
        <SectionTitle detail="Your master track. The finished video uses this audio, never the phone mic.">Song</SectionTitle>
        <Press onPress={upload} scaleTo={0.99} style={[styles.upload, imported && styles.selected]} accessibilityLabel={imported ? 'Upload a different song' : 'Upload a song'}>
          {busy ? <StageGlyph status="working" size={20} /> : <Upload size={20} color={color.chalk} />}
          <View style={styles.flex}>
            <T v="callout" numberOfLines={1}>
              {busy ? 'Reading your track' : imported ? imported.title : 'Upload a song'}
            </T>
            <T v="caption" c="smoke">
              {busy ? 'Listening to your track' : imported ? `${formatTime(imported.durationSec)} long. Tap to pick another.` : 'MP3, WAV or M4A'}
            </T>
          </View>
          {imported && !busy ? <Check size={20} color={color.chalk} /> : null}
        </Press>

        {recent.length ? (
          <>
            <T v="micro" c="ash" style={styles.or}>
              Recent songs
            </T>
            {recent.map((r) => {
              const selected = song?.source === 'import' && song.audioId === r.audioId;
              return (
                <Press
                  key={r.audioId ?? r.id}
                  onPress={() => {
                    haptic.select();
                    onChange({ ...value, song: withScenes({ ...r, sections: [] }, undefined) });
                  }}
                  scaleTo={0.99}
                  style={[styles.option, selected && styles.selected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${r.title}, ${formatTime(r.durationSec)}`}>
                  <Music size={20} color={selected ? color.chalk : color.smoke} />
                  <View style={styles.flex}>
                    <T v="callout" numberOfLines={1}>
                      {r.title}
                    </T>
                    <T v="caption" c="smoke">{`${formatTime(r.durationSec)} long`}</T>
                  </View>
                  {selected ? <Check size={20} color={color.chalk} /> : null}
                </Press>
              );
            })}
          </>
        ) : null}
      </View>

      {song ? (
        <View style={styles.mapped}>
          <Listen song={song} />
        </View>
      ) : null}

    </View>
  );
}

/** Play the track before going on: tap play, or tap or drag the bar to jump. Where the video starts is picked right before the first take. */
function Listen({ song }: { song: Song }) {
  const preview = useSongPreview(song);
  const duration = Math.max(0.001, song.durationSec);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | undefined>();
  const shown = drag ?? preview.time;
  const toggle = () => {
    haptic.select();
    if (preview.playing) preview.pause();
    else preview.play(preview.time >= duration - 0.2 ? 0 : undefined);
  };
  const timeAt = (e: GestureResponderEvent) => Math.max(0, Math.min(duration, (e.nativeEvent.locationX / Math.max(1, width)) * duration));
  const nudge = (by: number) => preview.seek(Math.max(0, Math.min(duration - 0.5, preview.time + by)));
  return (
    <View style={styles.listen}>
      <Press onPress={toggle} disabled={!preview.ready} style={[styles.play, !preview.ready && styles.playOff]} accessibilityLabel={preview.playing ? 'Pause the song' : 'Play the song'}>
        {preview.playing ? <Pause size={18} color={color.stage} /> : <Play size={18} color={color.stage} />}
      </Press>
      <View style={styles.flex}>
        <View
          style={styles.scrub}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => preview.ready}
          onMoveShouldSetResponder={() => preview.ready}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => setDrag(timeAt(e))}
          onResponderMove={(e) => setDrag(timeAt(e))}
          onResponderRelease={(e) => {
            preview.seek(timeAt(e));
            setDrag(undefined);
          }}
          onResponderTerminate={() => setDrag(undefined)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Song position"
          accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(shown), text: formatTime(shown) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 10 : -10)}>
          <View style={styles.track} pointerEvents="none">
            <View style={[styles.trackFill, { width: `${Math.min(100, (shown / duration) * 100)}%` }]} />
          </View>
          <View style={[styles.knob, { left: `${Math.min(100, (shown / duration) * 100)}%` }]} pointerEvents="none" />
        </View>
        <T v="caption" c="smoke" style={styles.tabular}>
          {`${formatTime(shown)} / ${formatTime(duration)}`}
        </T>
      </View>
    </View>
  );
}

export function songChoiceReady(v: SongChoice): v is Required<SongChoice> {
  return !!v.song && v.formats.length > 0;
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xl,
  },
  block: {
    gap: space.s,
  },
  flex: {
    flex: 1,
    gap: 2,
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
  mapped: {
    gap: space.s,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOff: {
    opacity: 0.4,
  },
  scrub: {
    height: 24,
    justifyContent: 'center',
  },
  knob: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    top: 5,
    borderRadius: 7,
    backgroundColor: color.chalk,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.flat,
    overflow: 'hidden',
  },
  trackFill: {
    height: 4,
    backgroundColor: color.chalk,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  link: {
    minHeight: 32,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  or: {
    marginTop: space.s,
  },
  option: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  selected: {
    borderStyle: 'solid',
    borderColor: color.chalk,
  },
  formats: {
    flexDirection: 'row',
    gap: space.m,
  },
  format: {
    flex: 1,
    minHeight: 112,
    padding: space.l,
    gap: 2,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  formatTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.s,
  },
  tapWrap: {
    gap: space.s,
  },
  tapRow: {
    flexDirection: 'row',
    gap: space.m,
    alignItems: 'stretch',
  },
  tapPad: {
    width: 120,
    height: 84,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapUse: {
    flex: 1,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapUseOff: {
    borderColor: color.hairline,
  },
});

function recentSongs(songs: (Song | undefined)[]): Song[] {
  const seen = new Set<string>();
  const out: Song[] = [];
  for (const sg of songs) {
    if (!sg || sg.source !== 'import' || !sg.audioId || seen.has(sg.audioId)) continue;
    seen.add(sg.audioId);
    out.push(sg);
  }
  return out.slice(0, 5);
}
