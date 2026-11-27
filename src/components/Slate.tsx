import { ChevronDown, ChevronUp } from '@/components/icons';
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Polygon, Rect } from 'react-native-svg';

import { stageNumber, trackerView } from '@/engine/stages';
import type { Project, StageId } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { statusLine } from '@/lib/status';
import { color, easeOut, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { ProgressTicks } from './ProgressTicks';
import { StageGlyph } from './StageGlyph';
import { T } from './T';

interface Props {
  project: Project;
  expanded: boolean;
  onToggle: () => void;
  /** Called when the artist taps a finished stage to go back to it. */
  onRevisit: (stage: StageId) => void;
}

/** Diagonal black-and-chalk stripes, like the bars on a film slate. */
function Stripes({ height }: { height: number }) {
  const bands = 14;
  const w = 200 / bands;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 200 ${height}`} preserveAspectRatio="none">
      <Rect x="0" y="0" width="200" height={height} fill={color.stage} />
      {Array.from({ length: bands + 1 }, (_, i) => (i % 2 === 0 ? <Polygon key={i} points={`${i * w},${height} ${i * w + w * 0.6},0 ${(i + 1) * w + w * 0.6},0 ${(i + 1) * w},${height}`} fill={color.chalk} /> : null))}
    </Svg>
  );
}

const curve = Easing.bezier(...easeOut);

/**
 * The tracker: a film slate showing the scene (stage) you're on. When a stage wraps,
 * the clapper snaps shut. Tap it to see every stage and go back to a finished one.
 */
export function Slate({ project, expanded, onToggle, onRevisit }: Props) {
  const view = trackerView(project);
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const tilt = useSharedValue(0);
  const prevCompleted = useRef(view.completed);

  useEffect(() => {
    if (view.completed > prevCompleted.current) {
      haptic.success();
      if (!reduced) {
        tilt.set(withSequence(withTiming(-13, { duration: 160, easing: curve }), withSpring(0, { damping: 11, stiffness: 320, mass: 0.6 })));
      }
    }
    prevCompleted.current = view.completed;
  }, [view.completed, reduced, tilt]);

  const clapper = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));

  const stage = view.current;
  const scene = String(stage ? stageNumber(project, stage.id) : view.total).padStart(2, '0');
  const title = stage ? stage.title : "That's a wrap";
  const working = view.currentStatus === 'working';

  return (
    <View style={styles.slate}>
      <Animated.View style={[styles.clapper, clapper]}>
        <Stripes height={10} />
      </Animated.View>
      <View style={styles.bar}>
        <Stripes height={10} />
      </View>

      <Press
        onPress={onToggle}
        scaleTo={0.99}
        accessibilityLabel={`Stage ${scene}, ${title}. ${statusLine(project)}. ${expanded ? 'Hide' : 'Show'} all stages`}
        style={styles.body}>
        <View style={styles.head}>
          <T v="display" style={styles.scene}>
            {scene}
          </T>
          <View style={styles.headText}>
            <T v="title" numberOfLines={1}>
              {title}
            </T>
            <T v="caption" c={working ? 'accent' : 'smoke'} numberOfLines={1}>
              {statusLine(project)}
            </T>
          </View>
          {expanded ? <ChevronUp size={22} color={color.smoke} /> : <ChevronDown size={22} color={color.smoke} />}
        </View>
        <ProgressTicks view={view} />
      </Press>

      {expanded ? (
        // Scrolls on its own when the stages don't fit under the video.
        <ScrollView style={[styles.list, { maxHeight: Math.max(220, Math.round(height * 0.46)) }]} contentContainerStyle={styles.listContent} nestedScrollEnabled showsVerticalScrollIndicator>
          {view.stages.map((s) => {
            const canGoBack = s.status === 'done' || s.status === 'skipped';
            return (
              <Press
                key={s.def.id}
                disabled={!canGoBack}
                onPress={() => onRevisit(s.def.id)}
                scaleTo={0.99}
                accessibilityLabel={`${s.def.title}, ${s.status.replace('_', ' ')}${canGoBack ? '. Tap to go back' : ''}`}
                style={styles.row}>
                <StageGlyph status={s.status} />
                <T v="label" c={s.status === 'locked' || s.status === 'skipped' ? 'ash' : 'chalk'} style={styles.rowNum}>
                  {String(s.n).padStart(2, '0')}
                </T>
                <View style={styles.rowText}>
                  <T v="callout" c={s.status === 'locked' ? 'smoke' : 'chalk'} numberOfLines={1}>
                    {s.def.title}
                  </T>
                  <T v="caption" c="ash" numberOfLines={1}>
                    {s.def.summary}
                  </T>
                </View>
                {canGoBack ? (
                  <T v="caption" c="ash">
                    {s.status === 'skipped' ? 'Skipped' : 'Go back'}
                  </T>
                ) : null}
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slate: {
    backgroundColor: color.curtain,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  clapper: {
    height: 10,
    transformOrigin: 'left center',
  },
  bar: {
    height: 10,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: space.l,
    paddingTop: space.s,
    paddingBottom: space.m,
    gap: space.s,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  scene: {
    minWidth: 52,
  },
  headText: {
    flex: 1,
    gap: 2,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  listContent: {
    paddingHorizontal: space.l,
    paddingVertical: space.s,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  rowNum: {
    width: 28,
  },
  rowText: {
    flex: 1,
  },
});
