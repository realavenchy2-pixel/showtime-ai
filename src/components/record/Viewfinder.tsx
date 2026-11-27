import { type ReactNode, type RefObject, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path, Rect as SvgRect } from 'react-native-svg';

import type { Format } from '@/engine/types';
import type { CamTool } from '@/lib/camPrefs';
import type { FormatGuide, Rect } from '@/media/procam';
import { color, radius, space } from '@/theme/tokens';

import { Press } from '../Press';
import { T } from '../T';

// The parts of the pro viewfinder that look the same on the phone app and the web app:
// frame lines with the camcorder aim, thirds, a box per post format, the horizon, the status
// bar and the tool rail. The web adds zebras, focus peaking and scopes on top (ProCamera.web).

/** What the recorder screen hands the pro camera. The web reads the picture and the mic; the phone app doesn't need them. */
export interface ProCameraInput {
  /** Web: the live preview element. */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Web: the camera stream, for lens controls and the mic meter. */
  stream?: MediaStream | null;
  /** The selfie camera shows mirrored. */
  mirrored: boolean;
  /** Where the video posts, for the format guides. */
  formats: Format[];
  recording: boolean;
  /** Seconds into the take while recording. */
  elapsedSec: number;
  /** The camera isn't up yet (opening, blocked). */
  hidden: boolean;
}

/** The pro camera, as pieces the recorder places in its layers. */
export interface ProCameraParts {
  /** How the preview fits the screen: pro mode shows the whole recorded frame. */
  fit: 'contain' | 'cover';
  /** Under the controls: frame lines, guides, zebras and peaking, the level. */
  viewfinder: ReactNode;
  /** Replaces the plain status line at the top: standby or REC with timecode. */
  status: ReactNode | undefined;
  /** On top of everything: scopes, the tool rail, a lens slider. */
  tools: ReactNode;
  /** Recording time left on this device, when it can be known. */
  readout?: string;
  /** Phone app: zoom from 0 to 1 and the torch, for the camera view. */
  zoom: number;
  torch: boolean;
}

const LINE = 'rgba(255,255,255,0.88)';
const FAINT = 'rgba(255,255,255,0.34)';

