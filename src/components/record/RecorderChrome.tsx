import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Pause, Play, RefreshCcw, X } from '@/components/icons';
import { formatTime } from '@/engine/director';
import { barSec } from '@/engine/samples';
import type { LyricLine, PlannedTake, Section, Song, Take } from '@/engine/types';
import { color, gutter, maxWidth, radius, space } from '@/theme/tokens';

import { Frame } from '../Frame';
import { Press } from '../Press';
import { StageGlyph } from '../StageGlyph';
import { T } from '../T';

export type RecorderPhase = 'opening' | 'blocked' | 'idle' | 'countin' | 'recording' | 'saving';

interface Props {
  phase: RecorderPhase;
  /** Count-in number on screen, 4 down to 1. */
  beat: number;
  song: Song;
  /** Song time under the playhead. */
  songTime: number;
  /** The stretch of the song this take covers. */
  from: number;
  to: number;
  takes: Take[];
  planned?: PlannedTake;
  /** The first take: where it starts is where the video starts. */
  placing: boolean;
  /** The take starts somewhere other than the top. */
  custom: boolean;
  /** Where the video sits in the song once it's placed. */
  video?: { start: number; end: number };
  peaks?: number[];
  blocked?: { title: string; body: string };
  /** The song is playing so the artist can hear where to start. */
  listening?: boolean;
  /** Back to the top of the song (or of the video). */
  onFromTop: () => void;
  /** Let go of the song strip: the take starts there. */
  onStartAt: (songTime: number) => void;
  /** Sliding along the song strip: play from under the finger. */
  onScrub?: (songTime: number) => void;
  /** While listening: start the take where the song is now. */
  onStartHere?: () => void;
  onListen?: () => void;
  onRecord: () => void;
  onStop: () => void;
  onFlip?: () => void;
  onClose: () => void;
  /** The live camera picture, filling the screen. */
  children: ReactNode;
  /** The scene this take is for, shown at the top. */
  sceneLabel?: string;
  /** The camera look on the viewfinder. Tapping it moves to the next one. */
  lookLabel?: string;
  onLook?: () => void;
  /** Pro camera: frame lines and exposure tools over the picture, under the controls. */
  viewfinder?: ReactNode;
  /** Pro camera: standby or REC with timecode, in place of the plain status line. */
  status?: ReactNode;
  /** Pro camera: scopes, the tool rail and lens sliders, on top of everything. */
  tools?: ReactNode;
  /** Pro camera: recording time left, shown beside the camera look. */
  readout?: string;
}

const RING = 2 * Math.PI * 42;

function wavePath(peaks: number[], height: number): string {
  const w = 1000 / peaks.length;
  let d = '';
  peaks.forEach((p, i) => {
    const h = Math.max(1.5, p * height);
    d += `M${(i * w).toFixed(2)} ${((height - h) / 2).toFixed(2)}h${(w * 0.62).toFixed(2)}v${h.toFixed(2)}h${(-w * 0.62).toFixed(2)}z`;
  });
  return d;
}

