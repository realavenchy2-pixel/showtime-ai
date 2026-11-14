import { Asset } from 'expo-asset';

import type { MediaKind } from './types';

// Where footage and songs live in the browser: IndexedDB, so takes survive a reload.
// If the browser refuses storage (private windows), media stays in memory for the session.

const DB_NAME = 'showtime-media';
const STORE = 'blobs';

const memory = new Map<string, Blob>();
const urls = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | undefined;

function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve) => {
        if (!d) return resolve(undefined);
        try {
          const req = run(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function saveMedia(source: Blob | string, kind: MediaKind): Promise<string> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const id = `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  memory.set(id, blob);
  const stored = await tx('readwrite', (s) => s.put(blob, id));
  // Once it is safely on disk, the in-memory copy only costs RAM.
  if (stored !== undefined) memory.delete(id);
  return id;
}

export async function mediaBlob(id: string): Promise<Blob | undefined> {
  return memory.get(id) ?? (await tx<Blob>('readonly', (s) => s.get(id)));
}

/** A URL a <video> or <audio> element can play. Cached, so the same id always gives the same URL. */
export async function mediaUrl(id: string): Promise<string | undefined> {
  const cached = urls.get(id);
  if (cached) return cached;
  const blob = await mediaBlob(id);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

/** The URL for `id` if it has been asked for before. */
export function mediaUrlNow(id: string): string | undefined {
  return urls.get(id);
}

export async function removeMedia(id: string): Promise<void> {
  memory.delete(id);
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  await tx('readwrite', (s) => s.delete(id));
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

/** Hands a finished file to the artist: the share sheet on phones, a download everywhere else. */
export async function saveToDevice(blob: Blob, filename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch {
      // Closed the sheet, or sharing files is blocked: fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
