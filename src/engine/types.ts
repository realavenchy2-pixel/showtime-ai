// Core data model for a Showtime AI project.
// Pure types only: no React Native imports, so the engine runs in tests and on any server.

export type StageId = 'song' | 'shoot' | 'cut' | 'looks' | 'switch' | 'broll' | 'edit' | 'export';

export type StageStatus = 'locked' | 'current' | 'working' | 'needs_you' | 'done' | 'skipped';

/** Built-in looks. A section can also carry a custom look written by the artist. */
export type LocationKind = 'beach' | 'alley' | 'whiteVoid' | 'darkVoid' | 'hangingMic';

export type Vibe = 'Drill' | 'Trap' | 'Melodic' | 'Boom bap' | 'Dark';

export type Format = '16:9' | '9:16' | '1:1' | '4:5';

/** A snippet (about 30 seconds) or the full song from wherever the artist starts. */
export type VideoLength = 'snippet' | 'full';

export type SectionKind = 'intro' | 'verse' | 'hook' | 'bridge' | 'outro';

export interface Section {
  id: string;
  kind: SectionKind;
  label: string;
  /** Song time in seconds. */
  start: number;
  end: number;
  /**
   * A stretch of the video the director laid out by time, not a part the artist named.
   * Each scene gets its own look. Songs set up in the app use scenes; verse and hook still work underneath.
   */
  scene?: boolean;
}

export interface LyricWord {
  text: string;
  /** Song time in seconds when the word lands. */
  t: number;
}

export interface LyricLine {
  sectionId: string;
  words: LyricWord[];
}

export interface Song {
  id: string;
  title: string;
  durationSec: number;
  bpm: number;
  /** Song time of the first downbeat. The bar grid starts here. */
  downbeatSec: number;
  sections: Section[];
  lyrics: LyricLine[];
  analyzed: boolean;
  /** A demo beat that ships with the app, or the artist's own file. */
  source: 'demo' | 'import';
  /** Demo track id, or the media id of the imported audio file. */
  audioId?: string;
  /** Loudness peaks for drawing the waveform, 0 to 1. */
  peaks?: number[];
}

export type TakeAngle = 'Wide' | 'Close-up' | 'Low angle' | 'Second outfit';
export type TakeScope = 'Full song' | 'Hook only';

export interface PlannedTake {
  angle: TakeAngle;
  scope: TakeScope;
}

export interface Take {
  id: string;
  n: number;
  /** Recorded in the app, uploaded from the camera roll, or part of a sample project. */
  source: 'record' | 'upload' | 'sample';
  label: string;
  /** The planned shot this take filled, used to vary the cut. */
  angle: TakeAngle;
  /** Performed for the hooks: the cut keeps it out of every other section. */
  hookOnly?: boolean;
  /** Song time where the take starts and ends. */
  start: number;
  end: number;
  /** Seconds into the video file where song time `start` lands. */
  mediaOffsetSec: number;
  fps: number;
  width: number;
  height: number;
  /** The footage itself. Sample takes have none. */
  mediaId?: string;
  /** Small still for lists and covers. */
  thumb?: string;
  /** Delay found when lining the take up with the song (Bluetooth, phone lag). */
  lagMs: number;
  /** How the take was lined up: by the recorder clock, or by matching its sound to the song. */
  sync: 'clock' | 'audio';
  /** Something the director noticed, e.g. drifting out of frame. */
  flag?: string;
  /** Recorded for this scene of the plan (0-based, in order). Scenes are shot one at a time. */
  scene?: number;
}

/** Uploaded footage that could not be lined up with the song. Used as cutaways. */
export interface Clip {
  id: string;
  label: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  mediaId?: string;
  thumb?: string;
}

export interface CutSegment {
  id: string;
  sectionId: string;
  start: number;
  end: number;
  /** Empty when no take covers this part of the song. */
  takeId: string;
}

export interface RefImage {
  id: string;
  label: string;
  /** Uploaded by the artist or generated from a frame of a take. */
  source: 'upload' | 'generated';
  mediaId?: string;
  uri?: string;
  /**
   * The empty location, generated at the plan before anything is shot (no artist in it).
   * It is what the artist gets switched into, so it goes to SwitchX as the scene's first reference.
   */
  location?: boolean;
  /** What the image was generated from. */
  prompt?: string;
  /** Already on the provider (made by the studio server), so the switch doesn't upload it again. */
  remoteUri?: string;
  /**
   * Made because the artist asked for something different (a change, or a fresh set). The studio
   * server makes these with its backup image model, so a redo is a real second opinion.
   */
  retry?: boolean;
}

