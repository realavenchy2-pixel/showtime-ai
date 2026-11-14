import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ChevronDown, ChevronUp, ImagePlus, X } from '@/components/icons';
import {
  addLookRef,
  approvePlan,
  approvePlates,
  makePlates,
  removeLookRef,
  setBrollModel,
  setFxIntensity,
  setFxPack,
  setLook,
  setLookEverywhere,
  setLookPrompt,
  toggleBrollKeep,
} from '@/engine/actions';
import { estimateBudget } from '@/engine/agent';
import { formatTime } from '@/engine/director';
import { FX_INTENSITIES, FX_PACKS } from '@/engine/fx';
import { LOCATIONS, locationTitle } from '@/engine/samples';
import { useApp } from '@/engine/store';
import type { BrollModel, FxIntensity, FxPackId, LocationKind, Look, Project, Section } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/media/pick';
import { color, radius, space, type } from '@/theme/tokens';

import { Button } from '../Button';
import { Chips } from '../Chips';
import { Frame } from '../Frame';
import { MediaImage } from '../MediaImage';
import { Press } from '../Press';
import { SectionTitle } from '../Screen';
import { T } from '../T';
import { showToast } from '../Toast';
import { Toggle } from '../Toggle';
import { JobBar, StageScreen, WrappedNote, stageStyles } from './StageChrome';

const LOOK_OPTIONS: { value: LocationKind | 'custom'; label: string }[] = [...LOCATIONS.map((l) => ({ value: l.id, label: l.title })), { value: 'custom', label: 'Custom' }];

