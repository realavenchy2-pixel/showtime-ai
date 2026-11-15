import { Compositor } from './compositor.web';
import type { Composition } from './composition';
import { mediaUrl } from './library';

// Plays a composition: the song is the clock, the compositor draws whatever belongs to that moment.

export interface PlayerState {
  time: number;
  duration: number;
  playing: boolean;
  /** False while the song or the footage on screen is still loading. */
  ready: boolean;
}

/** Longest side of the preview canvas. Phones don't need more, and it keeps every effect at full frame rate. */
const PREVIEW_MAX = 960;

export async function sourceUrls(comp: Composition): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  await Promise.all(
    comp.sources.map(async (src) => {
      const url = src.mediaId ? await mediaUrl(src.mediaId) : src.url;
      if (url) urls.set(src.id, url);
    }),
  );
  return urls;
}

export function frameSize(aspect: number, longest: number): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return aspect >= 1 ? { width: even(longest), height: even(longest / aspect) } : { width: even(longest * aspect), height: even(longest) };
}

export class Player {
  readonly audio = new Audio();
  private comp?: Composition;
  private compositor: Compositor;
  private raf = 0;
  private listeners = new Set<(s: PlayerState) => void>();
  private lastNotify = 0;
  private state: PlayerState = { time: 0, duration: 0, playing: false, ready: false };
  private disposed = false;
  /** Paused, but the picture still needs redrawing (a seek is landing, a file is decoding). */
  private dirtyUntil = 0;
  /** Where to stop, for previewing one stretch of the song. */
  private stopAt?: number;

  constructor(canvas: HTMLCanvasElement) {
    this.compositor = new Compositor(canvas);
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.pause());
    this.audio.addEventListener('loadedmetadata', () => this.emit(true));
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  async load(comp: Composition, songUrl: string | undefined): Promise<void> {
    const urls = await sourceUrls(comp);
    if (this.disposed) return;
    this.comp = comp;
    const size = frameSize(comp.aspect, PREVIEW_MAX);
    this.compositor.resize(size.width, size.height);
    this.compositor.setComposition(comp, urls);
    if (songUrl && this.audio.dataset.url !== songUrl) {
      this.audio.dataset.url = songUrl;
      this.audio.src = songUrl;
    }
    this.state = { ...this.state, duration: comp.durationSec };
    // A snippet opens at its first frame.
    const now = this.audio.currentTime || 0;
    if (now < comp.startSec || now > comp.durationSec) {
      try {
        this.audio.currentTime = comp.startSec;
      } catch {
        // Not seekable until the song loads; play() and seek() start from the snippet anyway.
      }
      this.state = { ...this.state, time: comp.startSec };
    }
    this.touch();
    this.emit(true);
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastNotify < 100) return;
    this.lastNotify = now;
    for (const fn of this.listeners) fn(this.state);
  }

  private touch(ms = 1500): void {
    this.dirtyUntil = performance.now() + ms;
  }

  private loop(): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const comp = this.comp;
    if (!comp) return;
    const playing = !this.audio.paused;
    const time = Math.max(comp.startSec, Math.min(comp.durationSec, this.audio.currentTime || 0));
    if (playing && ((this.stopAt !== undefined && time >= this.stopAt) || time >= comp.durationSec - 0.02)) {
      this.stopAt = undefined;
      this.pause();
    }
    if (playing || performance.now() < this.dirtyUntil) this.compositor.render(time, playing);
    const ready = this.audio.readyState >= 2 && this.compositor.ready(time);
    if (playing !== this.state.playing || ready !== this.state.ready || Math.abs(time - this.state.time) > 0.05) {
      const force = playing !== this.state.playing || ready !== this.state.ready;
      this.state = { ...this.state, time, playing, ready };
      this.emit(force);
    }
  }

  play(until?: number): void {
    this.stopAt = until;
    const comp = this.comp;
    if (comp && (this.audio.currentTime >= comp.durationSec - 0.05 || this.audio.currentTime < comp.startSec - 0.05)) this.audio.currentTime = comp.startSec;
    void this.audio.play().catch(() => {});
  }

  pause(): void {
    this.audio.pause();
    this.touch();
  }

  toggle(): void {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  seek(time: number): void {
    const t = Math.max(this.comp?.startSec ?? 0, Math.min(this.comp?.durationSec ?? 0, time));
    this.audio.currentTime = t;
    this.state = { ...this.state, time: t };
    this.touch();
    this.emit(true);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.compositor.dispose();
    this.listeners.clear();
  }
}
