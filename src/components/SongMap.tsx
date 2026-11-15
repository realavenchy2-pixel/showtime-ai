import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Pause, Play, Plus, X } from '@/components/icons';
import { formatTime } from '@/engine/director';
import type { Section, SectionKind, Song } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { useSongPreview } from '@/media/preview';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { T } from './T';

const KINDS: SectionKind[] = ['verse', 'hook', 'intro', 'bridge', 'outro'];
const KIND_WORD: Record<SectionKind, string> = { verse: 'Verse', hook: 'Hook', intro: 'Intro', bridge: 'Bridge', outro: 'Outro' };

/** Names parts by kind, counting the verses. */
export function relabel(sections: Section[]): Section[] {
  let verse = 0;
  return sections.map((s) => ({ ...s, label: s.kind === 'verse' ? `Verse ${++verse}` : KIND_WORD[s.kind] }));
}

/** One part covering the whole song: where every imported song starts before the artist marks it. */
export function wholeSong(durationSec: number): Section[] {
  return [{ id: 'part-1', kind: 'verse', label: 'Verse 1', start: 0, end: Math.round(durationSec * 1000) / 1000 }];
}

function wavePath(peaks: number[], height: number): string {
  const w = 1000 / peaks.length;
  let d = '';
  peaks.forEach((p, i) => {
    const h = Math.max(1.5, p * height);
    d += `M${(i * w).toFixed(2)} ${((height - h) / 2).toFixed(2)}h${(w * 0.62).toFixed(2)}v${h.toFixed(2)}h${(-w * 0.62).toFixed(2)}z`;
  });
  return d;
}

let partCount = 0;
const newId = () => `part-${Date.now().toString(36)}${(partCount++).toString(36)}`;

/** Snaps a moment to the nearest beat, so a part starts where the music does. */
function onBeat(song: Song, t: number): number {
  const beat = 60 / song.bpm;
  const snapped = song.downbeatSec + Math.round((t - song.downbeatSec) / beat) * beat;
  return Math.round(Math.max(0, Math.min(song.durationSec, snapped)) * 1000) / 1000;
}

/**
 * The artist maps their own song: play it, tap "New part here" where each part starts,
 * and say what each part is. No guessing where the hook is.
 */
