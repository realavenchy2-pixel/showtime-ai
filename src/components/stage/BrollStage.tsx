import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Plus } from '@/components/icons';
import { addBrollIdea, approveBroll, brollToMake, generateBroll, skipStage } from '@/engine/actions';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { Project } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { Button } from '../Button';
import { PlayerView } from '../player/PlayerView';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { CutawayRow, cutawaySummary, orderedCutaways } from './Cutaways';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

/** Stage 6: cutaways. Their spots were set before the switch; here they get made, checked, kept or dropped. */
export function BrollStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [text, setText] = useState('');
  const [cue, setCue] = useState<{ time: number; key: number; play?: boolean; until?: number }>();
  const status = stageStatus(project, 'broll');
  const ideas = project.broll.ideas;
  const working = project.job?.stage === 'broll';
  const wrapped = project.broll.approved || status === 'skipped';
  const toMake = brollToMake(project);
  const own = ideas.some((i) => i.keep && i.clipId && i.status === 'idea');
  const back = ideas.some((i) => i.status === 'clip');
  const current = status === 'current' || status === 'needs_you';

  const add = () => {
    const shot = text.trim();
    if (!shot) return;
    haptic.select();
    apply(project.id, (p) => addBrollIdea(p, shot));
    setText('');
  };

  return (
    <StageScreen
      project={project}
      stage="broll"
      footer={
        working ? (
          <JobBar project={project} />
        ) : wrapped ? (
          <WrappedNote text={status === 'skipped' ? 'B-roll was skipped. Tap B-roll on the slate to bring it back.' : 'B-roll is in the edit. Tap B-roll on the slate to go back.'} />
        ) : back && current && toMake === 0 ? (
          <Button label="Keep these clips" onPress={() => apply(project.id, approveBroll)} />
        ) : current ? (
          <>
            <Button
              label={toMake === 0 && own ? 'Use your clips' : toMake === 1 ? 'Generate 1 clip' : `Generate ${toMake} clips`}
              disabled={toMake === 0 && !own}
              onPress={() => apply(project.id, (p) => generateBroll(p))}
            />
            {back ? null : <Button label="Skip b-roll" variant="quiet" onPress={() => apply(project.id, (p) => skipStage(p, 'broll'))} />}
          </>
        ) : (
          <WrappedNote text="These generate after the switch. Their spots are set now, so the switch skips those seconds." />
        )
      }>
      {ideas.some((i) => i.status !== 'idea') ? <PlayerView project={project} effects={false} cue={cue} label="Cut with b-roll" /> : null}

      <View style={stageStyles.block}>
        <SectionTitle detail={`${cutawaySummary(project)} Dropping one after the switch sends that spot back to the switch.`}>Cutaways</SectionTitle>
        {orderedCutaways(project).map((idea) => (
          <CutawayRow
            key={idea.id}
            project={project}
            idea={idea}
            disabled={wrapped || working}
            onPlay={
              idea.status === 'idea' || idea.at === undefined
                ? undefined
                : () => setCue((c) => ({ time: Math.max(0, idea.at! - 1), key: (c?.key ?? 0) + 1, play: true, until: idea.at! + idea.durationSec + 1 }))
            }
          />
        ))}
        {ideas.length === 0 ? (
          <T v="body" c="smoke">
            No cutaways yet. Describe some in the plan, upload clips, or add your own below.
          </T>
        ) : null}
      </View>

      {!wrapped ? (
        <View style={stageStyles.block}>
          <SectionTitle detail="Describe the shot: what it is, how the camera moves, the light.">Add your own</SectionTitle>
          <View style={styles.addRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={add}
              placeholder="A Lambo pulling up in the rain, low angle"
              placeholderTextColor={color.ash}
              style={styles.input}
              returnKeyType="done"
              accessibilityLabel="Describe a b-roll shot"
            />
            <Press onPress={add} disabled={!text.trim()} style={[styles.addBtn, !text.trim() && styles.addOff]} accessibilityLabel="Add b-roll shot">
              <Plus size={20} color={color.stage} />
            </Press>
          </View>
        </View>
      ) : null}
    </StageScreen>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row',
    gap: space.s,
  },
  input: {
    ...type.body,
    flex: 1,
    color: color.chalk,
    minHeight: 48,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.chalk,
  },
  addOff: {
    opacity: 0.35,
  },
});