/** Stage 4: the plan. Where every part of the song takes place, plus the b-roll and effects that go with it. */
export function LooksStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const sections = project.song?.sections ?? [];
  const [openId, setOpenId] = useState<string | null>(sections[0]?.id ?? null);
  const working = project.job?.stage === 'looks';
  // Looks can change until the reference frames are approved.
  const open = project.plates !== 'approved' && !project.job && project.shots.length === 0;
  const ready = sections.length > 0 && sections.every((s) => project.looks[s.id]);
  const budget = estimateBudget(project);
  const ideas = project.broll.ideas;
  const model = ideas.find((i) => i.status === 'idea')?.model ?? ideas[0]?.model ?? 'omni';

  return (
    <StageScreen
      project={project}
      stage="looks"
      footer={
        working ? (
          <JobBar project={project} />
        ) : project.plates === 'approved' ? (
          <WrappedNote text="Looks are locked in. Tap Looks on the slate to go back and change them." />
        ) : !project.cut.locked ? (
          <WrappedNote text="The plan opens once the cut is locked." />
        ) : !project.planApproved ? (
          <>
            <Button label="Run it" disabled={!ready} onPress={() => apply(project.id, approvePlan)} accessibilityHint="The director builds references, switches every shot, adds b-roll and builds the edit" />
            <T v="caption" c="ash" style={styles.center}>
              {budget.totalCredits ? `About ${budget.totalCredits.toLocaleString()} Beeble credits to render at ${project.switchSettings.resolution}p.` : 'Change anything first. Nothing renders until you run it.'}
            </T>
          </>
        ) : project.plates === 'ready' ? (
          <Button label="Approve references" onPress={() => apply(project.id, approvePlates)} />
        ) : (
          <Button label="Make reference frames" onPress={() => apply(project.id, makePlates)} />
        )
      }>
      <T v="body" c="smoke">
        Each part of the song gets a world. SwitchX rebuilds everything around you from the prompt and up to {project.switchSettings.maxRefs} reference {project.switchSettings.maxRefs === 1 ? 'image' : 'images'}; your performance stays exactly as you shot it.
      </T>

      <View style={stageStyles.block}>
        {sections.map((section) => {
          const look = project.looks[section.id];
          if (!look) return null;
          return (
            <LookCard
              key={section.id}
              section={section}
              look={look}
              editable={open}
              expanded={openId === section.id}
              maxRefs={project.switchSettings.maxRefs}
              onToggle={() => setOpenId((id) => (id === section.id ? null : section.id))}
              onLocation={(loc) => apply(project.id, (p) => setLook(p, section.id, loc))}
              onPrompt={(text) => apply(project.id, (p) => setLookPrompt(p, section.id, text))}
              onEverywhere={() => {
                if (look.location === 'custom') return;
                haptic.confirm();
                apply(project.id, (p) => setLookEverywhere(p, look.location as LocationKind));
              }}
              onAddRef={async () => {
                try {
                  const img = await pickImage();
                  if (img) apply(project.id, (p) => addLookRef(p, section.id, { label: img.name, source: 'upload', mediaId: img.mediaId, uri: img.uri }));
                } catch {
                  showToast('That image could not be added.');
                }
              }}
              onRemoveRef={(refId) => apply(project.id, (p) => removeLookRef(p, section.id, refId))}
            />
          );
        })}
      </View>

      {ideas.length ? (
        <View style={stageStyles.block}>
          <SectionTitle detail="Cutaways that land on your lyrics. Hooks stay on you.">B-roll</SectionTitle>
          {ideas.map((idea) => (
            <View key={idea.id} style={styles.row}>
              <View style={stageStyles.flex}>
                <T v="callout">{idea.shot}</T>
                <T v="caption" c="smoke">{`${idea.at !== undefined ? `At ${formatTime(idea.at)}, ` : ''}${Math.round(idea.durationSec)} s`}</T>
              </View>
              <Toggle value={idea.keep} onChange={() => apply(project.id, (p) => toggleBrollKeep(p, idea.id))} label={`Keep b-roll: ${idea.shot}`} disabled={project.broll.approved || idea.status !== 'idea'} />
            </View>
          ))}
          <Chips<BrollModel>
            label="B-roll model"
            value={model}
            disabled={project.broll.approved || !!project.job}
            onChange={(m) => apply(project.id, (p) => setBrollModel(p, m))}
            options={[
              { value: 'omni', label: 'Gemini Omni', detail: 'Sharper, 3 credits a second' },
              { value: 'h3', label: 'MiniMax H3', detail: 'Faster, 2 credits a second' },
            ]}
          />
        </View>
      ) : null}

      <View style={stageStyles.block}>
        <SectionTitle detail={FX_PACKS.find((x) => x.id === project.fx.pack)?.feel ?? 'Hits land on the beat grid of your song.'}>Effects</SectionTitle>
        <Chips<FxPackId>
          label="Effects pack"
          value={project.fx.pack}
          disabled={project.final.locked}
          onChange={(pack) => apply(project.id, (p) => setFxPack(p, pack))}
          options={FX_PACKS.map((x) => ({ value: x.id, label: x.title }))}
        />
        <Chips<FxIntensity>
          label="Effects intensity"
          value={project.fx.intensity}
          disabled={project.final.locked}
          onChange={(intensity) => apply(project.id, (p) => setFxIntensity(p, intensity))}
          options={FX_INTENSITIES.map((x) => ({ value: x.id, label: x.id }))}
        />
      </View>

      {budget.totalCredits ? (
        <View style={stageStyles.card}>
          <T v="heading">Render budget</T>
          <BudgetLine label={`Switch, ${budget.switchFrames.toLocaleString()} frames at ${project.switchSettings.resolution}p`} credits={budget.switchCredits} />
          <BudgetLine label="Reference frames" credits={budget.referenceCredits} />
          {budget.brollCredits ? <BudgetLine label={`B-roll, ${budget.brollSeconds} s`} credits={budget.brollCredits} /> : null}
          <View style={styles.rule} />
          <BudgetLine label="Total, in Beeble credits" credits={budget.totalCredits} strong />
          <T v="caption" c="ash">
            What this video costs you to render. Artists only see their own video credit.
          </T>
        </View>
      ) : null}
    </StageScreen>
  );
}

function BudgetLine({ label, credits, strong }: { label: string; credits: number; strong?: boolean }) {
  return (
    <View style={stageStyles.row}>
      <T v={strong ? 'callout' : 'caption'} c={strong ? 'chalk' : 'smoke'} style={stageStyles.flex}>
        {label}
      </T>
      <T v={strong ? 'callout' : 'caption'} c={strong ? 'chalk' : 'smoke'} style={styles.tabular}>
        {credits.toLocaleString()}
      </T>
    </View>
  );
}

interface CardProps {
  section: Section;
  look: Look;
  editable: boolean;
  expanded: boolean;
  maxRefs: number;
  onToggle: () => void;
  onLocation: (loc: LocationKind | 'custom') => void;
  onPrompt: (text: string) => void;
  onEverywhere: () => void;
  onAddRef: () => void;
  onRemoveRef: (refId: string) => void;
}

