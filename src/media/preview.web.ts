import { useEffect, useRef, useState } from 'react';

import type { Song } from '@/engine/types';

import { songUrl } from './audio';

export interface SongPreview {
  playing: boolean;
  /** Song time in seconds. */
  time: number;
  ready: boolean;
  play: (from?: number) => void;
  pause: () => void;
  seek: (t: number) => void;
}

/** Plays a song so the artist can hear where things are. One player per screen. */
export function useSongPreview(song: Song | undefined, opts: { stopAt?: number } = {}): SongPreview {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [readyFor, setReadyFor] = useState<string | undefined>();
  const stopAt = useRef<number | undefined>(undefined);
  useEffect(() => {
    stopAt.current = opts.stopAt;
  });

  const audioId = song?.audioId;
  const source = song?.source;
  const key = audioId && source ? `${source}:${audioId}` : undefined;
  const ready = !!key && readyFor === key;
  useEffect(() => {
    if (!audioId || !source) return;
    let live = true;
    let raf = 0;
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    void songUrl({ audioId, source } as Song).then((url) => {
      if (live && url) audio.src = url;
    });
    const onReady = () => live && setReadyFor(`${source}:${audioId}`);
    const onPlay = () => live && setPlaying(true);
    const onPause = () => live && setPlaying(false);
    audio.addEventListener('canplay', onReady);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onPause);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (audio.paused) return;
      const t = audio.currentTime;
      if (stopAt.current !== undefined && t >= stopAt.current) audio.pause();
      setTime(t);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [audioId, source]);

  return {
    playing: ready && playing,
    time: ready ? time : 0,
    ready,
    play: (from) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (from !== undefined) {
        audio.currentTime = from;
        setTime(from);
      }
      void audio.play().catch(() => {});
    },
    pause: () => audioRef.current?.pause(),
    seek: (t) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, t);
      setTime(Math.max(0, t));
    },
  };
}
