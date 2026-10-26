import { router, useLocalSearchParams } from 'expo-router';
import { RefreshCcw, X } from '@/components/icons';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Press } from '@/components/Press';
import { CameraLayer, useCameraAccess } from '@/components/record/CameraLayer';
import { goBack } from '@/components/Screen';
import { T } from '@/components/T';
import { showToast } from '@/components/Toast';
import { recordTake } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { useApp, useProject } from '@/engine/store';
import type { LyricLine, PlannedTake } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, gutter, maxWidth, radius, space } from '@/theme/tokens';

type Phase = 'idle' | 'countin' | 'recording';

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProject(id);
  const apply = useApp((s) => s.apply);
  const insets = useSafeAreaInsets();
  const access = useCameraAccess();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [phase, setPhase] = useState<Phase>('idle');
  const [beat, setBeat] = useState(4);
  const [songTime, setSongTime] = useState(0);
  const startedAt = useRef(0);

  const song = project?.song;
  const n = project?.takes.length ?? 0;
  const plan: PlannedTake = project?.takePlan[n] ?? { angle: 'Close-up', scope: 'Full song' };
  const hooks = song?.sections.filter((s) => s.kind === 'hook') ?? [];
  const from = plan.scope === 'Hook only' && hooks.length ? hooks[0].start : 0;
  const to = plan.scope === 'Hook only' && hooks.length ? hooks[hooks.length - 1].end : song?.durationSec ?? 0;
  const beatMs = song ? 60000 / song.bpm : 500;

  // Count-in: four beats at the song's tempo, then recording starts on the downbeat.
  useEffect(() => {
    if (phase !== 'countin') return;
    let left = 4;
    haptic.beat();
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        startedAt.current = Date.now();
        setSongTime(from);
        setPhase('recording');
        haptic.confirm();
      } else {
        setBeat(left);
        haptic.beat();
      }
    }, beatMs);
    return () => clearInterval(timer);
  }, [phase, beatMs, from]);

  const stop = () => {
    if (!project) return;
    apply(project.id, (p) => recordTake(p, plan.angle, plan.scope));
    setPhase('idle');
    haptic.success();
    showToast(`Take ${n + 1} saved and lined up with the song`);
  };
  const onSongEnd = useEffectEvent(stop);

  // While recording, song time follows the clock, and the take ends with the song.
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => {
      const t = from + (Date.now() - startedAt.current) / 1000;
      if (t >= to - 0.05) {
        clearInterval(timer);
        setSongTime(to);
        onSongEnd();
      } else {
        setSongTime(t);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase, from, to]);

  if (!project || !song) {
    return (
      <View style={[styles.page, styles.center]}>
        <T v="body" c="smoke">
          Pick a song first.
        </T>
        <Button label="Back" variant="quiet" onPress={() => goBack()} />
      </View>
    );
  }

  const planned = project.takePlan.length;
  const takeLabel = n < planned ? `Take ${n + 1} of ${planned}` : `Extra take ${n + 1}`;
  const lyric = currentLines(song.lyrics, phase === 'idle' ? from : songTime);

  const start = async () => {
    if (!access.granted) {
      const ok = await access.request();
      if (!ok) return;
    }
    setBeat(4);
    setPhase('countin');
  };

  return (
    <View style={styles.page}>
      {access.granted ? <CameraLayer facing={facing} showHint={phase === 'idle'} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: color.stage }]} />}

      <View style={[styles.top, { paddingTop: insets.top + space.s }]}>
        <View style={styles.topRow}>
          <Press onPress={() => router.back()} accessibilityLabel="Close recorder" style={styles.iconBtn} hitSlop={8} disabled={phase !== 'idle'}>
            <X size={24} color={color.chalk} />
          </Press>
          <View style={styles.topText}>
            {phase === 'recording' ? (
              <View style={styles.rec}>
                <View style={styles.recDot} />
                <T v="micro" style={styles.tabular}>{`REC ${formatTime(songTime - from)}`}</T>
              </View>
            ) : (
              <T v="micro" c="smoke">
                {takeLabel}
              </T>
            )}
            <T v="heading" numberOfLines={1}>{`${plan.angle}, ${plan.scope.toLowerCase()}`}</T>
          </View>
          <Press
            onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
            accessibilityLabel="Flip camera"
            style={styles.iconBtn}
            hitSlop={8}
            disabled={phase !== 'idle'}>
            <RefreshCcw size={22} color={color.chalk} />
          </Press>
        </View>
      </View>

      {phase === 'countin' ? (
        <View style={styles.countWrap} pointerEvents="none">
          <Animated.View key={beat} entering={ZoomIn.duration(140)}>
            <T v="display" style={styles.count} accessibilityLiveRegion="assertive">
              {String(beat)}
            </T>
          </Animated.View>
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.l }]}>
        <View style={styles.column}>
          {!access.granted && !access.loading ? (
            <View style={styles.permission}>
              <T v="callout">Camera and mic access lets you record takes.</T>
              <T v="caption" c="smoke">
                The mic only lines your take up with the song. The video always uses your master audio.
              </T>
            </View>
          ) : null}

          <Animated.View entering={FadeIn} style={styles.prompter} accessibilityLabel="Lyrics">
            {lyric.current ? (
              <T v="heading" style={styles.lyric}>
                {lyric.current.words.map((w, i) => (
                  <T key={i} v="heading" style={[styles.lyric, { color: phase === 'recording' && w.t <= songTime ? color.chalk : color.smoke }]}>
                    {`${w.text} `}
                  </T>
                ))}
              </T>
            ) : (
              <T v="heading" c="smoke" style={styles.lyric}>
                Instrumental
              </T>
            )}
            {lyric.next ? (
              <T v="callout" c="ash" numberOfLines={1}>
                {lyric.next.words.map((w) => w.text).join(' ')}
              </T>
            ) : null}
          </Animated.View>

          <View style={styles.progress}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${to > from ? ((songTime - from) / (to - from)) * 100 : 0}%` }]} />
            </View>
            <T v="micro" c="smoke" style={styles.tabular}>{`${formatTime(phase === 'idle' ? from : songTime)} / ${formatTime(to)}`}</T>
          </View>

          <View style={styles.controls}>
            <View style={styles.side}>
              {phase === 'idle' && n > 0 ? <Button label="Done" variant="quiet" onPress={() => router.back()} /> : null}
            </View>
            <Press
              onPress={phase === 'idle' ? start : phase === 'recording' ? stop : undefined}
              disabled={phase === 'countin'}
              accessibilityLabel={phase === 'recording' ? 'Stop recording' : 'Start recording'}
              style={styles.recordBtn}>
              <View style={[styles.recordInner, phase === 'recording' && styles.recordStop]} />
            </Press>
            <View style={styles.side}>
              <T v="caption" c="smoke" style={styles.hint}>
                {phase === 'idle' ? `${n} ${n === 1 ? 'take' : 'takes'} in` : phase === 'countin' ? 'Get ready' : 'Tap to stop'}
              </T>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/** The lyric line under the playhead and the one after it. */
function currentLines(lines: LyricLine[], t: number): { current?: LyricLine; next?: LyricLine } {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].words[0].t <= t + 0.6) idx = i;
  }
  if (idx === -1) return { current: undefined, next: lines.find((l) => l.words[0].t > t) };
  const current = lines[idx];
  const lastWord = current.words[current.words.length - 1];
  if (t > lastWord.t + 2.5) return { current: undefined, next: lines[idx + 1] };
  return { current, next: lines[idx + 1] };
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: color.stage,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.l,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.s,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingBottom: space.m,
    alignItems: 'center',
  },
  topRow: {
    width: '100%',
    maxWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topText: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.rec,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  countWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: 160,
    lineHeight: 160,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: gutter,
    paddingTop: space.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth,
    gap: space.l,
  },
  permission: {
    padding: space.l,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    gap: space.xs,
  },
  prompter: {
    gap: space.xs,
    minHeight: 64,
  },
  lyric: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700',
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(242,240,236,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: color.chalk,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    alignItems: 'center',
  },
  hint: {
    textAlign: 'center',
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: color.rec,
  },
  recordStop: {
    width: 30,
    height: 30,
    borderRadius: 6,
  },
});