function sectionAt(sections: Section[], t: number): Section | undefined {
  return sections.find((s) => t >= s.start && t < s.end) ?? sections[sections.length - 1];
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

/** Everything on top of the camera: the take, the count-in, the prompter, the song and the record button. */
export function RecorderChrome(props: Props) {
  const { phase, beat, song, songTime, from, to, takes, planned, placing, custom, video, peaks, blocked, listening, onFromTop, onStartAt, onScrub, onStartHere, onListen, onRecord, onStop, onFlip, onClose, children, sceneLabel, lookLabel, onLook, viewfinder, status, tools, readout } = props;
  const insets = useSafeAreaInsets();
  const [stripWidth, setStripWidth] = useState(0);
  const [sliding, setSliding] = useState(false);
  const n = takes.length;
  const recording = phase === 'recording';
  const idle = phase === 'idle';
  const t = (idle && !listening && !sliding) || phase === 'opening' || phase === 'blocked' ? from : songTime;
  const at = (x: number) => Math.max(0, Math.min(song.durationSec, (x / Math.max(1, stripWidth)) * song.durationSec));
  const step = barSec(song.bpm);
  // Scenes are the director's layout of a placed video; before that, or outside it, it's just bars of the song.
  const found = sectionAt(song.sections, Math.max(0, t));
  const section = !placing && found?.scene ? found : undefined;
  const bar = barSec(song.bpm);
  const shown = section ?? found;
  const barInSection = shown ? Math.floor(Math.max(0, t - shown.start) / bar) + 1 : 1;
  const barsInSection = shown ? Math.max(1, Math.round((shown.end - shown.start) / bar)) : 1;
  const songBar = Math.max(1, Math.floor((t - song.downbeatSec) / bar) + 1);
  const where = section ? `${section.label}, bar ${Math.min(barInSection, barsInSection)} of ${barsInSection}` : found && !found.scene && found.kind !== 'intro' && found.kind !== 'outro' ? `${found.label}, bar ${Math.min(barInSection, barsInSection)} of ${barsInSection}` : `Bar ${songBar} of the song`;
  const lyric = currentLines(song.lyrics, t);
  const progress = to > from ? Math.max(0, Math.min(1, (t - from) / (to - from))) : 0;
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / song.durationSec) * 100))}%` as const;

  // The record ring breathes on the beat while a take rolls.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (recording) {
      const beatMs = 60000 / song.bpm;
      pulse.set(withRepeat(withSequence(withTiming(1.07, { duration: 70, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: Math.max(80, beatMs - 70), easing: Easing.out(Easing.cubic) })), -1));
    } else {
      cancelAnimation(pulse);
      pulse.set(withTiming(1, { duration: 120 }));
    }
  }, [recording, song.bpm, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));

  return (
    <View style={styles.page}>
      <View style={StyleSheet.absoluteFill}>{children}</View>
      {viewfinder}

      <LinearGradient colors={['rgba(0,0,0,0.72)', 'rgba(0,0,0,0)']} style={[styles.top, { paddingTop: insets.top + space.s }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Press onPress={onClose} accessibilityLabel="Close recorder" style={styles.iconBtn} hitSlop={8} disabled={phase === 'countin' || recording || phase === 'saving'}>
            <X size={24} color={color.chalk} />
          </Press>
          <View style={styles.topText}>
            {status ? (
              status
            ) : recording ? (
              <View style={styles.rec}>
                <View style={styles.recDot} />
                <T v="micro" style={styles.tabular}>{`REC ${formatTime(Math.max(0, songTime - from))}`}</T>
              </View>
            ) : (
              <T v="micro" c="smoke">
                {phase === 'saving' ? 'Saving' : planned ? `${planned.angle}, a shot that cuts well` : 'Any angle you like'}
              </T>
            )}
            <T v="label" numberOfLines={1}>{`Take ${n + 1}`}</T>
          </View>
          {onFlip ? (
            <Press onPress={onFlip} accessibilityLabel="Flip camera" style={styles.iconBtn} hitSlop={8} disabled={!idle}>
              <RefreshCcw size={22} color={idle ? color.chalk : color.ash} />
            </Press>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>
              {sceneLabel || lookLabel || readout ? (
          <View style={styles.pills} pointerEvents="box-none">
            {sceneLabel ? (
              <View style={styles.topPill}>
                <T v="micro" c="chalk">
                  {sceneLabel}
                </T>
              </View>
            ) : null}
            {lookLabel ? (
              <Press onPress={onLook} disabled={!onLook || recording} style={[styles.topPill, styles.lookPill]} accessibilityLabel={`Camera look: ${lookLabel}. Tap for the next camera`}>
                <T v="micro" c="chalk">{`Camera · ${lookLabel}`}</T>
              </Press>
            ) : null}
            {readout ? (
              <View style={styles.topPill} accessibilityLabel={`Recording time left: ${readout}`}>
                <T v="micro" c="smoke" style={styles.tabular}>{`Rem ${readout}`}</T>
              </View>
            ) : null}
          </View>
        ) : null}
</LinearGradient>

      {phase === 'countin' ? (
        <View style={styles.centerFill} pointerEvents="none">
          <Animated.View key={beat} entering={ZoomIn.duration(140)}>
            <T v="display" style={styles.count} accessibilityLiveRegion="assertive">
              {String(beat)}
            </T>
          </Animated.View>
        </View>
      ) : null}

      {phase === 'opening' || phase === 'saving' ? (
        <View style={styles.centerFill} pointerEvents="none">
          <View style={styles.pill}>
            <StageGlyph status="working" size={18} />
            <T v="callout">{phase === 'opening' ? 'Opening the camera' : 'Saving and lining it up with the song'}</T>
          </View>
        </View>
      ) : null}

      {phase === 'blocked' && blocked ? (
        <View style={styles.centerFill}>
          <View style={styles.blocked}>
            <T v="label">{blocked.title}</T>
            <T v="body" c="smoke">
              {blocked.body}
            </T>
          </View>
        </View>
      ) : null}

      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.82)']} locations={[0, 0.42]} style={[styles.bottom, { paddingBottom: insets.bottom + space.l }]} pointerEvents="box-none">
        <View style={styles.column}>
          <View style={styles.prompter} accessibilityLabel="Prompter">
            <T v="micro" c="smoke">
              {where}
            </T>
            {lyric.current ? (
              <T v="heading" style={styles.lyric}>
                {lyric.current.words.map((w, i) => (
                  <T key={i} v="heading" style={[styles.lyric, { color: recording && w.t <= songTime ? color.chalk : color.smoke }]}>
                    {`${w.text} `}
                  </T>
                ))}
              </T>
            ) : (
              <T v="heading" c="smoke" style={styles.lyric}>
                {song.lyrics.length ? 'Instrumental' : found?.kind === 'hook' ? 'Give the hook everything' : 'Perform it like the room is full'}
              </T>
            )}
            {lyric.next ? (
              <T v="callout" c="ash" numberOfLines={1}>
                {lyric.next.words.map((w) => w.text).join(' ')}
              </T>
            ) : null}
          </View>

          {idle && placing ? (
            <View style={styles.ask}>
              <T v="label">Where do you start?</T>
              <T v="caption" c="smoke">
                {listening || sliding ? 'Slide to move through the song. Let go, or hit Start here, where you want to come in.' : 'Slide along the song while it plays and let go where you come in. The video starts there.'}
              </T>
            </View>
          ) : null}

          <View style={styles.songRow}>
            {/* A scrubber: press and slide and the song plays from under your finger; where you let go is the start. */}
            <View
              style={[styles.strip, idle && styles.stripLive]}
              onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => idle}
              onMoveShouldSetResponder={() => idle}
              onResponderTerminationRequest={() => false}
              onResponderGrant={(e) => {
                setSliding(true);
                onScrub?.(at(e.nativeEvent.locationX));
              }}
              onResponderMove={(e) => onScrub?.(at(e.nativeEvent.locationX))}
              onResponderRelease={(e) => {
                setSliding(false);
                onStartAt(at(e.nativeEvent.locationX));
              }}
              onResponderTerminate={() => setSliding(false)}
              accessibilityRole="adjustable"
              accessibilityLabel={`Take starts at ${formatTime(from)}. Slide along the song to hear it and let go where you come in.`}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) => onStartAt(from + (e.nativeEvent.actionName === 'increment' ? step : -step))}>
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {video ? <View style={[styles.stripVideo, { left: pct(video.start), width: pct(video.end - video.start) }]} /> : null}
                {placing ? null : song.sections.filter((s) => s.scene).map((s) => <View key={s.id} style={[styles.stripSection, { left: pct(s.start), width: pct(s.end - s.start) }]} />)}
                {peaks?.length ? (
                  <View style={StyleSheet.absoluteFill}>
                    <Svg width="100%" height="100%" viewBox="0 0 1000 28" preserveAspectRatio="none">
                      <Path d={wavePath(peaks, 28)} fill={color.chalk} opacity={0.5} />
                    </Svg>
                  </View>
                ) : null}
                <View style={[styles.stripRange, { left: pct(from), width: pct(to - from) }]} />
                <View style={[styles.stripPlayed, !recording && styles.stripHeard, { left: pct(Math.min(from, t)), width: pct(Math.abs(t - from)) }]} />
                <View style={[styles.stripStart, { left: pct(from) }]} />
                <View style={[styles.stripHead, { left: pct(t) }]} />
              </View>
            </View>
            {/* Picking the first start, the whole song is in play; after that, the take runs to the end of the video. */}
            <T v="micro" c="smoke" style={styles.tabular}>{`${formatTime(t)} / ${formatTime(placing && idle ? song.durationSec : to)}`}</T>
          </View>

          {idle ? (
            <View style={styles.pickRow}>
              {onListen ? (
                <Press onPress={onListen} style={[styles.listen, listening && styles.scopeOn]} accessibilityLabel={listening ? 'Stop listening' : `Hear it from ${formatTime(from)}`}>
                  {listening ? <Pause size={16} color={color.stage} /> : <Play size={16} color={color.chalk} />}
                  <T v="caption" style={{ color: listening ? color.stage : color.chalk }}>
                    {listening ? 'Stop' : 'Listen'}
                  </T>
                </Press>
              ) : null}
              {listening && onStartHere ? (
                <Press onPress={onStartHere} style={[styles.scope, styles.startHere]} accessibilityLabel={`Start here, at ${formatTime(songTime)}`}>
                  <T v="caption" c="ink">
                    Start here
                  </T>
                </Press>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopes} accessibilityRole="radiogroup" accessibilityLabel="Where this take starts">
                <Press onPress={onFromTop} style={[styles.scope, !custom && styles.scopeOn]} accessibilityRole="radio" accessibilityState={{ selected: !custom }} accessibilityLabel={placing ? 'Start from the top of the song' : `Start from the top of the video, ${formatTime(video?.start ?? 0)}`}>
                  <T v="caption" style={{ color: !custom ? color.stage : color.chalk }}>
                    From the top
                  </T>
                </Press>
                {custom ? (
                  <View style={[styles.scope, styles.scopeOn]} accessibilityRole="radio" accessibilityState={{ selected: true }}>
                    <T v="caption" style={{ color: color.stage }}>{`From ${formatTime(from)}`}</T>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.controls}>
            <View style={styles.side}>
              {n > 0 ? (
                <View style={styles.reel} accessibilityLabel={`${n} ${n === 1 ? 'take' : 'takes'} in`}>
                  {takes.slice(-3).map((take) => (
                    <View key={take.id} style={styles.reelThumb}>
                      <Frame kind="room" thumb={take.thumb} relit={false} rounded={false} />
                    </View>
                  ))}
                </View>
              ) : (
                <T v="caption" c="smoke" style={styles.center}>
                  {phase === 'countin' ? 'Get ready' : recording ? 'Tap to stop' : 'Tap to record'}
                </T>
              )}
            </View>
            <Animated.View style={pulseStyle}>
              <Press
                onPress={idle ? onRecord : recording ? onStop : undefined}
                disabled={!idle && !recording}
                accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
                style={styles.recordBtn}>
                <Svg width={92} height={92} style={StyleSheet.absoluteFill}>
                  <Circle cx={46} cy={46} r={42} stroke="rgba(242,240,236,0.35)" strokeWidth={4} fill="none" />
                  {recording ? (
                    <Circle cx={46} cy={46} r={42} stroke={color.chalk} strokeWidth={4} fill="none" strokeDasharray={`${RING * progress} ${RING}`} strokeLinecap="round" transform="rotate(-90 46 46)" />
                  ) : (
                    <Circle cx={46} cy={46} r={42} stroke={idle ? color.chalk : color.ash} strokeWidth={4} fill="none" />
                  )}
                </Svg>
                <View style={[styles.recordInner, recording && styles.recordStop, !idle && !recording && styles.recordOff]} />
              </Press>
            </Animated.View>
            <View style={styles.side}>
              {idle && n > 0 ? (
                <Press onPress={onClose} style={styles.done} accessibilityLabel="Done recording">
                  <T v="callout">Done</T>
                </Press>
              ) : n > 0 ? (
                <T v="caption" c="smoke" style={styles.center}>
                  {phase === 'countin' ? 'Get ready' : recording ? 'Tap to stop' : ''}
                </T>
              ) : null}
            </View>
          </View>
        </View>
      </LinearGradient>
      {tools}
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', justifyContent: 'center', gap: space.s, marginTop: space.s, flexWrap: 'wrap' },
  topPill: { paddingHorizontal: space.m, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
  lookPill: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  page: {
    flex: 1,
    backgroundColor: color.stage,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.s,
    paddingBottom: space.xxl,
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
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  centerFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: gutter,
  },
  count: {
    fontSize: 200,
    lineHeight: 200,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 24,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderRadius: radius.pill,
    backgroundColor: color.scrim,
  },
  blocked: {
    maxWidth: 420,
    gap: space.s,
    padding: space.xl,
    borderRadius: radius.l,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: gutter,
    paddingTop: 72,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth,
    gap: space.m,
  },
  prompter: {
    gap: 2,
    minHeight: 76,
    justifyContent: 'flex-end',
  },
  lyric: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  strip: {
    flex: 1,
    height: 30,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(242,240,236,0.08)',
  },
  stripLive: {
    // Taller while picking, so a thumb can slide it.
    height: 44,
  },
  stripStart: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    marginLeft: -2,
    borderRadius: 2,
    backgroundColor: color.chalk,
  },
  stripSection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.6)',
  },
  stripVideo: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(242,240,236,0.1)',
  },
  ask: {
    gap: 2,
  },
  startHere: {
    backgroundColor: color.accent,
    borderColor: color.accent,
  },
  stripRange: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(242,240,236,0.55)',
    borderRadius: 5,
  },
  stripPlayed: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,69,58,0.35)',
  },
  stripHeard: {
    // REC red is for recording only; listening shows in chalk.
    backgroundColor: 'rgba(242,240,236,0.22)',
  },
  stripHead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: color.chalk,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
  },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(242,240,236,0.4)',
  },
  scopes: {
    flexDirection: 'row',
    gap: space.s,
  },
  scope: {
    minHeight: 36,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(242,240,236,0.4)',
    justifyContent: 'center',
  },
  scopeOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  reel: {
    flexDirection: 'row',
    gap: 4,
  },
  reelThumb: {
    width: 40,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(242,240,236,0.4)',
  },
  done: {
    minHeight: 44,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.chalk,
    justifyContent: 'center',
  },
  recordBtn: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: color.rec,
  },
  recordStop: {
    width: 32,
    height: 32,
    borderRadius: 7,
  },
  recordOff: {
    backgroundColor: color.rig,
  },
});
