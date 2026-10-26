import { router } from 'expo-router';
import { Plus } from '@/components/icons';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Frame } from '@/components/Frame';
import { Press } from '@/components/Press';
import { ProgressTicks } from '@/components/ProgressTicks';
import { T } from '@/components/T';
import { trackerView } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { Project } from '@/engine/types';
import { coverFor } from '@/lib/preview';
import { statusLine } from '@/lib/status';
import { color, gutter, maxWidth, radius, space } from '@/theme/tokens';

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const order = useApp((s) => s.order);
  const projects = useApp((s) => s.projects);
  const credits = useApp((s) => s.credits);
  const items = order.map((id) => projects[id]).filter(Boolean);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={2}
        style={styles.list}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.columns}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <T v="display" accessibilityRole="header">
                Showtime
              </T>
              <Press onPress={() => router.push('/paywall')} style={styles.credits} accessibilityLabel={`${credits} video credits. Get more`}>
                <T v="label" c="chalk">
                  {String(credits)}
                </T>
                <T v="caption" c="smoke">
                  {credits === 1 ? 'credit' : 'credits'}
                </T>
              </Press>
            </View>
            <T v="body" c="smoke">
              Record your verse, pick the look, and your director takes it from raw takes to a finished video.
            </T>
            <Button label="New video" icon={Plus} onPress={() => router.push('/new')} />
            <T v="heading" style={styles.sectionTitle}>
              Your videos
            </T>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <T v="body" c="smoke">
              Your first video starts with a song. Tap New video to pick one.
            </T>
          </View>
        }
        renderItem={({ item }) => <ProjectTile project={item} />}
      />
    </View>
  );
}

function ProjectTile({ project }: { project: Project }) {
  const view = trackerView(project);
  const cover = coverFor(project);
  return (
    <Press
      onPress={() => router.push(`/project/${project.id}`)}
      style={styles.tile}
      scaleTo={0.98}
      accessibilityLabel={`${project.title}. ${statusLine(project)}`}>
      <Frame kind={cover.kind} format="9:16" relit={cover.relit} behindText={cover.behindText}>
        {project.isSample ? (
          <View style={styles.sample}>
            <T v="micro" c="chalk">
              Sample
            </T>
          </View>
        ) : null}
      </Frame>
      <View style={styles.tileText}>
        <T v="label" numberOfLines={1}>
          {project.title}
        </T>
        <ProgressTicks view={view} height={3} />
        <T v="caption" c={view.currentStatus === 'working' ? 'tungsten' : 'smoke'} numberOfLines={2}>
          {statusLine(project)}
        </T>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: color.stage,
  },
  list: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth,
    alignSelf: 'center',
    paddingHorizontal: gutter,
    paddingBottom: space.xxl,
    gap: space.xl,
  },
  columns: {
    gap: space.m,
  },
  header: {
    paddingTop: space.l,
    gap: space.l,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  credits: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    justifyContent: 'center',
    paddingTop: space.s,
  },
  sectionTitle: {
    marginTop: space.s,
  },
  empty: {
    paddingVertical: space.xxl,
    alignItems: 'center',
  },
  tile: {
    flex: 1,
    gap: space.s,
    maxWidth: '50%',
  },
  tileText: {
    gap: space.s,
    paddingRight: space.xs,
  },
  sample: {
    position: 'absolute',
    top: space.s,
    left: space.s,
    paddingHorizontal: space.s,
    paddingVertical: 3,
    borderRadius: radius.s,
    backgroundColor: color.scrim,
  },
});
