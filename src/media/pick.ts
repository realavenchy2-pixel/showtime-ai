import { createAudioPlayer } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { Song } from '@/engine/types';

import { saveMedia } from './library';
import type { ImportedSong, ImportedVideo } from './types';

// File pickers for the phone build. Beat mapping and sync-by-ear need decoded audio, which runs
// in the web app (and later on the studio server), so here songs come back unmapped and videos unsynced.

/** Loads the file just far enough to learn how long it is. */
async function audioDuration(uri: string): Promise<number> {
  const player = createAudioPlayer({ uri });
  try {
    for (let i = 0; i < 50; i++) {
      if (player.isLoaded && player.duration > 0) return player.duration;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return 0;
  } finally {
    player.release();
  }
}

export async function pickSong(): Promise<ImportedSong | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const audioId = await saveMedia(asset.uri, 'song');
  return {
    audioId,
    title: asset.name.replace(/\.[a-z0-9]+$/i, '') || 'Untitled',
    durationSec: await audioDuration(audioId),
    bpm: 0,
    downbeatSec: 0,
    confidence: 0,
    peaks: [],
  };
}

export async function pickVideos(_song: Song | undefined, onEach?: (done: number, total: number) => void): Promise<{ videos: ImportedVideo[]; failed: string[] }> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: true });
  const videos: ImportedVideo[] = [];
  const failed: string[] = [];
  if (res.canceled) return { videos, failed };
  let done = 0;
  for (const asset of res.assets) {
    try {
      const mediaId = await saveMedia(asset.uri, 'clip');
      videos.push({
        mediaId,
        name: (asset.fileName ?? 'Clip').replace(/\.[a-z0-9]+$/i, ''),
        durationSec: (asset.duration ?? 0) / 1000,
        width: asset.width,
        height: asset.height,
        fps: 30,
      });
    } catch {
      failed.push(asset.fileName ?? 'a clip');
    }
    done += 1;
    onEach?.(done, res.assets.length);
  }
  return { videos, failed };
}

export async function pickImage(): Promise<{ mediaId: string; uri: string; name: string } | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (res.canceled || !res.assets.length) return null;
  const asset = res.assets[0];
  const mediaId = await saveMedia(asset.uri, 'ref');
  return { mediaId, uri: mediaId, name: (asset.fileName ?? 'Reference').replace(/\.[a-z0-9]+$/i, '') };
}
