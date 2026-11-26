import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

import type { SetGuide } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { T } from './T';

// The set guide in 3D: your mark on the floor, the wall behind you, where the phone stands,
// how high, and what it sees. Drag to walk around the set. Drawn with SVG so it runs the same
// on the phone and the web, no 3D engine needed.

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The part of the artist the framing keeps in shot, in meters from the floor. */
const FRAME_SPAN: Record<SetGuide['framing'], [number, number]> = { wide: [0, 2.0], medium: [0.85, 1.95], close: [1.3, 1.95] };
const ARTIST_H = 1.8;

interface Props {
  guide: SetGuide;
  height?: number;
  /** Small, no labels or hint: for lists. */
  compact?: boolean;
}

export function SetGuide3D({ guide, height = 240, compact }: Props) {
  const [width, setWidth] = useState(0);
  const [yaw, setYaw] = useState(0.75);
  const drag = useRef({ x: 0, yaw: 0.75 });
  const cam: Vec = [guide.camera.x, guide.camera.height, guide.camera.z];
  const target: Vec = [0, 0.8, guide.camera.z * 0.42];
  const dist = Math.max(6.2, guide.camera.z * 1.9);
  const pitch = 0.5;
  const eye: Vec = [target[0] + Math.sin(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
  const f = norm(sub(target, eye));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const focal = (width || 320) * 1.15;
  const cx = (width || 320) / 2;
  const cy = height / 2 + 6;
  const P = (p: Vec): [number, number] => {
    const d = sub(p, eye);
    const z = Math.max(0.1, dot(d, f));
    return [cx + (focal * dot(d, r)) / z, cy - (focal * dot(d, u)) / z];
  };
  const pts = (list: Vec[]) => list.map((p) => P(p).join(',')).join(' ');

  // Floor grid, half-meter squares, from behind the wall to past the camera.
  const back = -guide.backroomM;
  const front = guide.camera.z + 1;
  const grid: [Vec, Vec][] = [];
  for (let x = -2.5; x <= 2.51; x += 0.5) grid.push([[x, 0, back], [x, 0, front]]);
  for (let z = back; z <= front + 0.01; z += 0.5) grid.push([[-2.5, 0, z], [2.5, 0, z]]);

  const wall: Vec[] = [[-2.5, 0, back], [2.5, 0, back], [2.5, 2.6, back], [-2.5, 2.6, back]];
  const [lo, hi] = FRAME_SPAN[guide.framing];
  const halfW = ((hi - lo) * 16) / 9 / 2 / 1.6;
  const frame: Vec[] = [[-halfW, lo, 0], [halfW, lo, 0], [halfW, hi, 0], [-halfW, hi, 0]];
  const lightPos: Vec =
    guide.light === 'left' ? [-1.8, 2.1, 1.2] : guide.light === 'right' ? [1.8, 2.1, 1.2] : guide.light === 'overhead' ? [0, 2.6, 0.4] : [cam[0] * 0.6, 2.0, cam[2] + 0.5];

  const [hx, hy] = P([0, ARTIST_H - 0.12, 0]);
  const [cxp, cyp] = P(cam);
  const [cfx, cfy] = P([cam[0], 0, cam[2]]);
  const [mx, my] = P([0, 0, 0]);
  const [dx, dy] = P([cam[0] / 2, 0, cam[2] / 2]);
  const [lx, ly] = P(lightPos);
  const headR = Math.max(5, (focal * 0.12) / Math.max(0.1, dot(sub([0, ARTIST_H - 0.12, 0], eye), f)));
  const camW = Math.max(6, (focal * 0.16) / Math.max(0.1, dot(sub(cam, eye), f)));

  return (
    <View style={[styles.wrap, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !compact}
      onMoveShouldSetResponder={() => !compact}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        drag.current = { x: e.nativeEvent.pageX, yaw };
      }}
      onResponderMove={(e) => setYaw(drag.current.yaw + (e.nativeEvent.pageX - drag.current.x) / 120)}
      accessibilityLabel={`Set guide. Stand on your mark with ${guide.backroomM} meters behind you. Phone ${guide.camera.z} meters away at ${guide.camera.height} meters high, ${guide.lensMm} millimeter lens.`}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {grid.map(([a, b], i) => {
            const [x1, y1] = P(a);
            const [x2, y2] = P(b);
            return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color.hairline} strokeWidth={1} />;
          })}
          <Polygon points={pts(wall)} fill="rgba(255,255,255,0.05)" stroke={color.hairlineStrong} strokeWidth={1} />
          {/* Distance on the floor */}
          <Line x1={mx} y1={my} x2={cfx} y2={cfy} stroke={color.smoke} strokeDasharray="4 4" strokeWidth={1.5} />
          {/* What the phone sees */}
          {frame.map((corner, i) => {
            const [x, y] = P(corner);
            return <Line key={i} x1={cxp} y1={cyp} x2={x} y2={y} stroke={color.accent} strokeOpacity={0.55} strokeWidth={1} />;
          })}
          <Polygon points={pts(frame)} fill={color.accentSoft} stroke={color.accent} strokeWidth={1.2} />
          {/* Your mark */}
          <G>
            <Line x1={mx - 10} y1={my - 5} x2={mx + 10} y2={my + 5} stroke={color.accent} strokeWidth={3} />
            <Line x1={mx - 10} y1={my + 5} x2={mx + 10} y2={my - 5} stroke={color.accent} strokeWidth={3} />
          </G>
          {/* Props: what you hold, sit on or lean on */}
          {(guide.props ?? []).map((pr) => {
            if (pr.kind === 'bar') {
              const [a1, a2] = [P([-0.7, 2.05, 0]), P([0.7, 2.05, 0])];
              const [f1, f2] = [P([-0.7, 0, 0]), P([0.7, 0, 0])];
              return (
                <G key="bar">
                  <Line x1={f1[0]} y1={f1[1]} x2={a1[0]} y2={a1[1]} stroke="#FFD27A" strokeWidth={2} />
                  <Line x1={f2[0]} y1={f2[1]} x2={a2[0]} y2={a2[1]} stroke="#FFD27A" strokeWidth={2} />
                  <Line x1={a1[0]} y1={a1[1]} x2={a2[0]} y2={a2[1]} stroke="#FFD27A" strokeWidth={4} />
                </G>
              );
            }
            if (pr.kind === 'stand') {
              const [b0, b1] = [P([0.05, 0, 0.45]), P([0.05, 1.55, 0.45])];
              return (
                <G key="stand">
                  <Line x1={b0[0]} y1={b0[1]} x2={b1[0]} y2={b1[1]} stroke="#FFD27A" strokeWidth={3} />
                  <Circle cx={b1[0]} cy={b1[1]} r={5} fill="#FFD27A" />
                </G>
              );
            }
            if (pr.kind === 'seat' || pr.kind === 'table' || pr.kind === 'steps') {
              const h = pr.kind === 'table' ? 0.9 : pr.kind === 'steps' ? 0.25 : 0.45;
              const z0 = pr.kind === 'table' ? 0.35 : -0.25;
              const top: Vec[] = [[-0.3, h, z0 - 0.25], [0.3, h, z0 - 0.25], [0.3, h, z0 + 0.25], [-0.3, h, z0 + 0.25]];
              return <Polygon key={pr.kind} points={pts(top)} fill="rgba(255,210,122,0.25)" stroke="#FFD27A" strokeWidth={2} />;
            }
            if (pr.kind === 'wall') {
              const rail: Vec[] = [[-1.2, 1.0, back + 0.05], [1.2, 1.0, back + 0.05]];
              const [r1, r2] = [P(rail[0]), P(rail[1])];
              return <Line key="wall" x1={r1[0]} y1={r1[1]} x2={r2[0]} y2={r2[1]} stroke="#FFD27A" strokeWidth={4} />;
            }
            return null;
          })}
          {/* You */}
          <Line x1={mx} y1={my} x2={hx} y2={hy + headR} stroke={color.chalk} strokeWidth={Math.max(4, headR * 0.9)} strokeLinecap="round" />
          <Circle cx={hx} cy={hy} r={headR} fill={color.chalk} />
          {guide.props?.some((pr) => pr.kind === 'bar') ? (
            <>
              {[[-0.35, 1.5, 0, -0.55, 2.05, 0], [0.35, 1.5, 0, 0.55, 2.05, 0]].map((a, i) => {
                const [s1, s2] = [P([a[0], a[1], a[2]]), P([a[3], a[4], a[5]])];
                return <Line key={i} x1={s1[0]} y1={s1[1]} x2={s2[0]} y2={s2[1]} stroke={color.chalk} strokeWidth={3} strokeLinecap="round" />;
              })}
            </>
          ) : null}
          {/* Tripod and phone */}
          <Line x1={cfx} y1={cfy} x2={cxp} y2={cyp} stroke={color.smoke} strokeWidth={2} />
          <Polygon
            points={`${cxp - camW},${cyp - camW * 0.6} ${cxp + camW},${cyp - camW * 0.6} ${cxp + camW},${cyp + camW * 0.6} ${cxp - camW},${cyp + camW * 0.6}`}
            fill={color.flat}
            stroke={color.chalk}
            strokeWidth={1.5}
          />
          <Circle cx={cxp} cy={cyp} r={camW * 0.35} fill={color.accent} />
          {/* Light */}
          <Circle cx={lx} cy={ly} r={7} fill="#FFD27A" opacity={0.9} />
          <Circle cx={lx} cy={ly} r={13} fill="#FFD27A" opacity={0.18} />
          {!compact ? (
            <>
              <SvgText fontFamily="Inter, system-ui, sans-serif" x={mx + 14} y={my + 18} fill={color.accentText} fontSize={11} fontWeight="600">
                Stand here
              </SvgText>
              <SvgText fontFamily="Inter, system-ui, sans-serif" x={cxp + camW + 6} y={cyp - 2} fill={color.chalk} fontSize={11} fontWeight="600">
                {`Phone · ${guide.camera.height.toFixed(1)} m high`}
              </SvgText>
              <SvgText fontFamily="Inter, system-ui, sans-serif" x={dx + 6} y={dy - 6} fill={color.smoke} fontSize={11}>
                {`${guide.camera.z.toFixed(1)} m`}
              </SvgText>
              <SvgText fontFamily="Inter, system-ui, sans-serif" x={lx + 16} y={ly + 4} fill={color.smoke} fontSize={10}>
                Light
              </SvgText>
            </>
          ) : null}
        </Svg>
      ) : null}
      {!compact ? (
        <View style={styles.hint} pointerEvents="none">
          <T v="micro" c="smoke">
            Drag to look around
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: radius.l,
    overflow: 'hidden',
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  hint: {
    position: 'absolute',
    top: space.s,
    right: space.m,
  },
});
