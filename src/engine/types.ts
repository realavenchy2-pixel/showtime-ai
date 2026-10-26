// Core data model for a Showtime AI project.
// Pure types only: no React Native imports, so the engine runs in tests and on any server.

export type ActId = 'shoot' | 'set' | 'style' | 'ship';

export type StageId =
  | 'song'
  | 'record'
  | 'roughcut'
  | 'location'
  | 'switch'
  | 'genjutsu'
  | 'broll'
  | 'vfx'
  | 'final'
  | 'resize'
  | 'export';

export type StageStatus = 'locked' | 'current' | 'working' | 'needs_you' | 'done' | 'skipped';

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
  sections: Section[];
  lyrics: LyricLine[];
  analyzed: boolean;
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
  angle: TakeAngle;
  scope: TakeScope;
  /** Delay found when lining the take up with the song (Bluetooth, phone lag). */
  lagMs: number;
  /** Song time where the take starts and ends. */
  start: number;
  end: number;
  /** Something the director noticed, e.g. drifting out of frame. */
  flag?: string;
}

export interface CutSegment {
  id: string;
  sectionId: string;
  start: number;
  end: number;
  takeId: string;
}

export type ShotStatus = 'queued' | 'rendering' | 'ready' | 'approved';

export interface Shot {
  id: string;
  n: number;
  segmentId: string;
  sectionId: string;
  takeId: string;
  /** Source range sent to the switch, including handles on both sides. */
  start: number;
  end: number;
  frames: number;
  status: ShotStatus;
  /** 0 to 1 while rendering. */
  progress: number;
  /** Rendering time this shot needs in the simulation. */
  workMs: number;
  /** Set when the result needs a second look before approval. */
  flag?: string;
  /** Simulation only: the note this shot comes back with on its first render. */
  pendingFlag?: string;
}

export interface GenjutsuSwap {
  id: string;
  label: string;
  detail: string;
  where: string;
  selected: boolean;
}

export type BrollStatus = 'idea' | 'clip' | 'approved';

export interface BrollIdea {
  id: string;
  lyric: string;
  shot: string;
  sectionId?: string;
  status: BrollStatus;
  keep: boolean;
  fromInbox?: boolean;
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
  | 'speedRamp'
  | 'kineticLyrics'
  | 'textBehind'
  | 'glowOutline';

export interface FxPlan {
  pack?: FxPackId;
  intensity: FxIntensity;
  effects: Record<FxEffectId, boolean>;
  locked: boolean;
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
}

export type AttachmentKind = 'takePlan' | 'takes' | 'cutSummary' | 'shotsSummary' | 'wrap';

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

export interface Project {
  id: string;
  title: string;
  isSample: boolean;
  createdAt: number;
  song?: Song;
  vibe?: Vibe;
  formats: Format[];
  takePlan: PlannedTake[];
  takes: Take[];
  recordLocked: boolean;
  cut: { segments: CutSegment[]; locked: boolean };
  /** Section id to location. */
  locations: Record<string, LocationKind>;
  plates: 'none' | 'ready' | 'approved';
  shots: Shot[];
  genjutsu: { swaps: GenjutsuSwap[]; status: 'idle' | 'ready' | 'done' };
  broll: { ideas: BrollIdea[]; approved: boolean };
  fx: FxPlan;
  final: { renders: number; locked: boolean };
  resize: { formats: Format[]; done: boolean };
  exportState: { resolution: Resolution; done: boolean; creditsCharged: number };
  skipped: StageId[];
  job?: Job;
  ideas: Idea[];
  messages: Message[];
}
