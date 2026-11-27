import { StyleSheet, View } from 'react-native';

import { toggleBrollKeep, videoRange } from '@/engine/actions';
import { cutawayWindows } from '@/engine/broll';
import { formatTime } from '@/engine/director';
import { useApp } from '@/engine/store';
import { remakeBroll } from '@/engine/touchup';
import type { BrollIdea, Project } from '@/engine/types';
import { color, radius, space } from '@/theme/tokens';

import { Press } from '../Press';
import { T } from '../T';
import { Toggle } from '../Toggle';

const STATE: Record<BrollIdea['status'], string> = { idea: 'In the plan', clip: 'Back, ready to check', approved: 'In the edit' };

/** Placed cutaways in the order they play, then the ones waiting for room, then the ones turned off. */
export function orderedCutaways(p: Project): BrollIdea[] {
  const place = (i: BrollIdea) => (i.keep && i.at !== undefined ? 0 : i.bumped ? 1 : 2);
  return p.broll.ideas.slice().sort((a, b) => place(a) - place(b) || (a.at ?? 0) - (b.at ?? 0));
}

/** One line on how the b-roll sits in the video: how much, and what that saves at the switch. */
export function cutawaySummary(p: Project): string {
  const windows = cutawayWindows(p);
  if (windows.length === 0) return 'No cutaways in this video. The performance carries all of it.';
  const r = videoRange(p);
  const total = Math.round(windows.reduce((sum, w) => sum + (w.end - w.start), 0));
  const length = Math.round(r.end - r.start);
  const switchNote = p.shots.length === 0 ? ' The switch skips those seconds, so you only pay for what plays.' : '';
  return `${windows.length} ${windows.length === 1 ? 'cutaway' : 'cutaways'}, ${total} s of a ${length} s video.${switchNote}`;
}

function note(p: Project, idea: BrollIdea): string {
  const r = videoRange(p);
  const secs = `${Math.round(idea.durationSec * 10) / 10} s`;
  if (!idea.keep) return idea.bumped ? 'No room right now. Turn it on to swap it in.' : 'Off';
  if (idea.at === undefined) return 'Waiting for a spot';
  const at = formatTime(idea.at - r.start);
  if (idea.cover) return `${at} to ${formatTime(idea.at + idea.durationSec - r.start)}. Covers where no take reaches, so it stays.`;
  // Which model makes the clip is never shown; the artist only needs to know if it's theirs.
  return `${at}, ${secs}${idea.clipId ? ', your clip, free' : ''}. ${STATE[idea.status]}.`;
}

/** A cutaway with its place in the video and a switch to keep it. Tap to play it in context. */
export function CutawayRow({ project, idea, disabled, onPlay }: { project: Project; idea: BrollIdea; disabled?: boolean; onPlay?: () => void }) {
  const apply = useApp((s) => s.apply);
  const scene = idea.sectionId ? project.song?.sections.find((s) => s.id === idea.sectionId)?.label : undefined;
  const placed = idea.keep && idea.at !== undefined;
  return (
    <Press
      scaleTo={0.99}
      disabled={!onPlay || !placed}
      onPress={onPlay}
      style={[styles.row, !idea.keep && styles.off]}
      accessibilityLabel={`${idea.shot}. ${note(project, idea)}`}>
      <View style={styles.flex}>
        <T v="micro" c="smoke" numberOfLines={1}>
          {[scene, idea.clipId || idea.mine ? 'Your idea' : idea.cover ? 'Director’s pick' : idea.lyric].filter(Boolean).join(', ')}
        </T>
        <T v="callout">{idea.shot}</T>
        <T v="caption" c={idea.status === 'clip' && idea.keep ? 'accent' : 'ash'}>
          {note(project, idea)}
        </T>
        {idea.status === 'clip' && !idea.clipId && !disabled && !project.broll.approved ? (
          <Press onPress={() => apply(project.id, (p) => remakeBroll(p, idea.id))} hitSlop={8} style={styles.again} accessibilityLabel={`Make this b-roll again: ${idea.shot}`}>
            <T v="caption" c="chalk">
              Make it again
            </T>
          </Press>
        ) : null}
      </View>
      <Toggle
        value={idea.keep}
        onChange={() => apply(project.id, (p) => toggleBrollKeep(p, idea.id))}
        label={`Keep b-roll: ${idea.shot}`}
        disabled={disabled || project.broll.approved || !!idea.cover}
      />
    </Press>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  off: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  again: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: color.hairlineStrong,
  },
});