/** Where a section takes place: what SwitchX is asked to build around the artist. */
export interface Look {
  location: LocationKind | 'custom';
  /** What happens in the scene. SwitchX 3.0 follows this closely. */
  prompt: string;
  /** Up to four reference images. */
  refs: RefImage[];
  /** Background options generated for this scene before the shoot (no artist in them). The picked one is the location ref. */
  options?: RefImage[];
  /** The artist locked this scene's background. */
  locationLocked?: boolean;
  /** A touch-up opened this background again; the switch waits until it is locked. */
  reopened?: boolean;
}

/** How SwitchX decides what to keep from the source. */
export type AlphaMode = 'auto' | 'select' | 'fill' | 'custom';

export interface SwitchSettings {
  /** The SwitchX version in use. 3.0 when the key has it, the public API model otherwise. */
  model: string;
  /** Most frames the model takes in one shot: 360 on 3.0, 240 on the public API. */
  maxFrames: number;
  /** Most reference images per shot. */
  maxRefs: number;
  alphaMode: AlphaMode;
  /** Shortest side of the render. Explore at 720, finish higher. */
  resolution: 720 | 1080 | 2160;
}

export type ShotStatus = 'queued' | 'rendering' | 'ready' | 'approved' | 'failed';

export interface Shot {
  id: string;
  n: number;
  sectionId: string;
  takeId: string;
  /** Song-time range sent to the switch, including handles on both sides. */
  start: number;
  end: number;
  frames: number;
  fps: number;
  status: ShotStatus;
  /** 0 to 1 while rendering. */
  progress: number;
  /** Rendering time this shot needs in the simulation. */
  workMs: number;
  /** Set when the result needs a second look before approval. */
  flag?: string;
  /** Simulation only: the note this shot comes back with on its first render. */
  pendingFlag?: string;
  /** Live pipeline: the provider's job id and results. */
  remoteId?: string;
  renderUrl?: string;
  alphaUrl?: string;
  renderMediaId?: string;
  error?: string;
  /** Switched after the b-roll: performance for a cutaway that was dropped or didn't render. */
  fill?: boolean;
  /** Already rendered for an earlier version and still right: same take, same scene, same look. Costs nothing. */
  reused?: boolean;
}

/**
 * A finished switch render the project already paid for, kept when a touch-up reopens the switch.
 * An unchanged shot is never paid for twice.
 */
export interface SavedRender extends Shot {
  /** The look it was rendered with. It is reused only while the scene still has that look. */
  lookKey: string;
  /** The version it was first exported in. */
  madeFor?: number;
}

/**
 * One finished export. Every export is a new version, numbered in order and named for what it is,
 * so the artist can go back to any of them and the files never overwrite each other.
 */
export interface Version {
  id: string;
  /** 1, 2, 3 in the order they were exported. */
  n: number;
  part: 'snippet' | 'full';
  range: { start: number; end: number };
  at: number;
  /** What changed since the version before, in plain words. Empty for the first one. */
  changes: string[];
  formats: Format[];
  resolution: Resolution;
  files?: { format: Format; mediaId: string; extension: string }[];
  /** What it was made from, to tell the next version what changed. */
  recipe: VersionRecipe;
}

export interface VersionRecipe {
  range: { start: number; end: number };
  takeIds: string[];
  /** Section id to the look key it was switched with. */
  looks: Record<string, string>;
  broll: { id: string; shot: string }[];
  fx: string;
  cutSeed: number;
}

export type BrollStatus = 'idea' | 'clip' | 'approved';
/** The b-roll engines the studio server can run. Never shown to the artist. */
export type BrollModel = 'magi' | 'omni' | 'h3';

export interface BrollIdea {
  id: string;
  lyric: string;
  /** The shot description sent to the video model. */
  shot: string;
  sectionId?: string;
  /** Song time where the cutaway lands, and how long it runs. */
  at?: number;
  durationSec: number;
  status: BrollStatus;
  keep: boolean;
  fromInbox?: boolean;
  /** The artist asked for this one (typed it, described it in the plan, or uploaded the clip). */
  mine?: boolean;
  /** Covers a stretch no take reaches, so the video never goes black there. */
  cover?: boolean;
  /** Turned off because the video had no room for it, not by the artist. Comes back when there is room. */
  bumped?: boolean;
  model: BrollModel;
  /** One of the artist's own uploaded clips instead of a generated one. */
  clipId?: string;
  remoteId?: string;
  url?: string;
  mediaId?: string;
}

