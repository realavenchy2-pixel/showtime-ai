import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { Check, ImagePlus, Pause, Play, Sparkles, X } from "@/components/icons";
import {
  pickPart,
  snippetRange,
  suggestedLength,
  videoRange,
} from "@/engine/actions";
import { formatTime } from "@/engine/director";
import {
  addPlanRef,
  composeBrief,
  removePlanRef,
  setInspiration,
  setBackgrounds,
  setMustHaves,
  setSongAbout,
  smartSnippetStart,
  setCameraLook,
} from "@/engine/production";
import { useApp } from "@/engine/store";
import type { Project, VideoLength } from "@/engine/types";
import { haptic } from "@/lib/haptics";
import { lockPlan, useServer } from "@/live/session";
import { pickImage } from "@/media/pick";
import { useSongPreview } from "@/media/preview";
import { color, radius, space } from "@/theme/tokens";

import { Button } from "./Button";
import { CameraLookPicker } from "./CameraLookPicker";
import { Press } from "./Press";
import { RangeBar } from "./RangeBar";
import { T } from "./T";
import { showToast } from "./Toast";

/** Locks the plan from everything the artist said: the vision or idea, what the song is about, the must-haves. */
export function usePlanLock(project: Project) {
  const thinking = useServer((s) => !!s.thinking[project.id]);
  const length = project.length ?? suggestedLength(project);
  return {
    thinking,
    lock: () => {
      haptic.confirm();
      // Read the newest copy: the artist may have just typed into the plan.
      const latest = useApp.getState().projects[project.id] ?? project;
      lockPlan(project.id, {
        brief: composeBrief(latest),
        places: latest.path === "vision" ? (latest.brief ?? "") : "",
        length: latest.length ?? length,
      });
    },
  };
}

type Step = "where" | "part" | "about" | "musts" | "camera";
const SNIPPETS = [15, 30, 45, 60];

/**
 * Lock in the shoot plan, one question at a time:
 * 0. Where it happens: switched into new backgrounds, or shot where the artist really is. Asked
 *    first because everything after depends on it: backgrounds to pick, the set guide, the switch.
 * 1. Which part of the song: a snippet (smart pick, drag or type it) or the full song with the ends trimmed.
 * 2. What the song is about and its message, in your words. Explicit is fine.
 * 3. Must-haves, your references and, on "Work with my vision", the vision itself.
 * 4. The camera, so the backgrounds get made to match it.
 * Then the director reads all of that (and the lyrics, when the song has them), writes the shot list and calls every scene's shot.
 */
