import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Check, Monitor, Music, Smartphone, Upload, type LucideIcon } from '@/components/icons';
import { formatTime } from '@/engine/director';
import { DEMO_TRACKS, demoDuration, songFromDemo, songFromImport } from '@/engine/samples';
import type { Format, Section, SectionKind, Song, Vibe } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { sectionsForTempo } from '@/media/analyze';
import { pickSong } from '@/media/pick';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { SectionTitle } from './Screen';
import { StageGlyph } from './StageGlyph';
import { T } from './T';
import { showToast } from './Toast';

export const VIBES: Vibe[] = ['Drill', 'Trap', 'Melodic', 'Boom bap', 'Dark'];

export interface SongChoice {
  song?: Song;
  vibe?: Vibe;
  formats: Format[];
}

const KINDS: SectionKind[] = ['verse', 'hook', 'bridge', 'intro', 'outro'];

/** Names sections by kind, counting the verses. */
function relabel(sections: Section[]): Section[] {
  let verse = 0;
  return sections.map((s) => ({
    ...s,
    label: s.kind === 'verse' ? `Verse ${++verse}` : s.kind === 'hook' ? 'Hook' : s.kind === 'intro' ? 'Intro' : s.kind === 'outro' ? 'Outro' : 'Bridge',
  }));
}

function wavePath(peaks: number[], height: number): string {
  const w = 1000 / peaks.length;
  let d = '';
  peaks.forEach((p, i) => {
    const h = Math.max(1.5, p * height);
    d += `M${(i * w).toFixed(2)} ${((height - h) / 2).toFixed(2)}h${(w * 0.62).toFixed(2)}v${h.toFixed(2)}h${(-w * 0.62).toFixed(2)}z`;
  });
  return d;
}

