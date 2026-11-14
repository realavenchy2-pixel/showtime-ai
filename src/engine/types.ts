// Core data model for a Showtime AI project.
// Pure types only: no React Native imports, so the engine runs in tests and on any server.

export type StageId = 'song' | 'shoot' | 'cut' | 'looks' | 'switch' | 'broll' | 'edit' | 'export';

export type StageStatus = 'locked' | 'current' | 'working' | 'needs_you' | 'done' | 'skipped';

/** Built-in looks. A section can also carry a custom look written by the artist. */
export type LocationKind = 'beach' | 'alley' | 'whiteVoid' | 'darkVoid' | 'hangingMic';

export type Vibe = 'Drill' | 'Trap' | 'Melodic' | 'Boom bap' | 'Dark';

export type Format = '16:9' | '9:16' | '1:1';

export type SectionKind = 'intro' | 'verse' | 'hook' | 'bridge' | 'outro';

export interface Section {
  id: string;
  kind: SectionKind;
  label: string;
  /** Song time in seconds. */
  start: number;
  end: number;
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
}

/** Where a section takes place: what SwitchX is asked to build around the artist. */
export interface Look {
  location: LocationKind | 'custom';
  /** What happens in the scene. SwitchX 3.0 follows this closely. */
  prompt: string;
  /** Up to four reference images. */
  refs: RefImage[];
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
}

export type BrollStatus = 'idea' | 'clip' | 'approved';
export type BrollModel = 'omni' | 'h3';

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
  model: BrollModel;
  /** One of the artist's own uploaded clips instead of a generated one. */
  clipId?: string;
  remoteId?: string;
  url?: string;
  mediaId?: string;
}

export type FxPackId = 'drill' | 'trapHype' | 'melodic' | 'boomBap' | 'dark';
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

export interface FxPlan {
  pack?: FxPackId;
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

export type Resolution = '1080p' | '4K';

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
  takePlan: PlannedTake[];
  takes: Take[];
  clips: Clip[];
  shootLocked: boolean;
  cut: { segments: CutSegment[]; locked: boolean; seed: number };
  /** Section id to look. */
  looks: Record<string, Look>;
  /** The artist said "run it" on the director's plan. */
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
    /** Finished files rendered on this device. */
    files?: { format: Format; mediaId: string; extension: string }[];
  };
  skipped: StageId[];
  job?: Job;
  ideas: Idea[];
  messages: Message[];
}
