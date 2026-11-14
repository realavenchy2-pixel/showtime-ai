import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionBlock } from '@/components/chat/ActionBlock';
import { Composer } from '@/components/chat/Composer';
import { DirectorLine, SystemLine, UserBubble } from '@/components/chat/Messages';
import { Dialog } from '@/components/Dialog';
import { PlayerView } from '@/components/player/PlayerView';
import { Press } from '@/components/Press';
import { Header } from '@/components/Screen';
import { Slate } from '@/components/Slate';
import { T } from '@/components/T';
import { revisit, setAutonomy } from '@/engine/actions';
import { currentStage, STAGE_BY_ID, stagesToRedo } from '@/engine/stages';
import { useApp, useProject } from '@/engine/store';
import type { Message, Project, StageId } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { versionLabel } from '@/lib/preview';
import { useRunAction } from '@/lib/useRunAction';
import { color, gutter, maxWidth, radius, space } from '@/theme/tokens';

/** Wide screens get the video on the left and the director on the right. */
const WIDE = 980;

export default function StudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProject(id);
  const apply = useApp((s) => s.apply);
  const send = useApp((s) => s.send);
  const runAction = useRunAction(id);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [goingBack, setGoingBack] = useState<StageId | null>(null);

  if (!project) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <Header title="Video not found" fallback="/" />
      </View>
    );
  }

  const wide = width >= WIDE;
  const messages = [...project.messages].reverse();
  const redo = goingBack ? stagesToRedo(project, goingBack) : [];
  const stage = currentStage(project);
  const auto = project.autonomy === 'auto';

  const autopilot = (
    <Press
      onPress={() => {
        haptic.select();
        apply(project.id, (p) => setAutonomy(p, auto ? 'ask' : 'auto'));
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: auto }}
      accessibilityLabel="Autopilot"
      accessibilityHint="On: the director keeps going and stops only where it needs you"
      style={[styles.auto, auto && styles.autoOn]}>
      <View style={[styles.dot, auto && styles.dotOn]} />
      <T v="micro" c={auto ? 'chalk' : 'smoke'}>
        Autopilot
      </T>
    </Press>
  );

  const header = (
    <Header title={project.title} kicker={project.isSample ? 'Sample video' : project.vibe ? `${project.vibe} video` : undefined} fallback="/" right={autopilot} />
  );
  const player = <PlayerView project={project} label={versionLabel(project)} maxHeight={wide ? height - 220 : Math.round(height * 0.34)} />;
  const slate = <Slate project={project} expanded={expanded} onToggle={() => setExpanded((e) => !e)} onRevisit={setGoingBack} />;
  const chat = (
    <>
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<ActionBlock project={project} onAction={runAction} onWatchHow={() => router.push(`/tutorial/${stage?.id ?? 'song'}`)} />}
        renderItem={({ item, index }) => <Line message={item} prev={messages[index + 1]} project={project} />}
      />
      <Composer onSend={(text) => send(project.id, text)} bottomInset={insets.bottom} />
    </>
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {wide ? (
        <View style={styles.wide}>
          <View style={styles.left}>
            {header}
            <View style={styles.pad}>{player}</View>
          </View>
          <KeyboardAvoidingView style={styles.right} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[styles.pad, styles.rightTop]}>{slate}</View>
            {chat}
          </KeyboardAvoidingView>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.column} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {header}
          <View style={styles.pad}>{player}</View>
          <View style={[styles.pad, styles.slateWrap]}>{slate}</View>
          {chat}
        </KeyboardAvoidingView>
      )}

      <Dialog
        visible={!!goingBack}
        title={goingBack ? `Go back to ${STAGE_BY_ID[goingBack].title}?` : ''}
        body={
          redo.length
            ? `${STAGE_BY_ID[goingBack!].title} and ${redo.map((s) => s.title).join(', ')} will redo. Your takes and ideas stay.`
            : 'This stage will redo. Your takes and ideas stay.'
        }
        confirmLabel="Go back"
        onCancel={() => setGoingBack(null)}
        onConfirm={() => {
          if (goingBack) apply(project.id, (p) => revisit(p, goingBack));
          setGoingBack(null);
          setExpanded(false);
        }}
      />
    </View>
  );
}

function Line({ message, prev, project }: { message: Message; prev?: Message; project: Project }) {
  if (message.from === 'system') return <SystemLine message={message} />;
  if (message.from === 'user') return <UserBubble message={message} />;
  return <DirectorLine message={message} project={project} showAvatar={!prev || prev.from !== 'director'} />;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: color.stage,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth,
  },
  wide: {
    flex: 1,
    width: '100%',
    maxWidth: 1320,
    flexDirection: 'row',
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  right: {
    width: 440,
    borderLeftWidth: 1,
    borderLeftColor: color.hairline,
  },
  rightTop: {
    paddingTop: space.l,
    paddingBottom: space.s,
    zIndex: 2,
  },
  pad: {
    paddingHorizontal: gutter,
  },
  slateWrap: {
    paddingTop: space.m,
    paddingBottom: space.xs,
    zIndex: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: gutter,
    paddingVertical: space.l,
    gap: space.s,
  },
  auto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  autoOn: {
    backgroundColor: color.flat,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: color.ash,
  },
  dotOn: {
    backgroundColor: color.chalk,
  },
});
