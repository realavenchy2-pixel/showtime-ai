import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Check, Lightbulb, WandSparkles } from '@/components/icons';
import { Press } from '@/components/Press';
import { Header, Screen } from '@/components/Screen';
import { SongForm, songChoiceReady, type SongChoice } from '@/components/SongForm';
import { T } from '@/components/T';
import { Toggle } from '@/components/Toggle';
import { useApp } from '@/engine/store';
import type { CreativePath } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space } from '@/theme/tokens';

/** New video: the song, then how you want to work. */
export default function NewVideoScreen() {
  const createProject = useApp((s) => s.createProject);
  const [choice, setChoice] = useState<SongChoice>({ formats: ['16:9', '9:16'] });
  const [step, setStep] = useState<'song' | 'path'>('song');
  const [path, setPath] = useState<CreativePath>('ai');
  const [approveEach, setApproveEach] = useState(false);
  const ready = songChoiceReady(choice);

  const start = () => {
    if (!songChoiceReady(choice)) return;
    const id = createProject({ song: choice.song, formats: choice.formats, path, approveEachStep: path === 'ai' && approveEach });
    router.replace(`/project/${id}`);
  };

  if (step === 'path') {
    return (
      <Screen header={<Header title="Pick your path" kicker="New video" onBack={() => setStep('song')} />} footer={<Button label="Let's go" onPress={start} />}>
        <T v="body" c="smoke">
          You can change this any time, even halfway through.
        </T>
        <PathCard
          icon={WandSparkles}
          title="Let AI direct"
          body="The director listens to your song, pitches the ideas, plans every scene and runs the whole thing. You just perform."
          selected={path === 'ai'}
          onPress={() => setPath('ai')}>
          {path === 'ai' ? (
            <View style={styles.toggleRow}>
              <View style={styles.flex}>
                <T v="callout">{"I'll approve each step"}</T>
                <T v="caption" c="smoke">
                  The director stops and waits for you after the plan, the cut, the switch and the edit.
                </T>
              </View>
              <Toggle value={approveEach} onChange={setApproveEach} label="I'll approve each step" />
            </View>
          ) : null}
        </PathCard>
        <PathCard
          icon={Lightbulb}
          title="Work with my vision"
          body="You already see the video in your head. Tell the director, it fills in the details, and you agree on the plan together. Hands-on the whole way."
          selected={path === 'vision'}
          onPress={() => setPath('vision')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header title="New video" kicker="Step 1 of 2" close />}
      footer={
        <>
          <Button label="Next" disabled={!ready} onPress={() => setStep('path')} />
          {!ready ? (
            <T v="caption" c="ash" style={{ textAlign: 'center' }}>
              Pick a song and at least one format.
            </T>
          ) : null}
        </>
      }>
      <SongForm value={choice} onChange={setChoice} />
    </Screen>
  );
}

function PathCard({
  icon: Icon,
  title,
  body,
  selected,
  onPress,
  children,
}: {
  icon: typeof WandSparkles;
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Press
      onPress={() => {
        haptic.select();
        onPress();
      }}
      scaleTo={0.99}
      style={[styles.card, selected && styles.cardOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${body}`}>
      <View style={styles.cardTop}>
        <View style={[styles.icon, selected && styles.iconOn]}>
          <Icon size={20} color={selected ? color.ink : color.chalk} />
        </View>
        <T v="title" style={styles.flex}>
          {title}
        </T>
        {selected ? <Check size={20} color={color.accent} strokeWidth={3} /> : null}
      </View>
      <T v="body" c="smoke">
        {body}
      </T>
      {children}
    </Press>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: space.m,
    padding: space.l,
    borderRadius: radius.l,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  cardOn: { borderColor: color.accent, backgroundColor: color.flat },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.rig },
  iconOn: { backgroundColor: color.accent },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingTop: space.m,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
});
