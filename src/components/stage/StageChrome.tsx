import { router } from 'expo-router';
import { PlayCircle } from '@/components/icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { STAGE_BY_ID, stageStatus } from '@/engine/stages';
import type { Project, StageId } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { Header, Screen } from '../Screen';
import { StageGlyph } from '../StageGlyph';
import { T } from '../T';

interface Props {
  project: Project;
  stage: StageId;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared frame for every stage screen: scene number, title, state, and the pinned action. */
export function StageScreen({ project, stage, children, footer }: Props) {
  const def = STAGE_BY_ID[stage];
  const status = stageStatus(project, stage);
  return (
    <Screen
      header={
        <Header
          kicker={`Stage ${String(def.n).padStart(2, '0')}${def.optional ? ', optional' : ''}`}
          title={def.title}
          fallback={`/project/${project.id}`}
          right={<StageGlyph status={status} />}
        />
      }
      footer={footer}>
      {status === 'locked' ? (
        <View style={styles.notice}>
          <T v="body" c="smoke">
            This stage opens once the ones before it are done. Your director will bring you here.
          </T>
        </View>
      ) : (
        children
      )}
    </Screen>
  );
}

/** Footer content while a job runs. */
export function JobBar({ project }: { project: Project }) {
  const job = project.job;
  if (!job) return null;
  const pct = Math.round(job.progress * 100);
  return (
    <View style={styles.job} accessibilityLabel={`${job.label}, ${pct} percent`}>
      <View style={styles.jobHead}>
        <T v="callout" style={styles.flex} numberOfLines={1}>
          {job.label}
        </T>
        <T v="label" c="tungsten">{`${pct}%`}</T>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

/** Shown in place of the action when a stage is already wrapped. */
export function WrappedNote({ text = 'Wrapped. To change it, tap this stage on the slate and go back.' }: { text?: string }) {
  return (
    <T v="caption" c="ash" style={styles.center}>
      {text}
    </T>
  );
}

export function WatchHow({ stage }: { stage: StageId }) {
  return <Button label="Watch how" variant="quiet" icon={PlayCircle} onPress={() => router.push(`/tutorial/${stage}`)} />;
}

const styles = StyleSheet.create({
  notice: {
    paddingVertical: space.xxl,
  },
  job: {
    gap: space.s,
    paddingVertical: space.s,
  },
  jobHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  flex: {
    flex: 1,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.rig,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.tungsten,
  },
  center: {
    textAlign: 'center',
    paddingVertical: space.s,
  },
});

export const stageStyles = StyleSheet.create({
  card: {
    backgroundColor: color.curtain,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: space.l,
    gap: space.m,
  },
  block: {
    gap: space.m,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  flex: {
    flex: 1,
  },
});
