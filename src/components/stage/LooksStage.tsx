import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ChevronDown, ChevronUp, ImagePlus, Pause, Play, X } from '@/components/icons';
import {
  addLookRef,
  approvePlan,
  removeLookRef,
  setBrollModel,
  setFxIntensity,
  setFxPack,
  setLook,
  setLookEverywhere,
  setLookPrompt,
  setRange,
  SNIPPET_LENGTHS,
  snippetRange,
  toggleBrollKeep,
  videoRange,
} from '@/engine/actions';
import { estimateBudget } from '@/engine/agent';
import { formatTime } from '@/engine/director';
import { FX_INTENSITIES, FX_PACKS } from '@/engine/fx';
import { LOCATIONS, locationTitle } from '@/engine/samples';
import { useApp } from '@/engine/store';
import type { BrollModel, FxIntensity, FxPackId, LocationKind, Look, Project, Section } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { pickImage } from '@/media/pick';
import { useSongPreview } from '@/media/preview';
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

/** Stage 2: the plan, locked before the shoot. How long the video is, where every part takes place, b-roll and effects. */
export function LooksStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const range = videoRange(project);
  // Only the parts of the song inside the video get a look.
  const sections = (project.song?.sections ?? []).filter((s) => s.end > range.start + 0.01 && s.start < range.end - 0.01);
  const [openId, setOpenId] = useState<string | null>(sections[0]?.id ?? null);
  const working = project.job?.stage === 'looks';
  // Looks can change until the switch starts.
  const open = project.plates === 'none' && !project.job && project.shots.length === 0;
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
        ) : project.planApproved ? (
          <WrappedNote text={open ? "The plan is locked. You can still change looks, b-roll and effects until the switch starts." : 'The plan is locked. Tap Plan on the slate to go back and change it.'} />
        ) : (
          <>
            <Button
              label="Lock the plan"
              disabled={!ready}
              onPress={() => {
                haptic.confirm();
                apply(project.id, approvePlan);
                // Back to the studio, where the shoot starts.
                router.replace(`/project/${project.id}`);
              }}
              accessibilityHint="Then you record. After the shoot the director cuts, switches, adds b-roll and builds the edit"
            />
            <T v="caption" c="ash" style={styles.center}>
              Next you record. Nothing renders until the shoot is done.
            </T>
          </>
        )
      }>
      <LengthPicker project={project} />

      <View style={stageStyles.block}>
        <SectionTitle detail={`SwitchX rebuilds the world around you from the prompt and up to ${project.switchSettings.maxRefs} reference ${project.switchSettings.maxRefs === 1 ? 'image' : 'images'}. Your performance stays exactly as you shot it.`}>
          Where each part takes place
        </SectionTitle>
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

/** Full song or a snippet, and where the snippet starts. */
function LengthPicker({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const song = project.song;
  const range = videoRange(project);
  const preview = useSongPreview(song, { stopAt: range.end });
  if (!song) return null;
  const locked = project.planApproved || !!project.job;
  const full = !project.range;
  const length = range.end - range.start;
  const lengthKey = full ? 'full' : String(SNIPPET_LENGTHS.reduce((best, s) => (Math.abs(s - length) < Math.abs(best - length) ? s : best), SNIPPET_LENGTHS[0]));
  const hook = song.sections.find((s) => s.kind === 'hook');
  const starts = song.sections.filter((s, i, all) => all.findIndex((x) => x.label === s.label && Math.abs(x.start - s.start) < 0.01) === i);
  const inSnippet = preview.playing && preview.time >= range.start && preview.time <= range.end;

  const pickLength = (key: string) => {
    preview.pause();
    if (key === 'full') return apply(project.id, (p) => setRange(p, undefined));
    const start = project.range?.start ?? hook?.start ?? 0;
    apply(project.id, (p) => setRange(p, snippetRange(song, start, Number(key))));
  };
  const pickStart = (start: number) => {
    preview.pause();
    apply(project.id, (p) => setRange(p, snippetRange(song, start, length)));
  };

  return (
    <View style={stageStyles.block}>
      <SectionTitle detail={full ? `The whole song, ${formatTime(song.durationSec)}.` : `${formatTime(range.start)} to ${formatTime(range.end)} of the song. Only this part gets shot, switched and edited.`}>
        How long
      </SectionTitle>
      <Chips<string>
        label="Video length"
        value={lengthKey}
        disabled={locked}
        onChange={pickLength}
        options={[{ value: 'full', label: 'Full song', detail: formatTime(song.durationSec) }, ...SNIPPET_LENGTHS.map((s) => ({ value: String(s), label: `${s} sec`, detail: 'Snippet' }))]}
      />
      {!full ? (
        <>
          <T v="micro" c="smoke">
            Starts at
          </T>
          <Chips<number>
            label="Snippet starts at"
            value={starts.find((s) => Math.abs(s.start - range.start) < 0.05)?.start}
            disabled={locked}
            onChange={pickStart}
            options={starts.map((s) => ({ value: s.start, label: s.label, detail: formatTime(s.start) }))}
          />
          <Press
            onPress={() => (inSnippet ? preview.pause() : preview.play(range.start))}
            style={styles.listen}
            accessibilityLabel={inSnippet ? 'Pause the snippet' : 'Play the snippet'}>
            {inSnippet ? <Pause size={18} color={color.chalk} /> : <Play size={18} color={color.chalk} />}
            <T v="callout">{inSnippet ? `Playing, ${formatTime(preview.time - range.start)} of ${formatTime(length)}` : 'Hear the snippet'}</T>
          </Press>
        </>
      ) : null}
    </View>
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
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
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