/** Corner brackets at the edges of what records, the center aim, and optionally thirds. */
export function FrameLines({ frame, grid }: { frame: Rect; grid: boolean }) {
  const arm = Math.max(16, Math.min(28, Math.min(frame.w, frame.h) * 0.07));
  const inset = 10;
  const l = frame.x + inset;
  const t = frame.y + inset;
  const r = frame.x + frame.w - inset;
  const b = frame.y + frame.h - inset;
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const aim = 13;
  const gap = 4;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      {grid
        ? [1, 2].map((k) => (
            <G key={k}>
              <Line x1={frame.x + (frame.w * k) / 3} y1={frame.y} x2={frame.x + (frame.w * k) / 3} y2={frame.y + frame.h} stroke={FAINT} strokeWidth={1} />
              <Line x1={frame.x} y1={frame.y + (frame.h * k) / 3} x2={frame.x + frame.w} y2={frame.y + (frame.h * k) / 3} stroke={FAINT} strokeWidth={1} />
            </G>
          ))
        : null}
      <Path
        d={`M${l} ${t + arm}V${t}H${l + arm} M${r - arm} ${t}H${r}V${t + arm} M${r} ${b - arm}V${b}H${r - arm} M${l + arm} ${b}H${l}V${b - arm}`}
        stroke={LINE}
        strokeWidth={2}
        fill="none"
        strokeLinecap="square"
      />
      {/* The camcorder aim: a cross with an open center, so it never sits on the artist's face. */}
      <Path d={`M${cx - aim} ${cy}H${cx - gap} M${cx + gap} ${cy}H${cx + aim} M${cx} ${cy - aim}V${cy - gap} M${cx} ${cy + gap}V${cy + aim}`} stroke={LINE} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

/** Rough width of a guide's tab, for laying tabs side by side before they're measured. */
function tabWidth(label: string): number {
  return label.length * 6.4 + 12;
}

/**
 * A dashed box for each place the video posts that keeps less than the whole frame. Each box is
 * named by a tab centered on its top edge, clear of the scopes and the rail at the sides; boxes
 * that share a top edge get their tabs side by side.
 */
export function GuideBoxes({ guides }: { guides: FormatGuide[] }) {
  if (!guides.length) return null;
  const tabs = guides.map((g) => {
    const row = guides.filter((o) => Math.abs(o.rect.y - g.rect.y) < 4);
    const total = row.reduce((sum, o) => sum + tabWidth(o.label) + 6, -6);
    const before = row.slice(0, row.indexOf(g)).reduce((sum, o) => sum + tabWidth(o.label) + 6, 0);
    const center = g.rect.x + g.rect.w / 2;
    return { format: g.format, label: g.label, left: center - total / 2 + before, top: g.rect.y - 8 };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        {guides.map((g) => (
          <SvgRect key={g.format} x={g.rect.x} y={g.rect.y} width={g.rect.w} height={g.rect.h} stroke={FAINT} strokeWidth={1} strokeDasharray="6 5" fill="none" />
        ))}
      </Svg>
      {tabs.map((tab) => (
        <View key={tab.format} style={[styles.guideLabel, { left: tab.left, top: Math.max(0, tab.top) }]}>
          <T v="micro" c="chalk" style={styles.guideText} numberOfLines={1}>
            {tab.label}
          </T>
        </View>
      ))}
    </View>
  );
}

/** A horizon that turns green when the phone is level. */
export function LevelLine({ frame, roll }: { frame: Rect; roll: number | undefined }) {
  if (roll === undefined) return null;
  const level = Math.abs(roll) < 0.8;
  const width = Math.min(frame.w * 0.56, 260);
  const tone = level ? color.success : LINE;
  return (
    <View style={[styles.level, { left: frame.x + frame.w / 2 - width / 2, top: frame.y + frame.h / 2 - 1, width }]} pointerEvents="none">
      <View style={[styles.levelArm, { backgroundColor: tone, transform: [{ rotate: `${-roll}deg` }] }]} />
      <View style={styles.levelRead}>
        <T v="micro" style={[styles.tabular, { color: tone }]}>{`${roll > 0 ? '+' : ''}${roll.toFixed(1)}°`}</T>
      </View>
    </View>
  );
}

/** The status bar of a cinema camera: format, standby or recording with timecode, space left. */
export function HudBar({ left, recording, code }: { left?: string; recording: boolean; code: string }) {
  return (
    <View style={styles.hud} accessibilityLabel={`${recording ? 'Recording' : 'Standby'}, ${code}`}>
      {left ? (
        <T v="micro" c="smoke" style={[styles.tabular, styles.hudLeft]} numberOfLines={1}>
          {left}
        </T>
      ) : null}
      <View style={styles.hudCenter}>
        <View style={[styles.hudDot, recording ? styles.hudDotOn : null]} />
        <T v="micro" c={recording ? 'chalk' : 'smoke'}>
          {recording ? 'REC' : 'STBY'}
        </T>
        <T v="micro" c="chalk" style={[styles.tabular, styles.code]}>
          {code}
        </T>
      </View>
    </View>
  );
}

export interface RailItem {
  key: CamTool | 'pro' | 'zoom' | 'ev' | 'wb' | 'light';
  label: string;
  on: boolean;
  /** What a screen reader hears. */
  hint: string;
  onPress: () => void;
}

/** The tool rail down the right edge: short labels, the way camera apps do it. */
export function ToolRail({ items, top, maxHeight }: { items: RailItem[]; top: number; maxHeight: number }) {
  return (
    <View style={[styles.rail, { top, maxHeight }]} pointerEvents="box-none">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.railList}>
        {items.map((item) => (
          <Press
            key={item.key}
            onPress={item.onPress}
            hitSlop={{ top: 3, bottom: 3, left: 10, right: 6 }}
            scaleTo={0.94}
            style={[styles.railItem, item.on && styles.railItemOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: item.on }}
            aria-checked={item.on}
            accessibilityLabel={item.hint}>
            <T v="micro" style={[styles.tabular, { color: item.on ? color.stage : color.chalk }]}>
              {item.label}
            </T>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}

/** A vertical drag control for zoom, exposure or white balance. Up is more. */
export function LensSlider({ label, value, min, max, format, top, onChange }: { label: string; value: number; min: number; max: number; format: (v: number) => string; top: number; onChange: (v: number) => void }) {
  const [height, setHeight] = useState(0);
  const span = Math.max(1e-6, max - min);
  const fraction = Math.max(0, Math.min(1, (value - min) / span));
  const from = (y: number) => min + (1 - Math.max(0, Math.min(1, y / Math.max(1, height)))) * span;
  return (
    <View style={[styles.slider, { top }]} accessibilityRole="adjustable" accessibilityLabel={`${label}, ${format(value)}`}>
      <T v="micro" c="chalk" style={styles.tabular}>
        {format(value)}
      </T>
      <View
        style={styles.sliderTrack}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => onChange(from(e.nativeEvent.locationY))}
        onResponderMove={(e) => onChange(from(e.nativeEvent.locationY))}>
        <View style={styles.sliderRail} pointerEvents="none" />
        <View style={[styles.sliderFill, { height: `${fraction * 100}%` }]} pointerEvents="none" />
        <View style={[styles.sliderKnob, { bottom: `${fraction * 100}%` }]} pointerEvents="none" />
      </View>
      <T v="micro" c="smoke">
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  guideLabel: {
    position: 'absolute',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  guideText: {
    fontSize: 9,
    lineHeight: 12,
  },
  level: {
    position: 'absolute',
    height: 2,
    alignItems: 'center',
  },
  levelArm: {
    width: '100%',
    height: 2,
    borderRadius: 1,
  },
  levelRead: {
    position: 'absolute',
    top: 8,
  },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.m,
    alignSelf: 'center',
    height: 30,
    paddingHorizontal: space.m,
    borderRadius: radius.s,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hudLeft: {
    paddingRight: space.m,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.16)',
  },
  hudCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hudDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: color.ash,
  },
  hudDotOn: {
    backgroundColor: color.rec,
  },
  code: {
    fontSize: 13,
    letterSpacing: 0.6,
  },
  rail: {
    position: 'absolute',
    right: 8,
  },
  railList: {
    gap: 6,
    paddingVertical: 2,
  },
  railItem: {
    minWidth: 54,
    height: 30,
    paddingHorizontal: space.s,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  railItemOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  slider: {
    position: 'absolute',
    right: 72,
    width: 56,
    height: 224,
    paddingVertical: space.s,
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.s,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sliderTrack: {
    flex: 1,
    width: 44,
    alignItems: 'center',
  },
  sliderRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sliderFill: {
    position: 'absolute',
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: color.chalk,
  },
  sliderKnob: {
    position: 'absolute',
    width: 22,
    height: 4,
    marginBottom: -2,
    borderRadius: 2,
    backgroundColor: color.chalk,
  },
});