export type FxPackId = 'drill' | 'trapHype' | 'melodic' | 'boomBap' | 'dark' | 'copied';
export type FxIntensity = 'Clean' | 'Hype' | 'Unhinged';
export type FxEffectId =
  | 'punchIn'
  | 'shake'
  | 'flash'
  | 'rgbSplit'
  | 'glitch'
  | 'vhs'
  | 'stutter'
  | 'kineticLyrics'
  | 'textBehind'
  | 'glowOutline';

/** Effects copied from a video the artist uploaded: its color, its pace, its hits. */
export interface CopiedFx {
  title: string;
  feel: string;
  effects: FxEffectId[];
  density: number[];
  grade: { temp: number; tint: number; contrast: number; saturation: number; crush: number; grain: number; vignette: number };
  letterbox: boolean;
  /** Cuts per second in the source video. */
  cutsPerSec: number;
}

export interface FxPlan {
  pack?: FxPackId;
  /** Set when pack is 'copied'. */
  copied?: CopiedFx;
  intensity: FxIntensity;
  effects: Record<FxEffectId, boolean>;
}

/** One effect hit on the timeline. The player and the exporter both read these. */
export interface FxCue {
  /** Song time in seconds. */
  t: number;
  dur: number;
  fx: FxEffectId;
  /** 0 to 1. */
  amount: number;
}

export type Resolution = '720p' | '1080p' | '1440p' | '4K';

/** How 1440p and 4K are upscaled on the studio server: Topaz Proteus (clean) or Topaz Starlight (detail). */
export type UpscaleLook = 'clean' | 'detail';

/** The artist's plan. Free trial is pay per video with credits; Standard and Premium are subscriptions. */
export type PlanId = 'Free trial' | 'Standard' | 'Premium';

export interface Job {
  id: string;
  stage: StageId;
  label: string;
  /** 0 to 1. */
  progress: number;
  elapsedMs: number;
  durationMs: number;
  /** Driven from outside the engine: a live provider call or a render on this device. */
  external?: boolean;
}

export type AttachmentKind = 'takePlan' | 'cutSummary' | 'plan' | 'shotsSummary' | 'wrap';

export interface Message {
  id: string;
  from: 'director' | 'user' | 'system';
  text: string;
  at: number;
  stage?: StageId;
  attachment?: AttachmentKind;
}

export interface Idea {
  id: string;
  text: string;
  stage: StageId | 'brief';
  at: number;
}

/** How the artist wants to work. `ai`: the director pitches and runs it. `vision`: the artist brings the idea and agrees the plan with the director. */
export type CreativePath = 'ai' | 'vision';

/** A direction for the video, before it's locked into scenes. */
export interface PlanIdea {
  id: string;
  title: string;
  /** One or two lines the director would say to sell it. */
  pitch: string;
  /** Where it came from: the director's read of the song, the artist's own words, or a video they like. */
  source: 'song' | 'mine' | 'inspiration';
}

export type Framing = 'wide' | 'medium' | 'close';

/**
 * The set guide for one scene: where the artist stands, where the phone goes, how high, which lens.
 * Distances in meters on the floor plan; the artist's mark is the origin and the camera looks along -z.
 */
export interface SetGuide {
  scene: number;
  framing: Framing;
  /** Phone position relative to the artist's mark. */
  camera: { x: number; z: number; height: number };
  /** Equivalent focal length, 24 is the phone's main camera at 1x. */
  lensMm: number;
  /** How much room to keep behind the artist. */
  backroomM: number;
  /** Where the main light sits, as a clock direction from the camera's view. */
  light: 'left' | 'right' | 'behind camera' | 'overhead';
  /** Plain steps, said once before the scene. */
  steps: string[];
  /** Stand-ins for what the scene needs you to hold, lean on or sit in (a broom for a mic stand). */
  props?: Prop[];
}

export type PropKind = 'bar' | 'stand' | 'seat' | 'wall' | 'table' | 'steps';

export interface Prop {
  kind: PropKind;
  /** What it stands in for, in the scene. */
  for: string;
  /** What to use at home and how. */
  say: string;
}

