import { Check, Monitor, Music, Smartphone, Upload, type LucideIcon } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { formatTime } from '@/engine/director';
import { SAMPLE_TRACKS, type SampleTrack } from '@/engine/samples';
import type { Format, Vibe } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

import { Press } from './Press';
import { SectionTitle } from './Screen';
import { T } from './T';
import { showToast } from './Toast';

export const VIBES: Vibe[] = ['Drill', 'Trap', 'Melodic', 'Boom bap', 'Dark'];

export interface SongChoice {
  track?: SampleTrack;
  vibe?: Vibe;
  formats: Format[];
}

/** Stage 1: the track, the vibe and where the video gets posted. */
export function SongForm({ value, onChange }: { value: SongChoice; onChange: (v: SongChoice) => void }) {
  const toggleFormat = (f: Format) => {
    haptic.select();
    const has = value.formats.includes(f);
    onChange({ ...value, formats: has ? value.formats.filter((x) => x !== f) : [...value.formats, f] });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.block}>
        <SectionTitle detail="Your master track. The finished video uses this audio, never the phone mic.">Song</SectionTitle>
        <Press
          onPress={() => showToast('Uploading your own track comes in the next build. Pick a sample for now.')}
          scaleTo={0.99}
          style={styles.upload}
          accessibilityLabel="Upload a song">
          <Upload size={20} color={color.chalk} />
          <View style={styles.flex}>
            <T v="callout">Upload a song</T>
            <T v="caption" c="smoke">
              MP3 or WAV, up to 6 minutes
            </T>
          </View>
        </Press>
        {SAMPLE_TRACKS.map((t) => {
          const selected = value.track?.id === t.id;
          return (
            <Press
              key={t.id}
              onPress={() => {
                haptic.select();
                onChange({ ...value, track: t });
              }}
              scaleTo={0.99}
              style={[styles.option, selected && styles.selected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t.title}, ${formatTime(t.durationSec)}, ${t.bpm} BPM`}>
              <Music size={20} color={selected ? color.chalk : color.smoke} />
              <View style={styles.flex}>
                <T v="callout">{t.title}</T>
                <T v="caption" c="smoke">{`${formatTime(t.durationSec)} long, ${t.bpm} BPM`}</T>
              </View>
              {selected ? <Check size={20} color={color.chalk} /> : null}
            </Press>
          );
        })}
      </View>

      <View style={styles.block}>
        <SectionTitle detail="Sets the default grade, pacing and effects. You can change it later.">Vibe</SectionTitle>
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
        <SectionTitle detail="Each format is rendered from the same edit, laid out for its frame.">Where it goes</SectionTitle>
        <View style={styles.formats}>
          <FormatCard icon={Monitor} title="YouTube" detail="16:9" selected={value.formats.includes('16:9')} onPress={() => toggleFormat('16:9')} />
          <FormatCard icon={Smartphone} title="Reels and TikTok" detail="9:16" selected={value.formats.includes('9:16')} onPress={() => toggleFormat('9:16')} />
        </View>
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
  return !!v.track && !!v.vibe && v.formats.length > 0;
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
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairlineStrong,
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
});
