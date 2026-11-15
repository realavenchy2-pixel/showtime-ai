import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';

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
  const [uri, setUri] = useState<string | undefined>();
  const audioId = song?.audioId;
  const source = song?.source;
  useEffect(() => {
    let live = true;
    if (!audioId || !source) return;
    void songUrl({ audioId, source } as Song).then((u) => live && setUri(u));
    return () => {
      live = false;
    };
  }, [audioId, source]);
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const stopAt = opts.stopAt;
  useEffect(() => {
    if (status.playing && stopAt !== undefined && status.currentTime >= stopAt) player.pause();
  }, [status.playing, status.currentTime, stopAt, player]);

  return {
    playing: status.playing,
    time: status.currentTime,
    ready: status.isLoaded,
    play: (from) => {
      if (from !== undefined) void player.seekTo(from);
      player.play();
    },
    pause: () => player.pause(),
    seek: (t) => void player.seekTo(Math.max(0, t)),
  };
}
