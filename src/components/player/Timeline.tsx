import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { videoRange } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import type { Project } from '@/engine/types';
import { color, space } from '@/theme/tokens';

import { T } from '../T';

interface Props {
  project: Project;
  time: number;
  onSeek?: (time: number) => void;
  /** Loudness peaks, 0 to 1. Without them the strip shows sections only. */
  peaks?: number[];
}

function wavePath(peaks: number[], height: number): string {
  const w = 1000 / peaks.length;
  let d = '';
  peaks.forEach((p, i) => {
    const h = Math.max(1.5, p * height);
    const x = i * w;
    d += `M${x.toFixed(2)} ${((height - h) / 2).toFixed(2)}h${(w * 0.62).toFixed(2)}v${h.toFixed(2)}h${(-w * 0.62).toFixed(2)}z`;
  });
  return d;
}

/** The song laid out left to right: its waveform, sections, every cut, and where the playhead is. Drag to scrub. */
export function Timeline({ project, time, onSeek, peaks }: Props) {
  const [width, setWidth] = useState(0);
  const song = project.song;
  if (!song) return null;
  // A snippet fills the strip; the full song does when there is no snippet.
  const range = videoRange(project);
  const origin = range.start;
  const duration = Math.max(0.001, range.end - range.start);
  const at = (x: number) => origin + Math.max(0, Math.min(duration, (x / Math.max(1, width)) * duration));
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - origin) / duration) * 100))}%` as const;
  const span = (from: number, to: number) => `${Math.max(0, ((Math.min(to, range.end) - Math.max(from, origin)) / duration) * 100)}%` as const;
  const shownPeaks = peaks?.length && song.durationSec > 0 ? peaks.slice(Math.floor((range.start / song.durationSec) * peaks.length), Math.ceil((range.end / song.durationSec) * peaks.length)) : peaks;
  const sections = song.sections.filter((s) => s.end > range.start + 0.01 && s.start < range.end - 0.01);
  const cuts = project.cut.segments.slice(1).map((s) => s.start);
  const cutaways = project.broll.ideas.filter((i) => i.keep && i.at !== undefined);

  return (
    <View style={styles.wrap}>
      <View
        style={styles.strip}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !!onSeek}
        onMoveShouldSetResponder={() => !!onSeek}
        onResponderGrant={(e) => onSeek?.(at(e.nativeEvent.locationX))}
        onResponderMove={(e) => onSeek?.(at(e.nativeEvent.locationX))}
        accessibilityRole="adjustable"
        accessibilityLabel={`Timeline, ${formatTime(time - origin)} of ${formatTime(duration)}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onSeek?.(Math.max(range.start, Math.min(range.end, time + (e.nativeEvent.actionName === 'increment' ? 5 : -5))))}>
        {sections.map((s) => (
          <View
            key={s.id}
            pointerEvents="none"
            style={[styles.section, { left: pct(s.start), width: span(s.start, s.end) }, s.kind === 'hook' && styles.hook, (s.kind === 'intro' || s.kind === 'outro') && styles.edge]}
          />
        ))}
        {shownPeaks?.length ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 1000 30" preserveAspectRatio="none">
              <Path d={wavePath(shownPeaks, 30)} fill={color.chalk} opacity={0.34} />
            </Svg>
          </View>
        ) : null}
        {cuts.map((t, i) => (
          <View key={`${t}-${i}`} pointerEvents="none" style={[styles.cut, { left: pct(t) }]} />
        ))}
        {cutaways.map((i) => (
          <View key={i.id} pointerEvents="none" style={[styles.cutaway, { left: pct(i.at!), width: span(i.at!, i.at! + i.durationSec) }]} />
        ))}
        <View pointerEvents="none" style={[styles.played, { width: pct(time) }]} />
        <View pointerEvents="none" style={[styles.playhead, { left: pct(time) }]} />
      </View>
      <View style={styles.labels} pointerEvents="none">
        {sections.map((s) => (
          <View key={s.id} style={{ flex: Math.min(s.end, range.end) - Math.max(s.start, range.start) }}>
            {(Math.min(s.end, range.end) - Math.max(s.start, range.start)) / duration > 0.09 ? (
              <T v="micro" c={time >= s.start && time < s.end ? 'chalk' : 'ash'} numberOfLines={1}>
                {s.label}
              </T>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs,
  },
  strip: {
    height: 36,
    borderRadius: 6,
    backgroundColor: color.curtain,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  section: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: color.flat,
    borderRightWidth: 1,
    borderRightColor: color.stage,
  },
  hook: {
    backgroundColor: color.rig,
  },
  edge: {
    backgroundColor: color.curtain,
  },
  cut: {
    position: 'absolute',
    top: 0,
    height: 6,
    width: 1,
    backgroundColor: color.smoke,
  },
  cutaway: {
    position: 'absolute',
    bottom: 0,
    height: 4,
    backgroundColor: color.chalk,
    borderRadius: 2,
  },
  played: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(242, 240, 236, 0.10)',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: color.chalk,
  },
  labels: {
    flexDirection: 'row',
  },
});
