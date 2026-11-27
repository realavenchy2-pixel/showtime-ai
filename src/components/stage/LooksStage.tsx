import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { ChevronDown, ChevronUp, ImagePlus, X } from "@/components/icons";
import {
  addLookRef,
  removeLookRef,
  setFxIntensity,
  setFxPack,
  setLook,
  setLookEverywhere,
  setLookPrompt,
  videoRange,
} from "@/engine/actions";
import { currentStage } from "@/engine/stages";
import { formatTime } from "@/engine/director";
import { FX_INTENSITIES, FX_PACKS } from "@/engine/fx";
import { LOCATIONS, locationTitle } from "@/engine/samples";
import { useApp } from "@/engine/store";
import type {
  FxIntensity,
  FxPackId,
  LocationKind,
  Look,
  Project,
  Section,
} from "@/engine/types";
import { haptic } from "@/lib/haptics";
import { pickImage } from "@/media/pick";
import { color, radius, space, type } from "@/theme/tokens";

import { Button } from "../Button";
import { Chips } from "../Chips";
import { Frame } from "../Frame";
import { MediaImage } from "../MediaImage";
import { PlanBrief, usePlanLock } from "../PlanBrief";
import { CutawayRow, cutawaySummary, orderedCutaways } from "./Cutaways";
import { SectionTitle } from "../Screen";
import { T } from "../T";
import { showToast } from "../Toast";
import { LocationCard } from "./LocationCard";
import { JobBar, StageScreen, stageStyles } from "./StageChrome";
import {
  allLocationsLocked,
  optionCount,
  scenesOf,
  setCameraLook,
  setLocationCount,
  shotList,
} from "@/engine/production";
import { makeLocations } from "@/live/session";
import { Press } from "../Press";
import { CameraLookPicker } from "../CameraLookPicker";

const LOOK_OPTIONS: { value: LocationKind | "custom"; label: string }[] = [
  ...LOCATIONS.map((l) => ({ value: l.id, label: l.title })),
  { value: "custom", label: "Custom" },
];

