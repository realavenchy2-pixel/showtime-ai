import type { Song } from '@/engine/types';

import { importSong } from './audio.web';
import { mediaUrl, saveMedia } from './library';
import { importVideo } from './takes.web';
import type { ImportedSong, ImportedVideo } from './types';

// File pickers for the browser. Each one has to be called straight from a tap, or the browser blocks it.

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickSong(): Promise<ImportedSong | null> {
  const [file] = await pickFiles('audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac', false);
  if (!file) return null;
  return importSong(file);
}

/** Picks one or more videos. Each comes back lined up with the song when its sound matches. */
export async function pickVideos(song: Song | undefined, onEach?: (done: number, total: number) => void): Promise<{ videos: ImportedVideo[]; failed: string[] }> {
  const files = await pickFiles('video/*,.mp4,.mov,.webm,.m4v', true);
  const videos: ImportedVideo[] = [];
  const failed: string[] = [];
  let done = 0;
  onEach?.(0, files.length);
  for (const file of files) {
    try {
      videos.push(await importVideo(file, song));
    } catch {
      failed.push(file.name);
    }
    done += 1;
    onEach?.(done, files.length);
  }
  return { videos, failed };
}

export async function pickImage(): Promise<{ mediaId: string; uri: string; name: string } | null> {
  const [file] = await pickFiles('image/*', false);
  if (!file) return null;
  const mediaId = await saveMedia(file, 'ref');
  const uri = (await mediaUrl(mediaId)) ?? '';
  return { mediaId, uri, name: file.name.replace(/\.[a-z0-9]+$/i, '') };
}
