import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Check, RefreshCcw, X } from '@/components/icons';
import { setVideoLength, SNIPPET_SEC, suggestedLength, videoRange } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { addMyIdea, pickIdea, pitchIdeas, removeIdea, scenesOf, setInspiration } from '@/engine/production';
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
 * Lock in the shoot plan. Three ways in: the director's ideas from listening to the song, your own
 * ideas, or a video you want it to feel like. Pick one, pick the length, and the director turns it
 * into scenes, an empty location for each and a set guide for every scene.
 */
export function PlanBrief({ project, withButton = true, onLocked }: { project: Project; withButton?: boolean; onLocked?: () => void }) {
  const apply = useApp((s) => s.apply);
  const { thinking, lock } = usePlanLock(project);
  const [mine, setMine] = useState('');
  const [link, setLink] = useState(project.inspiration ?? '');
  const song = project.song;
  if (!song) return null;
  const length = project.length ?? suggestedLength(project);
  const locked = project.planApproved || !!project.job || thinking;
  const start = videoRange(project).start;
  const fullDetail = project.takes.length && start > 0.05 ? `${formatTime(start)} to the end` : `The whole song, ${formatTime(song.durationSec)}`;
  const ideas = project.planIdeas ?? [];
  const fromSong = ideas.filter((i) => i.source === 'song');
  const own = ideas.filter((i) => i.source !== 'song');
  const vision = project.path === 'vision';

  const pick = (l: VideoLength) => {
    if (locked || l === length) return;
    haptic.select();
    apply(project.id, (p) => setVideoLength(p, l));
  };
  const choose = (id: string) => {
    if (locked) return;
    haptic.select();
    apply(project.id, (p) => pickIdea(p, id));
  };
  const chosen = (pitch: string) => !!project.brief && project.brief.startsWith(pitch.slice(0, 60));

  const songBlock = (
    <View style={styles.group} key="song">
      <View style={styles.groupHead}>
        <View style={styles.flex}>
          <T v="heading">Ideas from your song</T>
          <T v="caption" c="smoke">{`I listened: ${Math.round(song.bpm)} BPM, ${scenesOf(project).length} scenes at this length. Here's what I'd shoot.`}</T>
        </View>
        {!locked ? (
          <Press onPress={() => apply(project.id, pitchIdeas)} hitSlop={8} accessibilityLabel="Pitch new ideas">
            <RefreshCcw size={18} color={color.smoke} />
          </Press>
        ) : null}
      </View>
      {fromSong.length === 0 && !locked ? <Button label="Pitch me ideas" variant="secondary" onPress={() => apply(project.id, pitchIdeas)} /> : null}
      {fromSong.map((idea) => (
        <IdeaCard key={idea.id} title={idea.title} pitch={idea.pitch} selected={chosen(idea.pitch)} disabled={locked} onPress={() => choose(idea.id)} />
      ))}
    </View>
  );

  const mineBlock = (
    <View style={styles.group} key="mine">
      <View style={styles.flex}>
        <T v="heading">{vision ? 'Your vision' : 'Your ideas'}</T>
        <T v="caption" c="smoke">
          {vision ? 'Describe the video you already see. Places, outfits, cutaways, the feel. I fill in the rest and we agree on the plan.' : 'Got your own idea? Say it in your words.'}
        </T>
      </View>
      {own
        .filter((i) => i.source === 'mine')
        .map((idea) => (
          <IdeaCard key={idea.id} title={idea.title} pitch={idea.pitch} selected={chosen(idea.pitch)} disabled={locked} onPress={() => choose(idea.id)} onRemove={locked ? undefined : () => apply(project.id, (p) => removeIdea(p, idea.id))} />
        ))}
      {!locked ? (
        <>
          <TextInput
            value={mine}
            onChangeText={setMine}
            multiline
            maxLength={600}
            placeholder="Me on a rooftop at night, then a white room with one light. Cutaways of the city and my chain."
            placeholderTextColor={color.ash}
            style={styles.box}
            accessibilityLabel="Describe your idea"
          />
          <Button
            label="Use this idea"
            variant="secondary"
            disabled={!mine.trim()}
            onPress={() => {
              const text = mine;
              apply(project.id, (p) => {
                const next = addMyIdea(p, text);
                const added = (next.planIdeas ?? [])[(next.planIdeas ?? []).length - 1];
                return added ? pickIdea(next, added.id) : next;
              });
              setMine('');
              haptic.confirm();
            }}
          />
        </>
      ) : null}
    </View>
  );

  const inspoBlock = (
    <View style={styles.group} key="inspo">
      <View style={styles.flex}>
        <T v="heading">Inspired by a video</T>
        <T v="caption" c="smoke">
          Paste a link to a video you love. I match its locations, pace and color to your song.
        </T>
      </View>
      {own
        .filter((i) => i.source === 'inspiration')
        .map((idea) => (
          <IdeaCard key={idea.id} title={idea.title} pitch={idea.pitch} selected={chosen(idea.pitch)} disabled={locked} onPress={() => choose(idea.id)} />
        ))}
      {!locked ? (
        <View style={styles.linkRow}>
          <TextInput
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="youtube.com/watch?v=..."
            placeholderTextColor={color.ash}
            style={[styles.box, styles.linkBox]}
            accessibilityLabel="Link to a video"
          />
          <Button
            label="Add"
            variant="secondary"
            disabled={!link.trim()}
            onPress={() => {
              const url = link;
              apply(project.id, (p) => {
                const next = setInspiration(p, url);
                const added = (next.planIdeas ?? []).find((i) => i.source === 'inspiration');
                return added ? pickIdea(next, added.id) : next;
              });
              haptic.confirm();
            }}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <T v="title" accessibilityRole="header">
        {"Let's lock in the shoot plan"}
      </T>
      <T v="body" c="smoke">
        {"Pick a direction. I turn it into scenes, make the empty location for each one so you see where you're going, and give you a set guide for every scene."}
      </T>
      {vision ? [mineBlock, songBlock, inspoBlock] : [songBlock, mineBlock, inspoBlock]}
      <View style={styles.flex}>
        <T v="heading">How long</T>
      </View>
      <View style={styles.lengths} accessibilityRole="radiogroup" accessibilityLabel="How long the video is">
        <LengthOption title="Snippet" detail={`About ${SNIPPET_SEC} seconds`} selected={length === 'snippet'} disabled={locked} onPress={() => pick('snippet')} />
        <LengthOption title="Full video" detail={fullDetail} selected={length === 'full'} disabled={locked} onPress={() => pick('full')} />
      </View>
      {withButton ? (
        <Button
          label={thinking ? 'Planning your scenes' : 'Lock in the plan'}
          busy={thinking}
          disabled={project.planApproved || !!project.job}
          onPress={() => {
            lock();
            onLocked?.();
          }}
          accessibilityHint="The director plans every scene. Then you shoot them one at a time"
        />
      ) : null}
      <T v="caption" c="ash" style={styles.note}>
        {project.brief?.trim() ? 'Locked in: the idea you picked.' : 'Pick nothing and I plan it from the song.'} You pick where it starts right before you record.
      </T>
    </View>
  );
}

function IdeaCard({ title, pitch, selected, disabled, onPress, onRemove }: { title: string; pitch: string; selected: boolean; disabled: boolean; onPress: () => void; onRemove?: () => void }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.99}
      style={[styles.idea, selected && styles.ideaOn, disabled && !selected && styles.optionOff]}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${title}. ${pitch}`}>
      <View style={styles.optionTop}>
        <T v="label" style={styles.flex} numberOfLines={1}>
          {title}
        </T>
        {selected ? <Check size={18} color={color.accent} strokeWidth={3} /> : null}
        {onRemove ? (
          <Press onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${title}`}>
            <X size={16} color={color.ash} />
          </Press>
        ) : null}
      </View>
      <T v="caption" c="smoke">
        {pitch}
      </T>
    </Press>
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
  flex: { flex: 1 },
  group: { gap: space.s },
  groupHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.m },
  idea: {
    gap: 4,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  ideaOn: { borderColor: color.accent, backgroundColor: color.accentSoft },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  linkBox: { flex: 1, minHeight: 48, maxHeight: 48 },
  optionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  note: {
    textAlign: 'center',
  },
});