/** Stage 2: the plan, locked before the shoot. What the artist wants, how long, and every scene the director laid out from it. */
export function LooksStage({ project }: { project: Project }) {
  const apply = useApp((s) => s.apply);
  const { thinking } = usePlanLock(project);
  const range = videoRange(project);
  // Before the first take the scenes are counted from the top; times show from the video's start.
  const rel = (t: number) => t - range.start;
  // Only the parts of the song inside the video get a look.
  const sections = (project.song?.sections ?? []).filter(
    (s) => s.end > range.start + 0.01 && s.start < range.end - 0.01,
  );
  const [openId, setOpenId] = useState<string | null>(sections[0]?.id ?? null);
  const working = project.job?.stage === "looks";
  // Looks can change until the switch starts.
  const open =
    project.plates === "none" && !project.job && project.shots.length === 0;

  return (
    <StageScreen
      project={project}
      stage="looks"
      footer={
        working ? (
          <JobBar project={project} />
        ) : project.planApproved && currentStage(project)?.id === "switch" && project.shots.length === 0 ? (
          // A touch-up opened a background: lock it and the switch redoes only that scene.
          scenesOf(project).some((sc) => sc.look?.reopened && !sc.look.locationLocked) ? (
            <T v="caption" c="ash" style={styles.center}>
              Pick or type a new background and lock it. Only that scene gets switched again.
            </T>
          ) : (
            <Button
              label="Back to the switch"
              onPress={() => router.replace(`/project/${project.id}/switch`)}
            />
          )
        ) : project.planApproved ? (
          allLocationsLocked(project) ||
          (project.takes.length > 0 &&
            // After a touch-up added scenes, their backgrounds get locked before the camera comes out.
            (!project.versions?.length ||
              scenesOf(project).every(
                (sc) =>
                  sc.look?.locationLocked ||
                  project.takes.some((t) => t.scene === sc.index),
              ))) ? (
            <Button
              label="Go shoot"
              onPress={() => router.replace(`/project/${project.id}/shoot`)}
            />
          ) : (
            <T v="caption" c="ash" style={styles.center}>
              {`Lock every background to start shooting. ${scenesOf(project).filter((sc) => !sc.look?.locationLocked && !(project.versions?.length && project.takes.some((t) => t.scene === sc.index))).length} to go.`}
            </T>
          )
        ) : (
          <T v="caption" c="ash" style={styles.center}>
            {thinking
              ? "Writing your shot list."
              : "Three quick questions and your camera, then the director writes your shot list."}
          </T>
        )
      }
    >
      {project.planApproved ? (
        project.brief ? (
          <View style={stageStyles.block}>
            <SectionTitle>What you asked for</SectionTitle>
            <T v="body" c="smoke">
              {project.brief}
            </T>
          </View>
        ) : null
      ) : (
        <PlanBrief project={project} />
      )}

      {project.planApproved && scenesOf(project).length ? (
        <View style={stageStyles.block}>
          <SectionTitle detail="Made before you shoot, with nobody in them: the one you lock is exactly where you get switched to. Pick one per scene, type a change for new options, then lock it.">
            Your shot list
          </SectionTitle>
          <View style={styles.countRow}>
            <T v="callout" style={styles.flex}>
              Options per scene
            </T>
            {[1, 2, 3, 4].map((n) => (
              <Press
                key={n}
                onPress={() => {
                  apply(project.id, (p) => setLocationCount(p, n));
                  makeLocations(project.id);
                }}
                style={[
                  styles.count,
                  optionCount(project) === n && styles.countOn,
                ]}
                accessibilityLabel={`${n} ${n === 1 ? "option" : "options"} per scene`}
              >
                <T v="callout" c={optionCount(project) === n ? "ink" : "chalk"}>
                  {String(n)}
                </T>
              </Press>
            ))}
          </View>
          {shotList(project).map((item) => (
            <LocationCard
              key={item.scene.section.id}
              project={project}
              scene={item.scene}
              lyrics={item.lyrics}
            />
          ))}
          <Button
            label="See every image in the library"
            variant="quiet"
            onPress={() => router.push(`/project/${project.id}/library`)}
          />
        </View>
      ) : null}

      {project.planApproved ? (
        <View style={stageStyles.block}>
          <SectionTitle detail="Each one is modeled on a camera music videos are shot on. Backgrounds made from now on match it, and your footage is saved untouched, so you can change it after the shoot.">
            Your camera
          </SectionTitle>
          <CameraLookPicker
            value={project.cameraLook}
            onChange={(id) => apply(project.id, (p) => setCameraLook(p, id))}
          />
        </View>
      ) : null}

      {project.planApproved ? (
        <>
          <View style={stageStyles.block}>
            <SectionTitle
              detail={`The switch rebuilds the world around you from the prompt and up to ${project.switchSettings.maxRefs} reference ${project.switchSettings.maxRefs === 1 ? "image" : "images"}. Your performance stays exactly as you shot it.`}
            >
              {sections.some((s) => s.scene)
                ? "Fine-tune the switch"
                : "Where each part takes place"}
            </SectionTitle>
            {sections.map((section) => {
              const look = project.looks[section.id];
              if (!look) return null;
              return (
                <LookCard
                  key={section.id}
                  section={section}
                  from={rel(section.start)}
                  to={rel(section.end)}
                  look={look}
                  editable={open}
                  expanded={openId === section.id}
                  maxRefs={project.switchSettings.maxRefs}
                  onToggle={() =>
                    setOpenId((id) => (id === section.id ? null : section.id))
                  }
                  onLocation={(loc) =>
                    apply(project.id, (p) => setLook(p, section.id, loc))
                  }
                  onPrompt={(text) =>
                    apply(project.id, (p) => setLookPrompt(p, section.id, text))
                  }
                  onEverywhere={() => {
                    if (look.location === "custom") return;
                    haptic.confirm();
                    apply(project.id, (p) =>
                      setLookEverywhere(p, look.location as LocationKind),
                    );
                  }}
                  onAddRef={async () => {
                    try {
                      const img = await pickImage();
                      if (img)
                        apply(project.id, (p) =>
                          addLookRef(p, section.id, {
                            label: img.name,
                            source: "upload",
                            mediaId: img.mediaId,
                            uri: img.uri,
                          }),
                        );
                    } catch {
                      showToast("That image could not be added.");
                    }
                  }}
                  onRemoveRef={(refId) =>
                    apply(project.id, (p) =>
                      removeLookRef(p, section.id, refId),
                    )
                  }
                />
              );
            })}
          </View>

          {project.broll.ideas.length ? (
            <View style={stageStyles.block}>
              <SectionTitle
                detail={`${cutawaySummary(project)} Spots move to cut points once your takes are in.`}
              >
                B-roll
              </SectionTitle>
              {orderedCutaways(project).map((idea) => (
                <CutawayRow
                  key={idea.id}
                  project={project}
                  idea={idea}
                  disabled={idea.status !== "idea"}
                />
              ))}
            </View>
          ) : null}

          <View style={stageStyles.block}>
            <SectionTitle
              detail={
                FX_PACKS.find((x) => x.id === project.fx.pack)?.feel ??
                "Hits land on the beat grid of your song."
              }
            >
              Effects
            </SectionTitle>
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
              onChange={(intensity) =>
                apply(project.id, (p) => setFxIntensity(p, intensity))
              }
              options={FX_INTENSITIES.map((x) => ({
                value: x.id,
                label: x.id,
              }))}
            />
          </View>

        </>
      ) : null}
    </StageScreen>
  );
}

