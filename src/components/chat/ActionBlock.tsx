import { PlayCircle } from '@/components/icons';
import { StyleSheet, View } from 'react-native';

import { nextActions, type NextAction } from '@/engine/director';
import { trackerView } from '@/engine/stages';
import type { Project } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { Button } from '../Button';
import { T } from '../T';

interface Props {
  project: Project;
  onAction: (action: NextAction) => void;
  onWatchHow: () => void;
}

/** Sits under the director's latest line: the one next step, or the job that's running. */
export function ActionBlock({ project, onAction, onWatchHow }: Props) {
  const view = trackerView(project);
  const { primary, secondary } = nextActions(project);
  const job = project.job;

  if (job) {
    const pct = Math.round(job.progress * 100);
    return (
      <View style={styles.job} accessibilityLabel={`${job.label}, ${pct} percent`}>
        <View style={styles.jobHead}>
          <T v="callout" style={styles.flex} numberOfLines={2}>
            {job.label}
          </T>
          <T v="label" c="tungsten">{`${pct}%`}</T>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${pct}%` }]} />
        </View>
        <T v="caption" c="ash">
          In the app, a push alert tells you when this is done. Keep chatting meanwhile.
        </T>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {primary ? <Button label={primary.label} onPress={() => onAction(primary)} /> : null}
      <View style={styles.row}>
        {!view.wrapped ? <Button label="Watch how" variant="quiet" icon={PlayCircle} onPress={onWatchHow} /> : null}
        {secondary ? <Button label={secondary.label} variant="quiet" onPress={() => onAction(secondary)} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: space.m,
    paddingLeft: 42,
    gap: space.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  job: {
    marginTop: space.m,
    marginLeft: 42,
    padding: space.l,
    gap: space.m,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
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
});
