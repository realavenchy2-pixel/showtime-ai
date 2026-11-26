import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { CameraLookPicker } from '@/components/CameraLookPicker';
import { Film } from '@/components/icons';
import { LoopVideo } from '@/components/LoopVideo';
import { Press } from '@/components/Press';
import { Header, Screen, SectionTitle } from '@/components/Screen';
import { BeforeAfter } from '@/components/showcase/BeforeAfter';
import { T } from '@/components/T';
import { REF_QUALITY_NOTE } from '@/engine/production';
import { SAMPLE_IDS } from '@/engine/sampleProjects';
import { useApp } from '@/engine/store';
import type { CameraLookId } from '@/engine/types';
import { FINISHED_SNIPPETS, SWITCH_EXAMPLES } from '@/lib/examples';
import { color, radius, space } from '@/theme/tokens';

/** See it before you pay: real snippets, real before-and-afters, the camera looks and a demo project. */
export default function ExamplesScreen() {
  const [look, setLook] = useState<CameraLookId>('fx3');
  const markWelcomed = useApp((s) => s.markWelcomed);
  return (
    <Screen
      header={<Header title="What it can do" fallback="/welcome" />}
      footer={
        <Button
          label="Get started"
          onPress={() => {
            markWelcomed();
            router.replace('/paywall');
          }}
        />
      }>
      <View style={styles.block}>
        <T v="title">See it before you pay</T>
        <T v="body" c="smoke">
          Every example here is real: one phone video shot in a bedroom, switched by Showtime.
        </T>
      </View>

      <View style={styles.block}>
        <SectionTitle detail="Snippets from finished Showtime videos.">Finished videos</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {FINISHED_SNIPPETS.map((s) => (
            <View key={s.id} style={styles.snippet}>
              <LoopVideo source={s.source} style={StyleSheet.absoluteFill} />
              <View style={styles.snippetLabel}>
                <T v="micro">{s.title}</T>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {SWITCH_EXAMPLES.map((ex) => (
        <View key={ex.id} style={styles.block}>
          <SectionTitle detail={ex.line}>{`Switch the location: ${ex.title}`}</SectionTitle>
          <BeforeAfter before={ex.before} after={ex.after} />
          <View style={styles.refRow}>
            <Image source={ex.ref} style={styles.ref} contentFit="cover" />
            <View style={styles.flex}>
              <T v="callout">Built from this reference image</T>
              <T v="caption" c="smoke">
                {REF_QUALITY_NOTE.split('.')[0]}.
              </T>
            </View>
          </View>
          <View style={styles.wipe}>
            <LoopVideo source={ex.wipe} style={StyleSheet.absoluteFill} />
          </View>
        </View>
      ))}

      <View style={styles.block}>
        <SectionTitle detail="Each one is modeled on a real cinema camera. Tap through them on a raw frame.">Pick a camera</SectionTitle>
        <CameraLookPicker value={look} onChange={setLook} />
      </View>

      <Press onPress={() => router.push(`/project/${SAMPLE_IDS.windy}`)} style={styles.demo} accessibilityLabel="Open the demo project">
        <Film size={22} color={color.accent} />
        <View style={styles.flex}>
          <T v="callout">Open the demo project</T>
          <T v="caption" c="smoke">
            Tap through a finished project step by step. No credits used.
          </T>
        </View>
      </Press>

      <View style={styles.note}>
        <T v="caption">Every video shows its full price before anything renders.</T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: space.m },
  row: { gap: space.m },
  snippet: { width: 120, aspectRatio: 9 / 16, borderRadius: radius.m, overflow: 'hidden', backgroundColor: color.flat },
  snippetLabel: { position: 'absolute', left: space.s, bottom: space.s, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.s, backgroundColor: color.scrim },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  ref: { width: 96, height: 54, borderRadius: radius.s },
  wipe: { width: '60%', alignSelf: 'center', aspectRatio: 9 / 16, borderRadius: radius.l, overflow: 'hidden' },
  demo: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l, borderRadius: radius.l, backgroundColor: color.curtain, borderWidth: 1, borderColor: color.hairline },
  note: { padding: space.m, borderRadius: radius.m, backgroundColor: color.accentSoft },
});
