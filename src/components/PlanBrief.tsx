import { StyleSheet, TextInput, View } from 'react-native';

import { Check } from '@/components/icons';
import { setBrief, setVideoLength, SNIPPET_SEC, suggestedLength, videoRange } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { useApp } from '@/engine/store';
import type { Project, VideoLength } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { lockPlan, useServer } from '@/live/session';
import { color, radius, space, type } from '@/theme/tokens';

import { Button } from './Button';
import { Press } from './Press';
import { T } from './T';

/** Locks the plan from what the artist typed and the length they picked. */
export function usePlanLock(project: Project) {
  const thinking = useServer((s) => !!s.thinking[project.id]);
  const length = project.length ?? suggestedLength(project);
  return {
    thinking,
    lock: () => {
      haptic.confirm();
      lockPlan(project.id, { brief: project.brief ?? '', length });
    },
  };
}

/**
 * The plan, the way an artist would say it: describe the video in your own words and pick
 * snippet or full video. The director works out the scenes, looks, cutaways and effects.
 */
export function PlanBrief({ project, withButton = true, onLocked }: { project: Project; withButton?: boolean; onLocked?: () => void }) {
  const apply = useApp((s) => s.apply);
  const { thinking, lock } = usePlanLock(project);
  const song = project.song;
  if (!song) return null;
  const length = project.length ?? suggestedLength(project);
  const locked = project.planApproved || !!project.job || thinking;
  const start = videoRange(project).start;
  const fullDetail = project.takes.length && start > 0.05 ? `${formatTime(start)} to the end` : `The whole song, ${formatTime(song.durationSec)}`;

  const pick = (l: VideoLength) => {
    if (locked || l === length) return;
    haptic.select();
    apply(project.id, (p) => setVideoLength(p, l));
  };

  return (
    <View style={styles.wrap}>
      <T v="title" accessibilityRole="header">
        Describe what you want to shoot
      </T>
      <TextInput
        value={project.brief ?? ''}
        onChangeText={(text) => apply(project.id, (p) => setBrief(p, text))}
        editable={!locked}
        multiline
        maxLength={1200}
        placeholder="Me on a rooftop at night, then a white room with one light. Cutaways of the city and my chain."
        placeholderTextColor={color.ash}
        style={styles.box}
        accessibilityLabel="Describe what you want to shoot"
      />
      <View style={styles.lengths} accessibilityRole="radiogroup" accessibilityLabel="How long the video is">
        <LengthOption title="Snippet" detail={`About ${SNIPPET_SEC} seconds`} selected={length === 'snippet'} disabled={locked} onPress={() => pick('snippet')} />
        <LengthOption title="Full video" detail={fullDetail} selected={length === 'full'} disabled={locked} onPress={() => pick('full')} />
      </View>
      {withButton ? (
        <Button
          label={thinking ? 'Planning your scenes' : 'Lock the plan'}
          busy={thinking}
          disabled={project.planApproved || !!project.job}
          onPress={() => {
            lock();
            onLocked?.();
          }}
          accessibilityHint="The director plans every scene from what you wrote. Then you record"
        />
      ) : null}
      <T v="caption" c="ash" style={styles.note}>
        {project.brief?.trim() ? 'I turn this into scenes, cutaways and effects.' : 'Leave it empty and I plan it from the song.'} You pick where it starts right before you record.
      </T>
    </View>
  );
}

function LengthOption({ title, detail, selected, disabled, onPress }: { title: string; detail: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.98}
      style={[styles.option, selected && styles.optionOn, disabled && !selected && styles.optionOff]}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${title}, ${detail}`}>
      <View style={styles.optionTop}>
        <T v="label">{title}</T>
        {selected ? <Check size={18} color={color.chalk} /> : null}
      </View>
      <T v="caption" c="smoke">
        {detail}
      </T>
    </Press>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.m,
    padding: space.l,
    borderRadius: radius.l,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  box: {
    ...type.body,
    color: color.chalk,
    minHeight: 112,
    maxHeight: 220,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
    textAlignVertical: 'top',
  },
  lengths: {
    flexDirection: 'row',
    gap: space.s,
  },
  option: {
    flex: 1,
    minHeight: 72,
    padding: space.m,
    gap: 2,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  optionOn: {
    borderColor: color.chalk,
  },
  optionOff: {
    opacity: 0.5,
  },
  optionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  note: {
    textAlign: 'center',
  },
});