export function PlanBrief({
  project,
  onLocked,
}: {
  project: Project;
  withButton?: boolean;
  onLocked?: () => void;
}) {
  const apply = useApp((s) => s.apply);
  const { thinking, lock } = usePlanLock(project);
  const song = project.song;
  const [step, setStep] = useState<Step>(
    !project.backgrounds
      ? "where"
      : project.partPicked
        ? project.songAbout
          ? "musts"
          : "about"
        : "part",
  );
  const [mode, setMode] = useState<VideoLength>(project.length ?? "snippet");
  const [seconds, setSeconds] = useState(30);
  const current = videoRange(project);
  // Starts on what the picked mode means: the whole song for Full song, the smart snippet otherwise.
  const [range, setRange] = useState(() =>
    project.partPicked
      ? current
      : !song
        ? { start: 0, end: 0 }
        : (project.length ?? "snippet") === "full"
          ? { start: 0, end: song.durationSec }
          : snippetRange(song, smartSnippetStart(song, 30), 30),
  );
  // Listen while picking: the part picked, or the whole song.
  const [listening, setListening] = useState<"part" | "full">("part");
  const preview = useSongPreview(song, { stopAt: listening === "part" ? range.end : undefined });
  const playingPart = preview.playing && listening === "part";
  /** Moves the part; a part that's playing follows it. */
  const movePart = (r: { start: number; end: number }) => {
    if (playingPart && Math.abs(r.start - range.start) > 0.25) preview.seek(r.start);
    setRange(r);
  };
  const listen = (which: "part" | "full") => {
    haptic.select();
    if (preview.playing && listening === which) return preview.pause();
    setListening(which);
    const inPart = preview.time >= range.start && preview.time < range.end - 0.3;
    if (which === "part") preview.play(listening === "part" && inPart ? undefined : range.start);
    else preview.play(listening === "full" && preview.time < song!.durationSec - 0.3 ? undefined : 0);
  };
  const [about, setAbout] = useState(project.songAbout ?? "");
  const [message, setMessage] = useState(project.songMessage ?? "");
  const [musts, setMusts] = useState(project.mustHaves ?? "");
  const [vision, setVision] = useState(project.brief ?? "");
  const [link, setLink] = useState(project.inspiration ?? "");
  if (!song) return null;
  const busy = project.planApproved || !!project.job || thinking;
  const isVision = project.path === "vision";
  const real = project.backgrounds === "real";
  const chooseWhere = (mode: "new" | "real") => {
    haptic.select();
    apply(project.id, (p) => setBackgrounds(p, mode));
    setStep("part");
  };

  const chooseMode = (m: VideoLength) => {
    haptic.select();
    setMode(m);
    movePart(
      m === "full"
        ? { start: 0, end: song.durationSec }
        : snippetRange(song, smartSnippetStart(song, seconds), seconds),
    );
  };
  const chooseSeconds = (n: number) => {
    haptic.select();
    setSeconds(n);
    movePart(snippetRange(song, range.start, n));
  };
  const savePart = () => {
    preview.pause();
    apply(project.id, (p) => pickPart(p, mode, range));
    setStep("about");
  };
  const saveAbout = () => {
    apply(project.id, (p) => setSongAbout(p, about, message));
    setStep("musts");
  };
  const saveMusts = () => {
    apply(project.id, (p) => {
      let next = setMustHaves(p, musts);
      next = setInspiration(next, link);
      if (isVision) next = { ...next, brief: vision.slice(0, 1200) };
      return next;
    });
    setStep("camera");
  };
  const finish = () => {
    // Read the saved project on the next tick so the lock sees everything picked.
    setTimeout(() => {
      lock();
      onLocked?.();
    }, 0);
  };

  return (
    <View style={styles.wrap}>
      <T v="title" accessibilityRole="header">
        {"Let's lock in the shoot plan"}
      </T>
      <Steps
        step={step}
        onStep={(s) =>
          s === "where" ||
          (s === "part" && project.backgrounds) ||
          project.partPicked
            ? setStep(s)
            : undefined
        }
      />

      {step === "where" ? (
        <View style={styles.group}>
          <T v="heading">Where does your video happen?</T>
          <T v="caption" c="smoke">
            You can shoot anywhere either way. This decides if I build new
            places around you.
          </T>
          <Mode
            title="Put me somewhere new"
            detail="Shoot in any room. I switch every scene into its own world: rooftops, stages, the moon. You pick and lock each background."
            on={project.backgrounds === "new"}
            onPress={() => chooseWhere("new")}
          />
          <Mode
            title="Shoot where I am"
            detail="Your real spots, as they are: the block, your car, the studio. No backgrounds to pick, no switch. Cut and edited on the beat, for half a credit."
            on={real}
            onPress={() => chooseWhere("real")}
          />
        </View>
      ) : null}

      {step === "part" ? (
        <View style={styles.group}>
          <T v="heading">Which part of the song?</T>
          <View style={styles.modes} accessibilityRole="radiogroup">
            <Mode
              title="Snippet"
              detail="Any part, any length"
              on={mode === "snippet"}
              onPress={() => chooseMode("snippet")}
            />
            <Mode
              title="Full song"
              detail="Trim the start or end"
              on={mode === "full"}
              onPress={() => chooseMode("full")}
            />
          </View>
          {mode === "snippet" ? (
            <>
              <View style={styles.chips}>
                {SNIPPETS.map((n) => (
                  <Press
                    key={n}
                    onPress={() => chooseSeconds(n)}
                    style={[styles.chip, seconds === n && styles.chipOn]}
                    accessibilityLabel={`${n} seconds`}
                  >
                    <T
                      v="callout"
                      c={seconds === n ? "ink" : "chalk"}
                    >{`${n}s`}</T>
                  </Press>
                ))}
                <Press
                  onPress={() => {
                    haptic.select();
                    movePart(
                      snippetRange(
                        song,
                        smartSnippetStart(song, seconds),
                        seconds,
                      ),
                    );
                  }}
                  style={styles.smart}
                  accessibilityLabel="Smart pick: the strongest part"
                >
                  <Sparkles size={14} color={color.accentText} />
                  <T v="callout" c="accentText">
                    Smart pick
                  </T>
                </Press>
              </View>
              <RangeBar
                song={song}
                range={range}
                mode="window"
                playhead={preview.playing ? preview.time : undefined}
                onChange={(r) => movePart(snippetRange(song, r.start, seconds))}
              />
              <TimeRow
                label="Starts at"
                value={range.start}
                onChange={(t) => movePart(snippetRange(song, t, seconds))}
                trailing={`ends ${formatTime(range.end)}`}
              />
            </>
          ) : (
            <>
              <RangeBar
                song={song}
                range={range}
                mode="trim"
                playhead={preview.playing ? preview.time : undefined}
                onChange={movePart}
              />
              <TimeRow
                label="Start"
                value={range.start}
                onChange={(t) =>
                  movePart({
                    start: Math.min(t, range.end - 5),
                    end: range.end,
                  })
                }
                trailing={`cuts ${formatTime(range.start)} off the top`}
              />
              <TimeRow
                label="End"
                value={range.end}
                onChange={(t) =>
                  movePart({
                    start: range.start,
                    end: Math.max(
                      range.start + 5,
                      Math.min(song.durationSec, t),
                    ),
                  })
                }
                trailing={`cuts ${formatTime(song.durationSec - range.end)} off the end`}
              />
            </>
          )}
          <T
            v="caption"
            c="smoke"
          >{`${formatTime(range.end - range.start)} of video, ${formatTime(range.start)} to ${formatTime(range.end)}.`}</T>
          <View style={styles.listenRow}>
            <ListenButton
              label={mode === "full" ? "Play trimmed song" : "Play this part"}
              on={playingPart}
              disabled={!preview.ready}
              onPress={() => listen("part")}
            />
            <ListenButton
              label="Play full song"
              on={preview.playing && listening === "full"}
              disabled={!preview.ready}
              onPress={() => listen("full")}
            />
            {preview.playing ? (
              <T v="caption" c="smoke" style={styles.tabular}>
                {formatTime(preview.time)}
              </T>
            ) : null}
          </View>
          <Button label="Use this part" disabled={busy} onPress={savePart} />
        </View>
      ) : null}

      {step === "about" ? (
        <View style={styles.group}>
          <T v="heading">What is the song about?</T>
          <T v="caption" c="smoke">
            Say it how it is, explicit is fine. The more you give me, the better
            the shot list.
          </T>
          <TextInput
            value={about}
            onChangeText={setAbout}
            multiline
            maxLength={1500}
            placeholder="Coming up from nothing, the people who doubted me, what I had to do to get here."
            placeholderTextColor={color.ash}
            style={styles.box}
            accessibilityLabel="What the song is about"
          />
          <T v="heading">The overall message</T>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={600}
            placeholder="Never fold. Everything I got, I earned."
            placeholderTextColor={color.ash}
            style={[styles.box, styles.boxSmall]}
            accessibilityLabel="The overall message"
          />
          <Button
            label="Next"
            disabled={busy || !about.trim()}
            onPress={saveAbout}
          />
          {isVision ? null : (
            // Letting the director drive: it can go by the song alone.
            <Button
              label="Skip, you decide"
              variant="quiet"
              disabled={busy}
              onPress={() => setStep("musts")}
            />
          )}
        </View>
      ) : null}

      {step === "musts" ? (
        <View style={styles.group}>
          {isVision ? (
            <>
              <T v="heading">Your vision</T>
              <T v="caption" c="smoke">
                Tell me the video you already see: places, outfits, moments,
                cutaways. I fill in the rest and we agree on the plan.
              </T>
              <TextInput
                value={vision}
                onChangeText={setVision}
                multiline
                maxLength={1200}
                placeholder={
                  real
                    ? "Open in my car at night, then the studio, end on the block with the whole crew."
                    : "Open on a rooftop at night, then the trap house kitchen, end on the block with the whole crew."
                }
                placeholderTextColor={color.ash}
                style={styles.box}
                accessibilityLabel="Your vision"
              />
            </>
          ) : null}
          {isVision ? null : (
            <Button
              label="Skip to the camera"
              variant="quiet"
              disabled={busy}
              onPress={saveMusts}
            />
          )}
          <T v="heading">Any must-haves?</T>
          <T v="caption" c="smoke">
            Anything the video has to have, one per line. Leave it empty and I
            decide everything.
          </T>
          <TextInput
            value={musts}
            onChangeText={setMusts}
            multiline
            maxLength={800}
            placeholder={
              real
                ? "A scene in my car\nMy chain in a close-up"
                : "At least one scene on the moon\nMy chain in a close-up"
            }
            placeholderTextColor={color.ash}
            style={[styles.box, styles.boxSmall]}
            accessibilityLabel="Must-haves"
          />

          <T v="heading">References</T>
          <T v="caption" c="smoke">
            Photos of places, looks or moments you want, and a link to a video
            you love. Optional.
          </T>
          <View style={styles.refs}>
            {(project.planRefs ?? []).map((r) => (
              <View key={r.id} style={styles.ref}>
                {r.uri ? (
                  <Image
                    source={{ uri: r.uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                ) : null}
                <Press
                  onPress={() =>
                    apply(project.id, (p) => removePlanRef(p, r.id))
                  }
                  style={styles.refX}
                  accessibilityLabel={`Remove ${r.label}`}
                >
                  <X size={12} color={color.chalk} />
                </Press>
              </View>
            ))}
            <Press
              onPress={async () => {
                try {
                  const img = await pickImage();
                  if (img)
                    apply(project.id, (p) =>
                      addPlanRef(p, {
                        label: img.name,
                        uri: img.uri,
                        mediaId: img.mediaId,
                      }),
                    );
                } catch {
                  showToast("That image could not be added.");
                }
              }}
              style={[styles.ref, styles.refAdd]}
              accessibilityLabel="Add a reference image"
            >
              <ImagePlus size={20} color={color.smoke} />
            </Press>
          </View>
          <TextInput
            value={link}
            onChangeText={setLink}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="Link to a video for inspiration"
            placeholderTextColor={color.ash}
            style={[styles.box, styles.linkBox]}
            accessibilityLabel="Link to a video for inspiration"
          />

          <Button
            label="Next"
            disabled={busy || (isVision && !vision.trim())}
            onPress={saveMusts}
          />
        </View>
      ) : null}

      {step === "camera" ? (
        <View style={styles.group}>
          <T v="heading">Pick your camera</T>
          <T v="caption" c="smoke">
            {real
              ? "Your footage gets this look in the edit: the color, the contrast, the texture. It's saved untouched, so you can change it later."
              : "Your backgrounds get made to match it: the light, the lens, the texture. Your footage is saved untouched, so you can change it later."}
          </T>
          <CameraLookPicker
            value={project.cameraLook}
            onChange={(id) => apply(project.id, (p) => setCameraLook(p, id))}
          />
          <Button
            label={thinking ? "Writing your shot list" : "Make my shot list"}
            busy={thinking}
            disabled={busy || (isVision && !vision.trim())}
            onPress={finish}
          />
          <T v="caption" c="ash" style={styles.center}>
            {`${song?.lyrics.length ? "I read your lyrics and everything you said" : "I go by everything you said and where the song hits hardest"}, then plan every scene and call its shot. ${real ? "Next you get a set guide for each scene." : "Next you'll see the backgrounds and lock each one."}`}
          </T>
        </View>
      ) : null}
    </View>
  );
}

function Steps({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  const all: { id: Step; label: string }[] = [
    { id: "where", label: "Where" },
    { id: "part", label: "Part" },
    { id: "about", label: "Song" },
    { id: "musts", label: "Musts" },
    { id: "camera", label: "Camera" },
  ];
  return (
    <View style={styles.steps}>
      {all.map((s) => (
        <Press
          key={s.id}
          onPress={() => onStep(s.id)}
          style={[styles.step, step === s.id && styles.stepOn]}
          accessibilityLabel={s.label}
        >
          <T v="micro" c={step === s.id ? "chalk" : "ash"}>
            {s.label}
          </T>
        </Press>
      ))}
    </View>
  );
}

function Mode({
  title,
  detail,
  on,
  onPress,
}: {
  title: string;
  detail: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      onPress={onPress}
      scaleTo={0.98}
      style={[styles.mode, on && styles.modeOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${title}. ${detail}`}
    >
      <View style={styles.modeTop}>
        <T v="label" style={styles.flex}>
          {title}
        </T>
        {on ? <Check size={18} color={color.accent} strokeWidth={3} /> : null}
      </View>
      <T v="caption" c="smoke">
        {detail}
      </T>
    </Press>
  );
}

function ListenButton({ label, on, disabled, onPress }: { label: string; on: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      style={[styles.listen, on && styles.listenOn, disabled && styles.listenOff]}
      accessibilityLabel={on ? `Pause, ${label.toLowerCase()}` : label}
    >
      {on ? <Pause size={14} color={color.chalk} /> : <Play size={14} color={color.chalk} />}
      <T v="callout" c="chalk">
        {label}
      </T>
    </Press>
  );
}

/** Type a time as 1:23 or 83. */
function TimeRow({
  label,
  value,
  onChange,
  trailing,
}: {
  label: string;
  value: number;
  onChange: (t: number) => void;
  trailing?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const m = /^(\d+):(\d{1,2})$/.exec(text.trim());
    const t = m ? Number(m[1]) * 60 + Number(m[2]) : Number(text.trim());
    if (Number.isFinite(t) && t >= 0) onChange(t);
    setText(null);
  };
  return (
    <View style={styles.timeRow}>
      <T v="callout" style={styles.timeLabel}>
        {label}
      </T>
      <TextInput
        value={text ?? formatTime(value)}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="numbers-and-punctuation"
        style={styles.time}
        accessibilityLabel={`${label}, type a time like 1:05`}
      />
      {trailing ? (
        <T v="caption" c="smoke" style={styles.flex}>
          {trailing}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.l },
  group: { gap: space.m },
  flex: { flex: 1 },
  center: { textAlign: "center" },
  steps: { flexDirection: "row", gap: space.s },
  step: {
    flex: 1,
    paddingVertical: space.s,
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: color.flat,
  },
  stepOn: {
    backgroundColor: color.rig,
    borderWidth: 1,
    borderColor: color.accent,
  },
  modes: { flexDirection: "row", gap: space.m },
  mode: {
    flex: 1,
    gap: 4,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  modeOn: { borderColor: color.accent },
  modeTop: { flexDirection: "row", alignItems: "center", gap: space.s },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.s,
    alignItems: "center",
  },
  chip: {
    minWidth: 52,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    backgroundColor: color.flat,
    alignItems: "center",
  },
  chipOn: { backgroundColor: color.accent },
  listenRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s },
  listen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
  },
  listenOn: { backgroundColor: color.rig, borderColor: color.chalk },
  listenOff: { opacity: 0.4 },
  tabular: { fontVariant: ["tabular-nums"] },
  smart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.m,
    paddingVertical: space.s,
    borderRadius: radius.pill,
    backgroundColor: color.accentSoft,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: space.m },
  timeLabel: { width: 72 },
  time: {
    width: 76,
    minHeight: 40,
    paddingHorizontal: space.m,
    borderRadius: radius.s,
    backgroundColor: color.flat,
    color: color.chalk,
    fontSize: 16,
    textAlign: "center",
  },
  box: {
    minHeight: 96,
    maxHeight: 200,
    padding: space.m,
    borderRadius: radius.m,
    backgroundColor: color.flat,
    borderWidth: 1,
    borderColor: color.hairline,
    color: color.chalk,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  boxSmall: { minHeight: 64 },
  linkBox: { minHeight: 48, maxHeight: 48 },
  refs: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
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
    borderColor: color.hairline,
    borderStyle: "dashed",
  },
  refX: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
});
