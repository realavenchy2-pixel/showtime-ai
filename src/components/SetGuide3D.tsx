import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { MOVE_NAME, shotTitle } from '@/engine/shots';
import type { SetGuide } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { T } from './T';

// The set guide in 3D: your mark on the floor, the wall behind you, where the phone stands, how
// high, what it sees, and you in the scene's pose: standing, seated, hanging on, leaning back.
// Flip to "Someone filming" to see the person holding the phone and the move they make.
// Drag to walk around the set. Drawn with SVG so it runs the same on the phone and the web.

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Props are drawn in warm light, so they read apart from you and the phone. */
const PROP = '#FFD27A';
const FONT = 'Inter, system-ui, sans-serif';

type Mode = 'stand' | 'film';

interface Props {
  guide: SetGuide;
  height?: number;
  /** Small, no labels or hint: for lists. */
  compact?: boolean;
}

/** You, in the scene's pose: a body line through the joints, and a head. */
function bodyFor(guide: SetGuide): { body: Vec[]; head: Vec; arms: [Vec, Vec][] } {
  const kinds = new Set((guide.props ?? []).map((p) => p.kind));
  switch (guide.pose) {
    case 'sit':
      return {
        body: [[0, 0.02, 0.42], [0, 0.5, 0.36], [0, 0.5, -0.12], [0, 1.12, -0.16]],
        head: [0, 1.27, -0.16],
        arms: kinds.has('table') ? [[[0.2, 1.02, -0.14], [0.25, 0.92, 0.25]], [[-0.2, 1.02, -0.14], [-0.25, 0.92, 0.25]]] : [[[0.2, 1.02, -0.14], [0.22, 0.72, 0.3]], [[-0.2, 1.02, -0.14], [-0.22, 0.72, 0.3]]],
      };
    case 'lean':
      return {
        body: [[0, 0.02, 0.14], [0, 1.5, -0.14]],
        head: [0, 1.65, -0.17],
        arms: [[[0.2, 1.4, -0.12], [0.38, 1.0, -0.3]], [[-0.2, 1.4, -0.12], [-0.38, 1.0, -0.3]]],
      };
    case 'hang':
      return {
        body: [[0, 0.02, 0], [0, 1.52, 0]],
        head: [0, 1.68, 0],
        arms: [[[0.18, 1.45, 0], [0.45, 2.05, 0]], [[-0.18, 1.45, 0], [-0.45, 2.05, 0]]],
      };
    default:
      return {
        body: [[0, 0.02, 0], [0, 1.52, 0]],
        head: [0, 1.68, 0],
        arms: kinds.has('stand')
          ? [[[0.18, 1.45, 0], [0.07, 1.5, 0.4]]]
          : kinds.has('table')
            ? [[[0.2, 1.4, 0], [0.25, 0.92, 0.25]], [[-0.2, 1.4, 0], [-0.25, 0.92, 0.25]]]
            : [],
      };
  }
}