export function SongMap({ song, onChange }: { song: Song; onChange: (sections: Section[]) => void }) {
  const preview = useSongPreview(song);
  const [width, setWidth] = useState(0);
  const sections = song.sections;
  const duration = Math.max(0.001, song.durationSec);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / duration) * 100))}%` as const;
  const time = preview.time;
  const current = sections.find((s) => time >= s.start && time < s.end) ?? sections[sections.length - 1];

  const toggle = () => {
    haptic.select();
    if (preview.playing) preview.pause();
    else preview.play(time >= duration - 0.2 ? 0 : undefined);
  };

  const mark = () => {
    const at = onBeat(song, time);
    const host = sections.find((s) => at > s.start + 1 && at < s.end - 1);
    if (!host) return;
    haptic.confirm();
    // The new part takes the other kind: a hook after a verse, a verse after anything else.
    const kind: SectionKind = host.kind === 'verse' ? 'hook' : 'verse';
    const next = sections.flatMap((s) => (s.id === host.id ? [{ ...s, end: at }, { id: newId(), kind, label: '', start: at, end: s.end }] : [s]));
    onChange(relabel(next));
  };

  const cycle = (id: string) => {
    haptic.select();
    onChange(relabel(sections.map((s) => (s.id === id ? { ...s, kind: KINDS[(KINDS.indexOf(s.kind) + 1) % KINDS.length] } : s))));
  };

  const remove = (id: string) => {
    const i = sections.findIndex((s) => s.id === id);
    if (i <= 0) return;
    haptic.select();
    // The part folds into the one before it.
    const next = sections.filter((s) => s.id !== id).map((s, k) => (k === i - 1 ? { ...s, end: sections[i].end } : s));
    onChange(relabel(next));
  };

  const canMark = sections.some((s) => time > s.start + 1 && time < s.end - 1);

  return (
    <View style={styles.wrap}>
      <View
        style={styles.strip}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => preview.seek((e.nativeEvent.locationX / Math.max(1, width)) * duration)}
        onResponderMove={(e) => preview.seek((e.nativeEvent.locationX / Math.max(1, width)) * duration)}
        accessibilityRole="adjustable"
        accessibilityLabel={`Song, ${formatTime(time)} of ${formatTime(duration)}. Drag to move through it.`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => preview.seek(Math.max(0, Math.min(duration, time + (e.nativeEvent.actionName === 'increment' ? 5 : -5))))}>
        {sections.map((s) => (
          <View key={s.id} pointerEvents="none" style={[styles.part, { left: pct(s.start), width: pct(s.end - s.start) }, s.kind === 'hook' && styles.partHook]} />
        ))}
        {song.peaks?.length ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 1000 48" preserveAspectRatio="none">
              <Path d={wavePath(song.peaks, 48)} fill={color.chalk} opacity={0.5} />
            </Svg>
          </View>
        ) : null}
        {sections.slice(1).map((s) => (
          <View key={`edge-${s.id}`} pointerEvents="none" style={[styles.edge, { left: pct(s.start) }]} />
        ))}
        <View pointerEvents="none" style={[styles.head, { left: pct(time) }]} />
      </View>

      <View style={styles.transport}>
        <Press onPress={toggle} style={styles.play} accessibilityLabel={preview.playing ? 'Pause the song' : 'Play the song'} disabled={!preview.ready && !preview.playing}>
          {preview.playing ? <Pause size={22} color={color.stage} /> : <Play size={22} color={color.stage} />}
        </Press>
        <View style={styles.flex}>
          <T v="callout" style={styles.tabular}>{`${formatTime(time)} / ${formatTime(duration)}`}</T>
          <T v="caption" c="smoke" numberOfLines={1}>
            {preview.ready ? (current ? `Now: ${current.label}` : '') : 'Loading the song'}
          </T>
        </View>
        <Press onPress={mark} disabled={!canMark} style={[styles.mark, !canMark && styles.markOff]} accessibilityLabel="New part here" accessibilityHint="Starts a new part of the song at this moment">
          <Plus size={18} color={canMark ? color.chalk : color.ash} />
          <T v="callout" c={canMark ? 'chalk' : 'ash'}>
            New part here
          </T>
        </Press>
      </View>

      <View style={styles.list}>
        {sections.map((s, i) => {
          const here = current?.id === s.id;
          return (
            <View key={s.id} style={[styles.row, here && styles.rowHere]}>
              <Press onPress={() => preview.play(s.start)} style={styles.rowPlay} accessibilityLabel={`Play from ${s.label}, ${formatTime(s.start)}`}>
                <Play size={16} color={color.chalk} />
                <T v="caption" c="smoke" style={styles.tabular}>
                  {formatTime(s.start)}
                </T>
              </Press>
              <Press onPress={() => cycle(s.id)} style={[styles.kind, s.kind === 'hook' && styles.kindHook]} accessibilityLabel={`${s.label}. Tap to change what this part is.`}>
                <T v="callout" style={{ color: s.kind === 'hook' ? color.stage : color.chalk }}>
                  {s.label}
                </T>
              </Press>
              <T v="caption" c="ash" style={styles.flex} numberOfLines={1}>
                {formatTime(s.end - s.start)}
              </T>
              {i > 0 ? (
                <Press onPress={() => remove(s.id)} style={styles.remove} accessibilityLabel={`Remove the start of ${s.label}`} hitSlop={6}>
                  <X size={16} color={color.smoke} />
                </Press>
              ) : (
                <View style={styles.remove} />
              )}
            </View>
          );
        })}
      </View>
      <T v="caption" c="ash">
        {sections.length === 1
          ? 'Play your song and tap New part here when the hook comes in, then again when it ends. Tap a part to say what it is.'
          : 'Tap a part to change what it is. Hooks get the fastest cuts and the hardest effects.'}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.m,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  strip: {
    height: 56,
    borderRadius: radius.s,
    overflow: 'hidden',
    backgroundColor: color.flat,
  },
  part: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  partHook: {
    backgroundColor: color.accentSoft,
  },
  edge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: color.accent,
  },
  head: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: color.chalk,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  play: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.chalk,
  },
  markOff: {
    borderColor: color.hairlineStrong,
  },
  list: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    minHeight: 48,
    paddingHorizontal: space.xs,
    borderRadius: radius.s,
  },
  rowHere: {
    backgroundColor: color.flat,
  },
  rowPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space.s,
  },
  kind: {
    minHeight: 36,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    justifyContent: 'center',
  },
  kindHook: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  remove: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