function LookCard({ section, look, editable, expanded, maxRefs, onToggle, onLocation, onPrompt, onEverywhere, onAddRef, onRemoveRef }: CardProps) {
  const set = look.location === 'custom' ? 'darkVoid' : look.location;
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <View style={styles.card}>
      <Press onPress={onToggle} scaleTo={0.99} style={styles.cardHead} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${section.label}, ${locationTitle(look.location)}`}>
        <View style={styles.swatch}>
          {look.refs[0] ? <MediaImage mediaId={look.refs[0].mediaId} uri={look.refs[0].uri} style={styles.fill} /> : <Frame kind={set} relit rounded={false} noArtist />}
        </View>
        <View style={stageStyles.flex}>
          <T v="micro" c="smoke">{`${section.label}, ${formatTime(section.start)} to ${formatTime(section.end)}`}</T>
          <T v="label">{locationTitle(look.location)}</T>
        </View>
        <Chevron size={20} color={color.smoke} />
      </Press>

      {expanded ? (
        <View style={styles.cardBody}>
          <Chips<LocationKind | 'custom'> label={`Look for ${section.label}`} value={look.location} disabled={!editable} onChange={onLocation} options={LOOK_OPTIONS} />

          <View style={styles.field}>
            <T v="micro" c="smoke">
              Prompt
            </T>
            <TextInput
              value={look.prompt}
              onChangeText={onPrompt}
              editable={editable}
              multiline
              placeholder="Describe the world: where it is, the light, what moves, and when."
              placeholderTextColor={color.ash}
              style={styles.prompt}
              accessibilityLabel={`Prompt for ${section.label}`}
            />
          </View>

          <View style={styles.field}>
            <T v="micro" c="smoke">{`Reference images ${look.refs.length}/${maxRefs}`}</T>
            <View style={styles.refs}>
              {look.refs.map((ref) => (
                <View key={ref.id} style={styles.ref}>
                  <MediaImage mediaId={ref.mediaId} uri={ref.uri} style={styles.fill} label={ref.label} />
                  {editable ? (
                    <Press onPress={() => onRemoveRef(ref.id)} style={styles.refRemove} accessibilityLabel={`Remove reference ${ref.label}`} hitSlop={8}>
                      <X size={14} color={color.chalk} />
                    </Press>
                  ) : null}
                </View>
              ))}
              {editable && look.refs.length < maxRefs ? (
                <Press onPress={onAddRef} style={[styles.ref, styles.refAdd]} accessibilityLabel="Add a reference image">
                  <ImagePlus size={20} color={color.smoke} />
                </Press>
              ) : null}
            </View>
            <T v="caption" c="ash">
              {look.refs.length ? 'SwitchX matches these. The prompt directs what happens.' : 'Optional. Without one I build a reference from a frame of your take.'}
            </T>
          </View>

          {editable && look.location !== 'custom' ? <Button label={`Use ${locationTitle(look.location).toLowerCase()} for the whole song`} variant="quiet" onPress={onEverywhere} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  rule: {
    height: 1,
    backgroundColor: color.hairline,
  },
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
  card: {
    borderRadius: radius.m,
    backgroundColor: color.curtain,
    borderWidth: 1,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.s,
    paddingRight: space.l,
    minHeight: 64,
  },
  swatch: {
    width: 84,
    aspectRatio: 16 / 9,
    borderRadius: radius.s,
    overflow: 'hidden',
    backgroundColor: color.flat,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  cardBody: {
    gap: space.l,
    padding: space.l,
    borderTopWidth: 1,
    borderTopColor: color.hairline,
  },
  field: {
    gap: space.s,
  },
  prompt: {
    ...type.body,
    color: color.chalk,
    minHeight: 96,
    padding: space.m,
    borderRadius: radius.s,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
    textAlignVertical: 'top',
  },
  refs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s,
  },
  ref: {
    width: 72,
    height: 72,
    borderRadius: radius.s,
    overflow: 'hidden',
    backgroundColor: color.flat,
  },
  refAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairlineStrong,
    backgroundColor: 'transparent',
  },
  refRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.scrim,
  },
});
