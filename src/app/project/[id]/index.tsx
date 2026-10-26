import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionBlock } from '@/components/chat/ActionBlock';
import { Composer } from '@/components/chat/Composer';
import { DirectorLine, SystemLine, UserBubble } from '@/components/chat/Messages';
import { Dialog } from '@/components/Dialog';
import { Frame } from '@/components/Frame';
import { Header } from '@/components/Screen';
import { Slate } from '@/components/Slate';
import { revisit } from '@/engine/actions';
import { currentStage, STAGE_BY_ID, stagesToRedo } from '@/engine/stages';
import { useApp, useProject } from '@/engine/store';
import type { Message, StageId } from '@/engine/types';
import { previewFor, previewFormat } from '@/lib/preview';
import { useRunAction } from '@/lib/useRunAction';
import { color, gutter, maxWidth, space } from '@/theme/tokens';

export default function StudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProject(id);
  const apply = useApp((s) => s.apply);
  const sendMessage = useApp((s) => s.sendMessage);
  const runAction = useRunAction(id);
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [goingBack, setGoingBack] = useState<StageId | null>(null);

  if (!project) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <Header title="Video not found" fallback="/" />
      </View>
    );
  }

  const messages = [...project.messages].reverse();
  const preview = previewFor(project);
  const redo = goingBack ? stagesToRedo(project, goingBack) : [];
  const stage = currentStage(project);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.column} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title={project.title} kicker={project.isSample ? 'Sample video' : project.vibe ? `${project.vibe} video` : undefined} fallback="/" />
        <View style={styles.slateWrap}>
          <Slate project={project} expanded={expanded} onToggle={() => setExpanded((e) => !e)} onRevisit={setGoingBack} />
        </View>

        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <ActionBlock project={project} onAction={runAction} onWatchHow={() => router.push(`/tutorial/${stage?.id ?? 'song'}`)} />
          }
          ListFooterComponent={
            <View style={styles.preview}>
              <Frame kind={preview.kind} format={previewFormat(project)} label={preview.label} relit={preview.kind !== 'room'} behindText={preview.behindText} />
            </View>
          }
          renderItem={({ item, index }) => <Line message={item} prev={messages[index + 1]} project={project} />}
        />

        <Composer onSend={(text) => sendMessage(project.id, text)} bottomInset={insets.bottom} />
      </KeyboardAvoidingView>

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

function Line({ message, prev, project }: { message: Message; prev?: Message; project: NonNullable<ReturnType<typeof useProject>> }) {
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
  slateWrap: {
    paddingHorizontal: gutter,
    paddingBottom: space.s,
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
  preview: {
    paddingBottom: space.m,
  },
});