/** Stage 1: the track, the vibe and where the video gets posted. */
export function SongForm({ value, onChange }: { value: SongChoice; onChange: (v: SongChoice) => void }) {
  const [busy, setBusy] = useState(false);
  const [needsTempo, setNeedsTempo] = useState(false);
  const song = value.song;
  const imported = song?.source === 'import' ? song : undefined;

  const toggleFormat = (f: Format) => {
    haptic.select();
    const has = value.formats.includes(f);
    onChange({ ...value, formats: has ? value.formats.filter((x) => x !== f) : [...value.formats, f] });
  };

  const upload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickSong();
      if (!picked) return;
      if (picked.durationSec > 0 && picked.durationSec < 10) {
        showToast('That file is under 10 seconds. Pick the full song.');
        return;
      }
      const unsure = picked.bpm <= 0 || picked.confidence < 0.2;
      const bpm = picked.bpm > 0 ? picked.bpm : 120;
      const sections = !unsure && picked.sections?.length ? picked.sections : sectionsForTempo(bpm, picked.downbeatSec, picked.durationSec);
      onChange({ ...value, song: songFromImport({ ...picked, bpm, sections }, true) });
      setNeedsTempo(unsure);
      haptic.success();
    } catch {
      showToast('That file could not be read. Try an MP3, WAV or M4A.');
    } finally {
      setBusy(false);
    }
  };

  const setTempo = (bpm: number) => {
    if (!imported) return;
    onChange({ ...value, song: { ...imported, bpm, sections: sectionsForTempo(bpm, imported.downbeatSec, imported.durationSec) } });
    setNeedsTempo(false);
  };

  const cycleSection = (id: string) => {
    if (!imported) return;
    haptic.select();
    const sections = relabel(imported.sections.map((s) => (s.id === id ? { ...s, kind: KINDS[(KINDS.indexOf(s.kind) + 1) % KINDS.length] } : s)));
    onChange({ ...value, song: { ...imported, sections } });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.block}>
        <SectionTitle detail="Your master track. The finished video uses this audio, never the phone mic.">Song</SectionTitle>
        <Press onPress={upload} scaleTo={0.99} style={[styles.upload, imported && styles.selected]} accessibilityLabel={imported ? 'Upload a different song' : 'Upload a song'}>
          {busy ? <StageGlyph status="working" size={20} /> : <Upload size={20} color={color.chalk} />}
          <View style={styles.flex}>
            <T v="callout" numberOfLines={1}>
              {busy ? 'Mapping your track' : imported ? imported.title : 'Upload a song'}
            </T>
            <T v="caption" c="smoke">
              {busy ? 'Finding the tempo, bars and sections' : imported ? `${formatTime(imported.durationSec)} long, ${Math.round(imported.bpm)} BPM. Tap to pick another.` : 'MP3, WAV or M4A'}
            </T>
          </View>
          {imported && !busy ? <Check size={20} color={color.chalk} /> : null}
        </Press>

        {imported ? (
          <View style={styles.mapped}>
            {imported.peaks?.length ? (
              <View style={styles.wave}>
                <Svg width="100%" height="100%" viewBox="0 0 1000 40" preserveAspectRatio="none">
                  <Path d={wavePath(imported.peaks, 40)} fill={color.chalk} opacity={0.55} />
                </Svg>
              </View>
            ) : null}
            {needsTempo ? (
              <TapTempo onDone={setTempo} />
            ) : (
              <>
                <View style={styles.sections}>
                  {imported.sections.map((s) => (
                    <Press
                      key={s.id}
                      onPress={() => cycleSection(s.id)}
                      style={[styles.section, s.kind === 'hook' && styles.sectionHook]}
                      accessibilityLabel={`${s.label}, starts at ${formatTime(s.start)}. Tap to change what it is.`}>
                      <T v="micro" c={s.kind === 'hook' ? 'chalk' : 'smoke'} numberOfLines={1}>
                        {s.label}
                      </T>
                      <T v="micro" c="ash">
                        {formatTime(s.start)}
                      </T>
                    </Press>
                  ))}
                </View>
                <T v="caption" c="ash">
                  My first read of the song. Tap a part to change what it is. Hooks get the fastest cuts and the hardest effects.
                </T>
                <Press onPress={() => setNeedsTempo(true)} style={styles.link} accessibilityLabel="Tempo looks wrong, tap it in">
                  <T v="caption" c="smoke">
                    Tempo off? Tap it in
                  </T>
                </Press>
              </>
            )}
          </View>
        ) : null}

        <T v="micro" c="ash" style={styles.or}>
          Or try a demo beat
        </T>
        {DEMO_TRACKS.map((t) => {
          const selected = song?.source === 'demo' && song.audioId === t.id;
          return (
            <Press
              key={t.id}
              onPress={() => {
                haptic.select();
                setNeedsTempo(false);
                onChange({ ...value, song: songFromDemo(t, true) });
              }}
              scaleTo={0.99}
              style={[styles.option, selected && styles.selected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t.title}, ${formatTime(demoDuration(t))}, ${t.bpm} BPM`}>
              <Music size={20} color={selected ? color.chalk : color.smoke} />
              <View style={styles.flex}>
                <T v="callout">{t.title}</T>
                <T v="caption" c="smoke">{`${formatTime(demoDuration(t))} long, ${t.bpm} BPM`}</T>
              </View>
              {selected ? <Check size={20} color={color.chalk} /> : null}
            </Press>
          );
        })}
      </View>

      <View style={styles.block}>
        <SectionTitle detail="Sets the grade, the pacing and the effects pack. You can change it later.">Vibe</SectionTitle>
        <View style={styles.chips}>
          {VIBES.map((v) => {
            const selected = value.vibe === v;
            return (
              <Press
                key={v}
                onPress={() => {
                  haptic.select();
                  onChange({ ...value, vibe: v });
                }}
                style={[styles.chip, selected && styles.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={v}>
                <T v="callout" style={{ color: selected ? color.stage : color.chalk }}>
                  {v}
                </T>
              </Press>
            );
          })}
        </View>
      </View>

      <View style={styles.block}>
        <SectionTitle detail="Each format is rendered from the same edit.">Where it goes</SectionTitle>
        <View style={styles.formats}>
          <FormatCard icon={Monitor} title="YouTube" detail="16:9" selected={value.formats.includes('16:9')} onPress={() => toggleFormat('16:9')} />
          <FormatCard icon={Smartphone} title="Reels and TikTok" detail="9:16" selected={value.formats.includes('9:16')} onPress={() => toggleFormat('9:16')} />
        </View>
      </View>
    </View>
  );
}

/** Tap along to the beat: after six taps the tempo is the average gap between them. */
function TapTempo({ onDone }: { onDone: (bpm: number) => void }) {
  const taps = useRef<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [count, setCount] = useState(0);

  const tap = () => {
    const now = Date.now();
    const list = taps.current;
    // A long pause starts a fresh count.
    if (list.length && now - list[list.length - 1] > 2000) list.length = 0;
    list.push(now);
    if (list.length > 12) list.shift();
    haptic.beat();
    setCount(list.length);
    if (list.length >= 4) {
      const gaps = list.slice(1).map((t, i) => t - list[i]);
      const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      setBpm(Math.round(60000 / avg));
    }
  };

  return (
    <View style={styles.tapWrap}>
      <T v="caption" c="smoke">
        I couldn’t lock onto the tempo. Play the song and tap along to the beat.
      </T>
      <View style={styles.tapRow}>
        <Press onPress={tap} style={styles.tapPad} accessibilityLabel="Tap on every beat">
          <T v="title">{bpm ? `${bpm}` : 'Tap'}</T>
          <T v="micro" c="ash">
            {bpm ? 'BPM' : `${Math.max(0, 4 - count)} more`}
          </T>
        </Press>
        <Press onPress={() => bpm && onDone(bpm)} disabled={!bpm} style={[styles.tapUse, !bpm && styles.tapUseOff]} accessibilityLabel="Use this tempo">
          <T v="callout" c={bpm ? 'chalk' : 'ash'}>
            Use this tempo
          </T>
        </Press>
      </View>
    </View>
  );
}

function FormatCard({ icon: Icon, title, detail, selected, onPress }: { icon: LucideIcon; title: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      style={[styles.format, selected && styles.selected]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${detail}`}>
      <View style={styles.formatTop}>
        <Icon size={22} color={selected ? color.chalk : color.smoke} />
        {selected ? <Check size={18} color={color.chalk} /> : null}
      </View>
      <T v="callout">{title}</T>
      <T v="caption" c="smoke">
        {detail}
      </T>
    </Press>
  );
}

export function songChoiceReady(v: SongChoice): v is Required<SongChoice> {
  return !!v.song && !!v.vibe && v.formats.length > 0;
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xl,
  },
  block: {
    gap: space.s,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  upload: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairlineStrong,
  },
  mapped: {
    gap: space.s,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  wave: {
    height: 44,
  },
  sections: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  section: {
    minHeight: 44,
    paddingHorizontal: space.m,
    justifyContent: 'center',
    borderRadius: radius.s,
    backgroundColor: color.flat,
  },
  sectionHook: {
    backgroundColor: color.rig,
  },
  link: {
    minHeight: 32,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  or: {
    marginTop: space.s,
  },
  option: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  selected: {
    borderStyle: 'solid',
    borderColor: color.chalk,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: color.chalk,
    borderColor: color.chalk,
  },
  formats: {
    flexDirection: 'row',
    gap: space.m,
  },
  format: {
    flex: 1,
    minHeight: 112,
    padding: space.l,
    gap: 2,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  formatTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space.s,
  },
  tapWrap: {
    gap: space.s,
  },
  tapRow: {
    flexDirection: 'row',
    gap: space.m,
    alignItems: 'stretch',
  },
  tapPad: {
    width: 120,
    height: 84,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapUse: {
    flex: 1,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.chalk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapUseOff: {
    borderColor: color.hairline,
  },
});