interface CardProps {
  section: Section;
  /** Seconds into the video. */
  from: number;
  to: number;
  look: Look;
  editable: boolean;
  expanded: boolean;
  maxRefs: number;
  onToggle: () => void;
  onLocation: (loc: LocationKind | "custom") => void;
  onPrompt: (text: string) => void;
  onEverywhere: () => void;
  onAddRef: () => void;
  onRemoveRef: (refId: string) => void;
}

function LookCard({
  section,
  from,
  to,
  look,
  editable,
  expanded,
  maxRefs,
  onToggle,
  onLocation,
  onPrompt,
  onEverywhere,
  onAddRef,
  onRemoveRef,
}: CardProps) {
  const set = look.location === "custom" ? "darkVoid" : look.location;
  const Chevron = expanded ? ChevronUp : ChevronDown;
  return (
    <View style={styles.card}>
      <Press
        onPress={onToggle}
        scaleTo={0.99}
        style={styles.cardHead}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${section.label}, ${locationTitle(look.location)}`}
      >
        <View style={styles.swatch}>
          {look.refs[0] ? (
            <MediaImage
              mediaId={look.refs[0].mediaId}
              uri={look.refs[0].uri}
              style={styles.fill}
            />
          ) : (
            <Frame kind={set} relit rounded={false} noArtist />
          )}
        </View>
        <View style={stageStyles.flex}>
          <T
            v="micro"
            c="smoke"
          >{`${section.label}, ${formatTime(from)} to ${formatTime(to)}`}</T>
          <T v="label">{locationTitle(look.location)}</T>
        </View>
        <Chevron size={20} color={color.smoke} />
      </Press>

      {expanded ? (
        <View style={styles.cardBody}>
          <Chips<LocationKind | "custom">
            label={`Look for ${section.label}`}
            value={look.location}
            disabled={!editable}
            onChange={onLocation}
            options={LOOK_OPTIONS}
          />

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
            <T
              v="micro"
              c="smoke"
            >{`Reference images ${look.refs.length}/${maxRefs}`}</T>
            <View style={styles.refs}>
              {look.refs.map((ref) => (
                <View key={ref.id} style={styles.ref}>
                  <MediaImage
                    mediaId={ref.mediaId}
                    uri={ref.uri}
                    style={styles.fill}
                    label={ref.label}
                  />
                  {editable ? (
                    <Press
                      onPress={() => onRemoveRef(ref.id)}
                      style={styles.refRemove}
                      accessibilityLabel={`Remove reference ${ref.label}`}
                      hitSlop={8}
                    >
                      <X size={14} color={color.chalk} />
                    </Press>
                  ) : null}
                </View>
              ))}
              {editable && look.refs.length < maxRefs ? (
                <Press
                  onPress={onAddRef}
                  style={[styles.ref, styles.refAdd]}
                  accessibilityLabel="Add a reference image"
                >
                  <ImagePlus size={20} color={color.smoke} />
                </Press>
              ) : null}
            </View>
            <T v="caption" c="ash">
              {look.refs.length
                ? "The switch matches these. The prompt directs what happens."
                : "Optional. Without one I build a reference from a frame of your take."}
            </T>
          </View>

          {editable && look.location !== "custom" ? (
            <Button
              label={`Use ${locationTitle(look.location).toLowerCase()} for the whole video`}
              variant="quiet"
              onPress={onEverywhere}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  countRow: { flexDirection: "row", alignItems: "center", gap: space.s },
  count: {
    width: 40,
    height: 36,
    borderRadius: radius.s,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.flat,
  },
  countOn: { backgroundColor: color.accent },
  center: {
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
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
    overflow: "hidden",
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
    padding: space.s,
    paddingRight: space.l,
    minHeight: 64,
  },
  swatch: {
    width: 84,
    aspectRatio: 16 / 9,
    borderRadius: radius.s,
    overflow: "hidden",
    backgroundColor: color.flat,
  },
  fill: {
    width: "100%",
    height: "100%",
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
    textAlignVertical: "top",
  },
  refs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
  },
  ref: {
    width: 72,
    height: 72,
    borderRadius: radius.s,
    overflow: "hidden",
    backgroundColor: color.flat,
  },
  refAdd: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: color.hairlineStrong,
    backgroundColor: "transparent",
  },
  refRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.scrim,
  },
});
