import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Song } from '@/engine/types';
import { color, radius } from '@/theme/tokens';

/**
 * The song's waveform with the part that becomes the video highlighted.
 * `window`: drag the whole snippet along the song. `trim`: drag either end to cut it off.
 */
export function RangeBar({
  song,
  range,
  mode,
  onChange,
  playhead,
}: {
  song: Song;
  range: { start: number; end: number };
  mode: 'window' | 'trim';
  onChange: (r: { start: number; end: number }) => void;
  /** Where the song is playing, in seconds. */
  playhead?: number;
}) {
  const [width, setWidth] = useState(0);
  const drag = useRef<{ x: number; start: number; end: number; edge: 'start' | 'end' | 'both' }>({ x: 0, start: 0, end: 0, edge: 'both' });
  const dur = Math.max(1, song.durationSec);
  const peaks = song.peaks?.length ? song.peaks : Array.from({ length: 80 }, (_, i) => 0.35 + 0.25 * Math.sin(i * 0.7) ** 2);
  const bars = 72;
  const sample = (i: number) => peaks[Math.min(peaks.length - 1, Math.floor((i / bars) * peaks.length))] ?? 0.3;
  const left = (range.start / dur) * 100;
  const span = ((range.end - range.start) / dur) * 100;
  const toSec = (dx: number) => (dx / Math.max(1, width)) * dur;

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        const t = toSec(e.nativeEvent.locationX);
        const edge = mode === 'window' ? 'both' : Math.abs(t - range.start) < Math.abs(t - range.end) ? 'start' : 'end';
        drag.current = { x: e.nativeEvent.pageX, start: range.start, end: range.end, edge };
        if (mode === 'window') {
          // Tap anywhere: center the snippet there.
          const len = range.end - range.start;
          const s = Math.max(0, Math.min(dur - len, t - len / 2));
          drag.current = { ...drag.current, start: s, end: s + len };
          onChange({ start: s, end: s + len });
        }
      }}
      onResponderMove={(e) => {
        const d = toSec(e.nativeEvent.pageX - drag.current.x);
        const { start, end, edge } = drag.current;
        if (edge === 'both') {
          const len = end - start;
          const s = Math.max(0, Math.min(dur - len, start + d));
          onChange({ start: s, end: s + len });
        } else if (edge === 'start') {
          onChange({ start: Math.max(0, Math.min(end - 5, start + d)), end });
        } else {
          onChange({ start, end: Math.min(dur, Math.max(start + 5, end + d)) });
        }
      }}
      accessibilityRole="adjustable"
      accessibilityLabel="The part of the song in the video. Drag to move it.">
      <View style={styles.bars} pointerEvents="none">
        {Array.from({ length: bars }, (_, i) => {
          const at = (i / bars) * 100;
          const inside = at >= left && at <= left + span;
          return <View key={i} style={[styles.bar, { height: `${18 + sample(i) * 82}%`, backgroundColor: inside ? color.accent : color.hairlineStrong }]} />;
        })}
      </View>
      <View pointerEvents="none" style={[styles.window, { left: `${left}%`, width: `${span}%` }]}>
        <View style={[styles.handle, styles.handleLeft]} />
        <View style={[styles.handle, styles.handleRight]} />
      </View>
      {playhead !== undefined ? <View pointerEvents="none" style={[styles.playhead, { left: `${Math.min(100, Math.max(0, (playhead / dur) * 100))}%` }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 64, borderRadius: radius.m, backgroundColor: color.flat, overflow: 'hidden', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'center', height: '100%', paddingHorizontal: 2, gap: 1 },
  bar: { flex: 1, borderRadius: 1 },
  window: { position: 'absolute', top: 0, bottom: 0, borderWidth: 2, borderColor: color.accent, borderRadius: radius.s, backgroundColor: 'rgba(250,26,85,0.08)' },
  handle: { position: 'absolute', top: '30%', bottom: '30%', width: 4, borderRadius: 2, backgroundColor: color.chalk },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: color.chalk },
  handleLeft: { left: -3 },
  handleRight: { right: -3 },
});
