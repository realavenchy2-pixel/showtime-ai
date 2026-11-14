import type { Composition } from './composition';

// Phone build: the finished video is rendered by the studio server, not on the device.

export interface ExportOptions {
  size: number;
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  extension: 'mp4' | 'webm';
  width: number;
  height: number;
}

export function canExport(): boolean {
  return false;
}

export async function exportComposition(_comp: Composition, _songUrl: string, _opts: ExportOptions): Promise<ExportResult> {
  throw new Error('Rendering on the phone arrives with the studio server. Export from the web app for now.');
}
