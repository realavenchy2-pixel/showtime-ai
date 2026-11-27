import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Check, ImagePlus, Lock, RefreshCcw } from '@/components/icons';
import {
  isLocationLocked,
  locationRef,
  lockLocation,
  pickLocationOption,
  REF_QUALITY_NOTE,
  reviseLocation,
  sceneName,
  setOwnLocation,
  unlockLocation,
  type Scene,
} from '@/engine/production';
import { useApp } from '@/engine/store';
import type { Project, RefImage } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { makeLocations } from '@/live/session';
import { pickImage } from '@/media/pick';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Frame } from '../Frame';
import { Press } from '../Press';
import { SetGuide3D } from '../SetGuide3D';
import { ShotPicker } from '../ShotPicker';
import { T } from '../T';
import { showToast } from '../Toast';

/** Stand-ins look different per option until real pictures come back from the studio server. */
const TINTS = ['transparent', 'rgba(40,90,255,0.18)', 'rgba(255,140,40,0.18)', 'rgba(160,40,255,0.18)', 'rgba(0,200,160,0.16)'];

/**
 * One scene's background, chosen before the shoot. The options never show the artist: the one
 * picked and locked here is exactly where they get switched into. Type a change to get new options.
 */
export function LocationCard({ project, scene, lyrics, showGuide = false }: { project: Project; scene: Scene; lyrics?: string; showGuide?: boolean }) {
  const apply = useApp((s) => s.apply);
  const [note, setNote] = useState('');
  const picked = locationRef(scene.look);
  const options = scene.look?.options?.length ? scene.look.options : picked ? [picked] : [];
  const locked = isLocationLocked(project, scene.index);
  const editable = project.shots.length === 0 && !project.job && !locked;
  const kind = scene.look && scene.look.location !== 'custom' ? scene.look.location : 'darkVoid';
  const guide = project.guides?.[scene.index];

  const art = (o: RefImage, i: number) =>
    o.uri ? (
      <Image source={{ uri: o.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
    ) : (
      <>
        <Frame kind={kind} noArtist relit rounded={false} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: TINTS[i % TINTS.length] }]} />
      </>
    );

  return (
    <View style={[styles.card, locked && styles.cardLocked]}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <T v="label">{sceneName(scene)}</T>
          {lyrics ? (
            <T v="caption" c="smoke" numberOfLines={2}>{`"${lyrics}"`}</T>
          ) : null}
        </View>
        {locked ? (
          <View style={styles.lockedPill}>
            <Lock size={12} color={color.ink} />
            <T v="micro" c="ink">
              Locked
            </T>
          </View>
        ) : null}
      </View>

      {scene.look?.prompt ? (
        <T v="caption" c="ash" numberOfLines={3}>
          {scene.look.prompt}
        </T>
      ) : null}

      {guide ? (
        <View style={styles.shot}>
          <ShotPicker project={project} scene={scene} guide={guide} />
        </View>
      ) : null}

      <View style={styles.grid}>
        {options.map((o, i) => {
          const on = o.id === picked?.id;
          return (
            <Press
              key={o.id}
              disabled={!editable}
              onPress={() => {
                haptic.select();
                apply(project.id, (p) => pickLocationOption(p, scene.index, o.id));
              }}
              scaleTo={0.98}
              style={[styles.option, options.length === 1 && styles.optionWide, on && styles.optionOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Option ${i + 1}${o.source === 'upload' ? ', your image' : ''}`}>
              {art(o, i)}
              <View style={styles.badge}>
                <T v="micro" c="chalk">
                  {o.source === 'upload' ? 'Yours' : `Option ${i + 1}`}
                </T>
              </View>
              {on ? (
                <View style={styles.check}>
                  <Check size={12} color={color.ink} strokeWidth={3} />
                </View>
              ) : null}
            </Press>
          );
        })}
      </View>

      <View style={styles.note}>
        <T v="caption" c="chalk">
          {REF_QUALITY_NOTE}
        </T>
      </View>

      {editable ? (
        <>
          <View style={styles.reviseRow}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Type a change: rain, more neon"
              placeholderTextColor={color.ash}
              style={styles.input}
              accessibilityLabel="Type a change for new options"
              onSubmitEditing={() => {
                if (!note.trim()) return;
                apply(project.id, (p) => reviseLocation(p, scene.index, note));
                makeLocations(project.id);
                setNote('');
              }}
            />
            <Press
              onPress={() => {
                haptic.select();
                apply(project.id, (p) => reviseLocation(p, scene.index, note || undefined));
                makeLocations(project.id);
                setNote('');
              }}
              style={styles.iconBtn}
              accessibilityLabel={note.trim() ? 'Make new options with this change' : 'Make new options'}>
              <RefreshCcw size={18} color={color.chalk} />
            </Press>
            <Press
              onPress={async () => {
                try {
                  const img = await pickImage();
                  if (img) apply(project.id, (p) => setOwnLocation(p, scene.index, { label: img.name, uri: img.uri, mediaId: img.mediaId }));
                } catch {
                  showToast('That image could not be added.');
                }
              }}
              style={styles.iconBtn}
              accessibilityLabel="Use my own image">
              <ImagePlus size={18} color={color.chalk} />
            </Press>
          </View>
          <Button
            label="Lock this background"
            icon={Lock}
            disabled={!picked}
            onPress={() => {
              haptic.confirm();
              apply(project.id, (p) => lockLocation(p, scene.index));
            }}
          />
        </>
      ) : locked && project.shots.length === 0 ? (
        <Button label="Unlock to change it" variant="quiet" onPress={() => apply(project.id, (p) => unlockLocation(p, scene.index))} />
      ) : null}


      {showGuide && guide ? (
        <View style={styles.guide}>
          <T v="heading">Set guide</T>
          <SetGuide3D guide={guide} height={200} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: space.m, padding: space.l, borderRadius: radius.l, backgroundColor: color.curtain, borderWidth: 1, borderColor: color.hairline },
  cardLocked: { borderColor: color.hairlineStrong },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  lockedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.s, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: color.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  option: { width: '48.5%', aspectRatio: 16 / 9, borderRadius: radius.m, overflow: 'hidden', backgroundColor: color.flat, borderWidth: 2, borderColor: 'transparent' },
  optionWide: { width: '100%' },
  optionOn: { borderColor: color.accent },
  badge: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.s, backgroundColor: color.scrim },
  check: { position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  note: { padding: space.m, borderRadius: radius.m, backgroundColor: color.accentSoft, borderWidth: 1, borderColor: 'rgba(250, 26, 85, 0.35)' },
  reviseRow: { flexDirection: 'row', gap: space.s, alignItems: 'center' },
  input: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 44, paddingHorizontal: space.m, borderRadius: radius.m, backgroundColor: color.flat, borderWidth: 1, borderColor: color.hairline, color: color.chalk, fontSize: 15 },
  iconBtn: { width: 44, height: 44, borderRadius: radius.m, backgroundColor: color.flat, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.hairline },
  guide: { gap: space.s },
  shot: { padding: space.m, borderRadius: radius.m, backgroundColor: color.flat },
});
