import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Plus } from '@/components/icons';
import { addBrollIdea, approveBroll, generateBroll, setBrollModel, skipStage, toggleBrollKeep } from '@/engine/actions';
import { formatTime } from '@/engine/director';
import { stageStatus } from '@/engine/stages';
import { useApp } from '@/engine/store';
import type { BrollIdea, BrollModel, Project } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { Button } from '../Button';
import { Chips } from '../Chips';
import { PlayerView } from '../player/PlayerView';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { Toggle } from '../Toggle';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

const STATE: Record<BrollIdea['status'], string> = { idea: 'In the plan', clip: 'Back, ready to check', approved: 'In the edit' };

/** Stage 6: cutaways. The director pitches them from the lyrics; the artist keeps, drops or adds their own. */
export function BrollStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const [text, setText] = useState('');
  const [cue, setCue] = useState<{ time: number; key: number; play?: boolean; until?: number }>();
  const status = stageStatus(project, 'broll');
  const ideas = project.broll.ideas;
  const working = project.job?.stage === 'broll';
  const wrapped = project.broll.approved || status === 'skipped';
  const toMake = ideas.filter((i) => i.keep && i.status === 'idea').length;
  const back = ideas.some((i) => i.status === 'clip');
  const model = ideas.find((i) => i.status === 'idea')?.model ?? ideas[0]?.model ?? 'omni';
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
        ) : back && current ? (
          <Button label="Keep these clips" onPress={() => apply(project.id, approveBroll)} />
        ) : current ? (
          <>
            <Button label={toMake === 1 ? 'Generate 1 clip' : `Generate ${toMake} clips`} disabled={toMake === 0} onPress={() => apply(project.id, (p) => generateBroll(p))} />
            <Button label="Skip b-roll" variant="quiet" onPress={() => apply(project.id, (p) => skipStage(p, 'broll'))} />
          </>
        ) : (
          <WrappedNote text="These generate after the switch. Keep, drop or add ideas any time before then." />
        )
      }>
      {ideas.some((i) => i.status !== 'idea') ? <PlayerView project={project} effects={false} cue={cue} label="Cut with b-roll" /> : null}

      <View style={stageStyles.block}>
        <SectionTitle detail="Each one cuts in for a couple of bars, then back to you.">Cutaways</SectionTitle>
        {ideas.map((idea) => (
          <Press
            key={idea.id}
            scaleTo={0.99}
            disabled={idea.status === 'idea' || idea.at === undefined}
            onPress={() => setCue((c) => ({ time: Math.max(0, idea.at! - 1), key: (c?.key ?? 0) + 1, play: true, until: idea.at! + idea.durationSec + 1 }))}
            style={styles.row}
            accessibilityLabel={`${idea.shot}, ${STATE[idea.status]}`}>
            <View style={stageStyles.flex}>
              <T v="micro" c="smoke" numberOfLines={1}>
                {`${idea.at !== undefined ? `${formatTime(idea.at)}, ` : ''}${idea.lyric}`}
              </T>
              <T v="callout">{idea.shot}</T>
              <T v="caption" c={idea.status === 'clip' ? 'tungsten' : 'ash'}>{`${STATE[idea.status]}, ${Math.round(idea.durationSec)} s, ${idea.model === 'omni' ? 'Gemini Omni' : 'MiniMax H3'}`}</T>
            </View>
            <Toggle value={idea.keep} onChange={() => apply(project.id, (p) => toggleBrollKeep(p, idea.id))} label={`Keep b-roll: ${idea.shot}`} disabled={wrapped || working} />
          </Press>
        ))}
        {ideas.length === 0 ? (
          <T v="body" c="smoke">
            No cutaways yet. I pitch some once the cut is done, or add your own below.
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
          <Chips<BrollModel>
            label="B-roll model"
            value={model}
            disabled={working}
            onChange={(m) => apply(project.id, (p) => setBrollModel(p, m))}
            options={[
              { value: 'omni', label: 'Gemini Omni', detail: 'Sharper, 3 credits a second' },
              { value: 'h3', label: 'MiniMax H3', detail: 'Faster, 2 credits a second' },
            ]}
          />
        </View>
      ) : null}
    </StageScreen>
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
