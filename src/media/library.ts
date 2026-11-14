import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';

import type { MediaKind } from './types';

// Where footage and songs live on a phone: the app's documents folder. A media id is the file's URI.

function folder(): Directory {
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies a recorded or picked file into the app's own storage. Returns its id. */
export async function saveMedia(source: Blob | string, kind: MediaKind): Promise<string> {
  if (typeof source !== 'string') throw new Error('Saving in-memory media is only supported on the web.');
  const from = new File(source);
  const ext = from.extension || (kind === 'song' ? '.mp3' : '.mp4');
  const to = new File(folder(), `${kind}-${Date.now().toString(36)}${ext}`);
  from.copy(to);
  return to.uri;
}

export async function mediaBlob(_id: string): Promise<Blob | undefined> {
  return undefined;
}

export async function mediaUrl(id: string): Promise<string | undefined> {
  return id;
}

export async function removeMedia(id: string): Promise<void> {
  try {
    const file = new File(id);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

const DEMO_AUDIO: Record<string, number> = {
  'out-the-mud': require('../../assets/audio/out-the-mud.mp3'),
  'late-night': require('../../assets/audio/late-night.mp3'),
  'windy-city': require('../../assets/audio/windy-city.mp3'),
};

export function demoAudioUrl(trackId: string): string | undefined {
  const mod = DEMO_AUDIO[trackId];
  return mod ? Asset.fromModule(mod).uri : undefined;
}

export async function saveToDevice(_blob: Blob, _filename: string): Promise<'shared' | 'downloaded'> {
  throw new Error('Saving the finished video on this device arrives with the studio server. Export from the web app for now.');
}