export function SetGuide3D({ guide, height = 240, compact }: Props) {
  const [width, setWidth] = useState(0);
  const [yaw, setYaw] = useState(0.75);
  const [mode, setMode] = useState<Mode>('stand');
  const drag = useRef({ x: 0, yaw: 0.75 });
  const cam: Vec = [guide.camera.x, guide.camera.height, guide.camera.z];
  const target: Vec = [0, 0.75, guide.camera.z * 0.48];
  const dist = Math.max(5.4, guide.camera.z * 1.8);
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
  /** A size in meters at a point, in pixels. */
  const px = (m: number, at: Vec) => (focal * m) / Math.max(0.1, dot(sub(at, eye), f));
  const line = (a: Vec, b: Vec, stroke: string, w: number, key: string | number, dash?: string) => {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    return <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} />;
  };

  // Floor grid, half-meter squares, from behind the wall to past the camera.
  const back = -guide.backroomM;
  const front = guide.camera.z + 1;
  const grid: [Vec, Vec][] = [];
  for (let x = -2.5; x <= 2.51; x += 0.5) grid.push([[x, 0, back], [x, 0, front]]);
  for (let z = back; z <= front + 0.01; z += 0.5) grid.push([[-2.5, 0, z], [2.5, 0, z]]);

  const wall: Vec[] = [[-2.5, 0, back], [2.5, 0, back], [2.5, 2.6, back], [-2.5, 2.6, back]];
  const [lo, hi] = guide.frame;
  const halfW = ((hi - lo) * 16) / 9 / 2 / 1.6;
  const frame: Vec[] = [[-halfW, lo, 0], [halfW, lo, 0], [halfW, hi, 0], [-halfW, hi, 0]];
  const lightPos: Vec =
    guide.light === 'left' ? [-1.8, 2.1, 1.2] : guide.light === 'right' ? [1.8, 2.1, 1.2] : guide.light === 'overhead' ? [0, 2.6, 0.4] : [cam[0] * 0.6, 2.0, cam[2] + 0.5];

  const you = bodyFor(guide);
  const [hx, hy] = P(you.head);
  const headR = Math.max(5, px(0.12, you.head));
  const bodyW = Math.max(4, headR * 0.9);
  const [cxp, cyp] = P(cam);
  const [cfx, cfy] = P([cam[0], 0, cam[2]]);
  const [mx, my] = P([0, 0, 0]);
  const [dx, dy] = P([cam[0] / 2, 0, cam[2] / 2]);
  const [lx, ly] = P(lightPos);
  const camW = Math.max(6, px(0.16, cam));

  // Someone filming: they stand just behind the phone, and the move is drawn on the floor.
  const toYou = norm([-cam[0], 0, -cam[2]]);
  const side: Vec = [-toYou[2], 0, toYou[0]];
  const op: Vec = [cam[0] - toYou[0] * 0.32, 0, cam[2] - toYou[2] * 0.32];
  const opHead: Vec = [op[0], Math.min(1.7, Math.max(0.75, cam[1] + 0.3)), op[2]];
  const opHeadR = Math.max(4, px(0.11, opHead));
  const step = Math.min(0.8, Math.hypot(cam[0], cam[2]) * 0.35);
  const C: Vec = [cam[0], 0.01, cam[2]];
  let path: Vec[] = [];
  let twoWay = false;
  if (guide.move === 'push') path = [C, [C[0] + toYou[0] * step, 0.01, C[2] + toYou[2] * step]];
  else if (guide.move === 'pull') path = [C, [C[0] - toYou[0] * step, 0.01, C[2] - toYou[2] * step]];
  else if (guide.move === 'sway') {
    path = [[C[0] - side[0] * 0.3, 0.01, C[2] - side[2] * 0.3], [C[0] + side[0] * 0.3, 0.01, C[2] + side[2] * 0.3]];
    twoWay = true;
  } else if (guide.move === 'arc') {
    const radiusM = Math.hypot(cam[0], cam[2]);
    const from = Math.atan2(cam[0], cam[2]);
    // Swing away from where you're looking from, so the whole arc stays in view.
    const span = Math.sin(yaw) > 0 ? -0.75 : 0.75;
    for (let i = 0; i <= 12; i++) {
      const a = from + (span * i) / 12;
      path.push([Math.sin(a) * radiusM, 0.01, Math.cos(a) * radiusM]);
    }
  }
  const screenPath = path.map(P);
  const head = (tip: [number, number], tail: [number, number], key: string) => {
    const a = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
    const s = 8;
    return (
      <G key={key}>
        <Line x1={tip[0]} y1={tip[1]} x2={tip[0] - s * Math.cos(a - 0.5)} y2={tip[1] - s * Math.sin(a - 0.5)} stroke={color.chalk} strokeWidth={2} strokeLinecap="round" />
        <Line x1={tip[0]} y1={tip[1]} x2={tip[0] - s * Math.cos(a + 0.5)} y2={tip[1] - s * Math.sin(a + 0.5)} stroke={color.chalk} strokeWidth={2} strokeLinecap="round" />
      </G>
    );
  };
  const end = screenPath[screenPath.length - 1];
  const film = mode === 'film';
  const [ohx, ohy] = P(opHead);
  /** A label with a dark halo, so it reads over lines and figures from any angle. */
  const label = (text: string, x0: number, y0: number, fill: string, opts: { bold?: boolean; size?: number; anchor?: 'start' | 'middle' | 'end' } = {}) => {
    // Kept inside the box: a rough width from the character count is enough at this size.
    const size = opts.size ?? 11;
    const w = text.length * size * 0.56;
    const left = opts.anchor === 'middle' ? x0 - w / 2 : opts.anchor === 'end' ? x0 - w : x0;
    const shift = Math.min(0, (width || 320) - 8 - (left + w)) + Math.max(0, 8 - left);
    const x = x0 + shift;
    const y = Math.min(height - 8, Math.max(size + 4, y0));
    const common = { fontFamily: FONT, x, y, fontSize: size, fontWeight: opts.bold ? '600' : '400', textAnchor: opts.anchor ?? 'start' } as const;
    return (
      <G key={`${text}-l`}>
        <SvgText {...common} fill={color.curtain} stroke={color.curtain} strokeWidth={4} strokeLinejoin="round">
          {text}
        </SvgText>
        <SvgText {...common} fill={fill}>
          {text}
        </SvgText>
      </G>
    );
  };

  return (
    <View style={styles.outer}>
      {!compact ? (
        <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel="How the phone is held">
          {(['stand', 'film'] as const).map((m) => (
            <Press
              key={m}
              onPress={() => setMode(m)}
              style={[styles.mode, mode === m && styles.modeOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === m }}
              accessibilityLabel={m === 'stand' ? 'Phone on a stand' : 'Someone filming'}>
              <T v="micro" c={mode === m ? 'stage' : 'smoke'}>
                {m === 'stand' ? 'Phone on a stand' : 'Someone filming'}
              </T>
            </Press>
          ))}
        </View>
      ) : null}
      <View
        style={[styles.wrap, { height }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !compact}
        onMoveShouldSetResponder={() => !compact}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          drag.current = { x: e.nativeEvent.pageX, yaw };
        }}
        onResponderMove={(e) => setYaw(drag.current.yaw + (e.nativeEvent.pageX - drag.current.x) / 120)}
        accessibilityLabel={`Set guide, ${shotTitle(guide)}. Stand on your mark with ${guide.backroomM} meters behind you. Phone ${guide.camera.z} meters away at ${guide.camera.height} meters high, ${guide.zoom === 1 ? 'main lens' : `${guide.zoom} times zoom`}. Someone filming: ${MOVE_NAME[guide.move].toLowerCase()}.`}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {grid.map(([a, b], i) => line(a, b, color.hairline, 1, `g${i}`))}
            <Polygon points={pts(wall)} fill="rgba(255,255,255,0.05)" stroke={color.hairlineStrong} strokeWidth={1} />
            {/* Distance on the floor */}
            <Line x1={mx} y1={my} x2={cfx} y2={cfy} stroke={color.smoke} strokeDasharray="4 4" strokeWidth={1.5} />
            {/* What the phone sees */}
            {frame.map((corner, i) => {
              const [x, y] = P(corner);
              return <Line key={`f${i}`} x1={cxp} y1={cyp} x2={x} y2={y} stroke={color.accent} strokeOpacity={0.55} strokeWidth={1} />;
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
                return (
                  <G key="bar">
                    {line([-0.7, 0, 0], [-0.7, 2.05, 0], PROP, 2, 'b1')}
                    {line([0.7, 0, 0], [0.7, 2.05, 0], PROP, 2, 'b2')}
                    {line([-0.7, 2.05, 0], [0.7, 2.05, 0], PROP, 4, 'b3')}
                  </G>
                );
              }
              if (pr.kind === 'stand') {
                const [b1x, b1y] = P([0.05, 1.55, 0.45]);
                return (
                  <G key="stand">
                    {line([0.05, 0, 0.45], [0.05, 1.55, 0.45], PROP, 3, 's1')}
                    <Circle cx={b1x} cy={b1y} r={5} fill={PROP} />
                  </G>
                );
              }
              if (pr.kind === 'mic') {
                const [mx2, my2] = P([0, 1.66, 0.28]);
                return (
                  <G key="mic">
                    {line([0, 2.6, 0.28], [0, 1.7, 0.28], PROP, 1.5, 'm1')}
                    <Circle cx={mx2} cy={my2} r={Math.max(3, px(0.05, [0, 1.66, 0.28]))} fill={PROP} />
                  </G>
                );
              }
              if (pr.kind === 'seat' || pr.kind === 'table' || pr.kind === 'steps') {
                const h = pr.kind === 'table' ? 0.9 : pr.kind === 'steps' ? 0.25 : 0.45;
                const z0 = pr.kind === 'table' ? 0.38 : -0.25;
                const top: Vec[] = [[-0.3, h, z0 - 0.25], [0.3, h, z0 - 0.25], [0.3, h, z0 + 0.25], [-0.3, h, z0 + 0.25]];
                return (
                  <G key={pr.kind}>
                    {top.map((c, i) => line([c[0], 0, c[2]], c, PROP, 1, `${pr.kind}${i}`))}
                    <Polygon points={pts(top)} fill="rgba(255,210,122,0.25)" stroke={PROP} strokeWidth={2} />
                  </G>
                );
              }
              if (pr.kind === 'wall') {
                return (
                  <G key="wall">
                    {line([-0.6, 0, -0.32], [-0.6, 1.0, -0.32], PROP, 2, 'w1')}
                    {line([0.6, 0, -0.32], [0.6, 1.0, -0.32], PROP, 2, 'w2')}
                    {line([-0.6, 1.0, -0.32], [0.6, 1.0, -0.32], PROP, 4, 'w3')}
                  </G>
                );
              }
              return null;
            })}
            {/* You */}
            <Polyline points={pts(you.body)} fill="none" stroke={color.chalk} strokeWidth={bodyW} strokeLinecap="round" strokeLinejoin="round" />
            {you.arms.map(([a, b], i) => line(a, b, color.chalk, Math.max(2.5, bodyW * 0.45), `a${i}`))}
            <Circle cx={hx} cy={hy} r={headR} fill={color.chalk} />
            {/* The phone: on a stand, or in someone's hands with the move they make */}
            {film ? (
              <G>
                {screenPath.length > 1 ? (
                  <>
                    <Polyline points={screenPath.map((p) => p.join(',')).join(' ')} fill="none" stroke={color.chalk} strokeWidth={2} strokeDasharray="5 4" />
                    {head(end, screenPath[screenPath.length - 2], 'h1')}
                    {twoWay ? head(screenPath[0], screenPath[1], 'h2') : null}
                  </>
                ) : null}
                {line([op[0], 0.02, op[2]], [opHead[0], opHead[1] - 0.14, opHead[2]], color.ash, Math.max(2.5, opHeadR * 0.55), 'op')}
                {line([op[0], opHead[1] - 0.22, op[2]], cam, color.ash, 2, 'opArm')}
                <Circle cx={ohx} cy={ohy} r={opHeadR} fill={color.ash} />
              </G>
            ) : (
              <Line x1={cfx} y1={cfy} x2={cxp} y2={cyp} stroke={color.smoke} strokeWidth={2} />
            )}
            <Polygon
              points={`${cxp - camW},${cyp - camW * 0.6} ${cxp + camW},${cyp - camW * 0.6} ${cxp + camW},${cyp + camW * 0.6} ${cxp - camW},${cyp + camW * 0.6}`}
              fill={color.flat}
              stroke={color.chalk}
              strokeWidth={1.5}
            />
            <Circle cx={cxp} cy={cyp} r={camW * 0.35} fill={color.accent} />
            {/* Light */}
            <Circle cx={lx} cy={ly} r={7} fill={PROP} opacity={0.9} />
            <Circle cx={lx} cy={ly} r={13} fill={PROP} opacity={0.18} />
            {!compact ? (
              <>
                {label(`${guide.camera.z.toFixed(1)} m`, dx, dy + 16, color.smoke, { anchor: 'middle' })}
                {lx > (width || 320) / 2 ? label('Light', lx - 16, ly + 4, color.smoke, { size: 10, anchor: 'end' }) : label('Light', lx + 16, ly + 4, color.smoke, { size: 10 })}
                {label(guide.pose === 'sit' ? 'Seat here' : 'Stand here', mx + 14, my + 4, color.accentText, { bold: true })}
                {/* On a stand: how high the phone goes. Filming: what the person holding it does. */}
                {film
                  ? label(MOVE_NAME[guide.move], ohx, ohy - opHeadR - 8, color.chalk, { bold: true, anchor: 'middle' })
                  : label(`Phone · ${guide.camera.height.toFixed(1)} m high · ${guide.zoom}x`, cxp, cyp - camW * 0.6 - 8, color.chalk, { bold: true, anchor: 'middle' })}
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
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    gap: space.s,
  },
  wrap: {
    width: '100%',
    borderRadius: radius.l,
    overflow: 'hidden',
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  modes: {
    flexDirection: 'row',
    gap: space.xs,
  },
  mode: {
    paddingHorizontal: space.m,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  modeOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  hint: {
    position: 'absolute',
    bottom: space.s,
    right: space.m,
  },
});
