import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LocationKind } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { SceneArt } from './art/SceneArt';
import { T } from './T';

/** Drag to compare the raw take with the switched shot. */
export function Compare({ location, label }: { location: LocationKind; label: string }) {
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(0.5);
  // Where the drag started, so the handle follows the finger from there.
  const drag = useRef({ x: 0, pos: 0.5 });

  const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
  const span = Math.max(1, width);

  return (
    <View
      style={styles.wrap}
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
      accessibilityLabel={`Compare your take with the switched shot. ${Math.round(pos * 100)} percent switched.`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => setPos((p) => clamp(p + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)))}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <SceneArt kind="room" relit={false} />
      </View>
      <View style={[styles.clip, { width: `${pos * 100}%` }]} pointerEvents="none">
        <View style={{ width, height: '100%' }}>
          <SceneArt kind={location} relit />
        </View>
      </View>
      <View style={[styles.handle, { left: `${pos * 100}%` }]} pointerEvents="none">
        <View style={styles.line} />
        <View style={styles.knob}>
          <View style={styles.grip} />
          <View style={styles.grip} />
        </View>
      </View>
      <View style={[styles.tag, styles.tagLeft]} pointerEvents="none">
        <T v="micro">{label}</T>
      </View>
      <View style={[styles.tag, styles.tagRight]} pointerEvents="none">
        <T v="micro">Your take</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.m,
    overflow: 'hidden',
    backgroundColor: color.flat,
  },
  clip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: color.chalk,
  },
  knob: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.chalk,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  grip: {
    width: 2,
    height: 12,
    borderRadius: 1,
    backgroundColor: color.stage,
  },
  tag: {
    position: 'absolute',
    bottom: space.s,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.s,
    backgroundColor: color.scrim,
  },
  tagLeft: {
    left: space.s,
  },
  tagRight: {
    right: space.s,
  },
});