export type LibraryKind = 'location' | 'startFrame' | 'still' | 'broll';

/** Every image the session makes, so nothing generated gets lost. */
export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  label: string;
  scene?: number;
  uri?: string;
  mediaId?: string;
  /** Location kind, so stand-in art can draw it when there's no file yet. */
  art?: LocationKind | 'custom';
  /** The reference image this item shows, so a generated picture lands on both. */
  refId?: string;
  at: number;
}

/** Built-in camera looks, each modeled on a camera music videos are shot on. */
export type CameraLookId = 'alexa' | 'venice' | 'fx3' | 'red' | 'canon' | 'pocket' | 'film500t' | 'natural';

/** `auto`: the director runs the pipeline and stops only where it needs the artist. `ask`: it stops at every step. */
export type Autonomy = 'auto' | 'ask';

/** What the connected studio server can run. Read from the server when the project goes live. */
export interface LiveCaps {
  /** The SwitchX version the key can run, e.g. `switchx-3.0`, or `switchx` for the public API. */
  model: string;
  maxFrames: number;
  maxRefs: number;
  resolutions: number[];
  broll: BrollModel[];
  /** The server can generate a reference frame for a look. */
  references: boolean;
  /** Claude answers in the chat. */
  director: boolean;
}

export interface Project {
  id: string;
  title: string;
  isSample: boolean;
  createdAt: number;
  autonomy: Autonomy;
  /** `demo`: AI renders are simulated on this device. `live`: they run on the studio server. */
  pipeline: 'demo' | 'live';
  /** Set while `pipeline` is `live`. */
  live?: LiveCaps;
  song?: Song;
  vibe?: Vibe;
  formats: Format[];
  /** The part of the song the video covers. Unset means the full song. */
  range?: { start: number; end: number };
  /** What the artist said they want to shoot, in their words. */
  brief?: string;
  /** Picked with the plan. The first take sets where the video starts. */
  length?: VideoLength;
  takePlan: PlannedTake[];
  takes: Take[];
  clips: Clip[];
  shootLocked: boolean;
  cut: { segments: CutSegment[]; locked: boolean; seed: number };
  /** Section id to look. */
  looks: Record<string, Look>;
  /** The artist locked the plan, before the shoot. */
  planApproved: boolean;
  /** Reference frames for each look. */
  plates: 'none' | 'ready' | 'approved';
  switchSettings: SwitchSettings;
  shots: Shot[];
  broll: { ideas: BrollIdea[]; approved: boolean };
  fx: FxPlan;
  /** `builds` counts how many times the director has assembled the edit. */
  final: { builds: number; locked: boolean };
  exportState: {
    formats: Format[];
    resolution: Resolution;
    done: boolean;
    creditsCharged: number;
    /** For 1440p and 4K. Clean when unset. */
    upscaler?: UpscaleLook;
    /** Finished files rendered on this device. */
    files?: { format: Format; mediaId: string; extension: string }[];
  };
  skipped: StageId[];
  /** Picked right after the song. Unset on projects made before paths existed. */
  path?: CreativePath;
  /** Directions for the video: pitched from the song, the artist's own, or from a video they like. */
  planIdeas?: PlanIdea[];
  /** A link to a video the artist wants it to feel like. */
  inspiration?: string;
  /** The part of the song was picked in the plan, so the first take doesn't place the video. */
  partPicked?: boolean;
  /** What the song is about and its message, in the artist's words. Explicit is fine. */
  songAbout?: string;
  songMessage?: string;
  /** Things the video has to have, one per line ("at least one scene on the moon"). */
  mustHaves?: string;
  /** The artist's own reference images for the video, on either path. */
  planRefs?: RefImage[];
  /** How many background options to generate per scene, 1 to 4. */
  locationCount?: number;
  /** The camera look, applied on render. Footage is always saved ungraded. */
  cameraLook?: CameraLookId;
  /** One set guide per scene, in scene order. Made when the plan locks. */
  guides?: SetGuide[];
  /** Scenes the artist is happy with, by scene number. */
  sceneLocks?: Record<number, boolean>;
  /** Every image this project generated. */
  library?: LibraryItem[];
  /** Every export, oldest first. */
  versions?: Version[];
  /** Switch renders kept from earlier versions. */
  renders?: SavedRender[];
  job?: Job;
  ideas: Idea[];
  messages: Message[];
}
