import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { color, radius, space } from '@/theme/tokens';

import { T } from '../T';

/** Drag across the real raw frame and the real switched frame of the same moment. */
export function BeforeAfter({ before, after, aspect = 9 / 16 }: { before: number; after: number; aspect?: number }) {
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(0.5);
  const drag = useRef({ x: 0, pos: 0.5 });
  const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));
  const span = Math.max(1, width);
  return (
    <View
      style={[styles.wrap, { aspectRatio: aspect }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        const next = clamp(e.nativeEvent.locationX / span);
        drag.current = { x: e.nativeEvent.pageX, pos: next };
        setPos(next);
      }}
      onResponderMove={(e) => setPos(clamp(drag.current.pos + (e.nativeEvent.pageX - drag.current.x) / span))}
      accessibilityRole="adjustable"
      accessibilityLabel={`Before and after. ${Math.round((1 - pos) * 100)} percent switched.`}>
      <Image source={after} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[styles.clip, { width: `${pos * 100}%` }]} pointerEvents="none">
        <Image source={before} style={{ width: span, height: '100%' }} contentFit="cover" />
      </View>
      <View style={[styles.line, { left: `${pos * 100}%` }]} pointerEvents="none">
        <View style={styles.knob} />
      </View>
      <View style={[styles.chip, styles.left]} pointerEvents="none">
        <T v="micro">Before</T>
      </View>
      <View style={[styles.chip, styles.right]} pointerEvents="none">
        <T v="micro">After</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: radius.l, overflow: 'hidden', backgroundColor: color.flat },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  knob: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: color.accent },
  chip: { position: 'absolute', top: space.m, paddingHorizontal: space.s, paddingVertical: 4, borderRadius: radius.s, backgroundColor: color.scrim },
  left: { left: space.m },
  right: { right: space.m },
});
