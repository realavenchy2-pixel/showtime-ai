import { RECORD_FPS } from '@/engine/switchx';

import { audioContext } from './audio.web';

// The browser camera: live preview, recording to a file, and a copy of what the mic heard
// so the take can be lined up with the song by ear.

export type Facing = 'user' | 'environment';

export interface RawRecording {
  blob: Blob;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  /** What the mic heard from the first frame on, mono. Missing when there is no mic. */
  heard?: { pcm: Float32Array; sampleRate: number };
}

const MIMES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function recordingMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!recordingMime();
}

/** The mic at roughly 12 kHz mono, stamped on the audio clock so it can be cut to the first video frame. */
class Listener {
  private chunks: Float32Array[] = [];
  private total = 0;
  private firstAt = -1;
  private node?: ScriptProcessorNode;
  private source?: MediaStreamAudioSourceNode;
  private sink?: GainNode;
  readonly rate: number;
  private readonly step: number;

  constructor(private readonly ac: AudioContext, stream: MediaStream) {
    this.step = Math.max(1, Math.round(ac.sampleRate / 12000));
    this.rate = ac.sampleRate / this.step;
    try {
      this.source = ac.createMediaStreamSource(stream);
      this.node = ac.createScriptProcessor(1024, 1, 1);
      this.sink = ac.createGain();
      this.sink.gain.value = 0;
      this.node.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        if (this.firstAt < 0) this.firstAt = ac.currentTime - input.length / ac.sampleRate;
        const out = new Float32Array(Math.floor(input.length / this.step));
        for (let i = 0; i < out.length; i++) {
          let sum = 0;
          for (let k = 0; k < this.step; k++) sum += input[i * this.step + k];
          out[i] = sum / this.step;
        }
        this.chunks.push(out);
        this.total += out.length;
      };
      this.source.connect(this.node);
      this.node.connect(this.sink);
      this.sink.connect(ac.destination);
    } catch {
      this.stop();
    }
  }

  /** Everything heard since `sinceCtxTime` on the audio clock. */
  since(sinceCtxTime: number): Float32Array | undefined {
    if (this.firstAt < 0 || this.total === 0) return undefined;
    const all = new Float32Array(this.total);
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    const from = Math.max(0, Math.min(all.length, Math.round((sinceCtxTime - this.firstAt) * this.rate)));
    return all.subarray(from);
  }

  reset(): void {
    this.chunks = [];
    this.total = 0;
    this.firstAt = -1;
  }

  stop(): void {
    try {
      this.node?.disconnect();
      this.source?.disconnect();
      this.sink?.disconnect();
    } catch {
      // Already torn down.
    }
    if (this.node) this.node.onaudioprocess = null;
  }
}

export class CameraSession {
  stream: MediaStream;
  facing: Facing;
  /** Called with the new stream after the camera flips. */
  onStream?: (stream: MediaStream) => void;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private startedCtx = 0;
  private listener?: Listener;

  private constructor(stream: MediaStream, facing: Facing) {
    this.stream = stream;
    this.facing = facing;
    this.listen();
  }

  static async open(facing: Facing = 'user'): Promise<CameraSession> {
    return new CameraSession(await openStream(facing), facing);
  }

  get hasMic(): boolean {
    return this.stream.getAudioTracks().length > 0;
  }

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  settings(): { width: number; height: number; fps: number } {
    const s = this.stream.getVideoTracks()[0]?.getSettings() ?? {};
    return { width: s.width ?? 1280, height: s.height ?? 720, fps: Math.round(s.frameRate ?? RECORD_FPS) || RECORD_FPS };
  }

  private listen(): void {
    this.listener?.stop();
    this.listener = undefined;
    if (!this.hasMic) return;
    try {
      this.listener = new Listener(audioContext(), this.stream);
    } catch {
      this.listener = undefined;
    }
  }

  async flip(): Promise<void> {
    if (this.recording) return;
    const next: Facing = this.facing === 'user' ? 'environment' : 'user';
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = await openStream(next);
    this.facing = next;
    this.listen();
    this.onStream?.(this.stream);
  }

  /** Starts writing the take. Resolves once the first frame is being recorded. */
  start(): Promise<void> {
    const mimeType = recordingMime();
    const { width, height } = this.settings();
    const videoBitsPerSecond = width * height > 1280 * 720 ? 8_000_000 : 5_000_000;
    this.chunks = [];
    this.listener?.reset();
    const rec = new MediaRecorder(this.stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond: 128_000 });
    this.recorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    return new Promise((resolve, reject) => {
      rec.onstart = () => {
        this.startedAt = performance.now();
        this.startedCtx = audioContext().currentTime;
        resolve();
      };
      rec.onerror = () => reject(new Error('The camera stopped recording.'));
      rec.start(1000);
    });
  }

  stop(): Promise<RawRecording> {
    const rec = this.recorder;
    if (!rec || rec.state === 'inactive') return Promise.reject(new Error('Nothing is recording.'));
    return new Promise((resolve) => {
      rec.onstop = () => {
        const durationSec = (performance.now() - this.startedAt) / 1000;
        const blob = new Blob(this.chunks, { type: rec.mimeType || recordingMime() || 'video/webm' });
        this.chunks = [];
        const pcm = this.listener?.since(this.startedCtx);
        const { width, height, fps } = this.settings();
        resolve({
          blob,
          durationSec,
          width,
          height,
          fps,
          heard: pcm && pcm.length > 0 && this.listener ? { pcm: pcm.slice(), sampleRate: this.listener.rate } : undefined,
        });
      };
      rec.stop();
    });
  }

  close(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      // Already stopped.
    }
    this.listener?.stop();
    this.stream.getTracks().forEach((t) => t.stop());
  }
}

async function openStream(facing: Facing): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: facing },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: RECORD_FPS },
  };
  // The mic is only used to line the take up with the song, so its processing is off:
  // echo cancellation would try to erase the very song we want to hear.
  const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      // Maybe only the mic was refused: the camera alone is enough to record.
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing } }, audio: false });
  }
}

/** A small still and how bright it is, from whatever the element is showing right now. */
export function grabStill(el: HTMLVideoElement | HTMLCanvasElement, width = 320): { thumb?: string; brightness?: number } {
  const w = 'videoWidth' in el ? el.videoWidth : el.width;
  const h = 'videoHeight' in el ? el.videoHeight : el.height;
  if (!w || !h) return {};
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((width * h) / w);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return {};
    g.drawImage(el, 0, 0, canvas.width, canvas.height);
    const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return { thumb: canvas.toDataURL('image/jpeg', 0.7), brightness: sum / (data.length / 16) / 255 };
  } catch {
    return {};
  }
}
