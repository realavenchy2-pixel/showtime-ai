import { Platform } from 'react-native';

import { exportVideo, failJob, finishJob, setExportFiles, setJobProgress } from '@/engine/actions';
import { useApp } from '@/engine/store';
import type { Format } from '@/engine/types';
import { songUrl } from '@/media/audio';
import { aspectOf, buildComposition } from '@/media/composition';
import { canExport, exportComposition } from '@/media/exporter';
import { saveMedia } from '@/media/library';

// Renders the finished video on this device, one format at a time. It lives outside any screen,
// so the render keeps going if the artist looks at something else in the app.

const running = new Map<string, AbortController>();

const FORMAT_FILE: Record<Format, string> = { '16:9': 'youtube', '9:16': 'reels', '1:1': 'square' };

/** Longest side this device renders at. Phones render 720p so the picture stays smooth while it records. */
export function deviceExportSize(): number {
  const phone = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  return phone ? 1280 : 1920;
}

export function exportDimensions(format: Format): { width: number; height: number } {
  const aspect = aspectOf(format);
  const longest = deviceExportSize();
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return aspect >= 1 ? { width: even(longest), height: even(longest / aspect) } : { width: even(longest * aspect), height: even(longest) };
}

export function exportFileName(title: string, format: Format, extension: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'showtime';
  return `${slug}-${FORMAT_FILE[format]}.${extension}`;
}

export function cancelExport(projectId: string): void {
  running.get(projectId)?.abort();
}

export type ExportOutcome = 'done' | 'needCredits' | 'failed' | 'cancelled' | 'busy';

export async function runExport(projectId: string): Promise<ExportOutcome> {
  const app = useApp.getState();
  const project = app.projects[projectId];
  if (!project || !project.song || project.job || running.has(projectId)) return 'busy';

  if (!canExport()) {
    // No renderer on this device: the simulated export stands in until the studio server renders it.
    return app.exportVideo(projectId) === 'started' ? 'done' : 'needCredits';
  }

  const cost = app.chargeExport(projectId);
  if (cost === null) return 'needCredits';
  const formats = project.exportState.formats;
  const controller = new AbortController();
  running.set(projectId, controller);
  app.apply(projectId, (p) => exportVideo(p, cost, { external: true }));

  let lastReport = 0;
  const report = (fraction: number, label: string) => {
    const now = Date.now();
    if (now - lastReport < 250 && fraction < 1) return;
    lastReport = now;
    useApp.getState().apply(projectId, (p) => setJobProgress(p, fraction, label));
  };

  try {
    const url = await songUrl(project.song);
    if (!url) throw new Error('The song file is missing on this device.');
    const files: { format: Format; mediaId: string; extension: string }[] = [];
    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const comp = buildComposition(project, { format, effects: true });
      if (!comp) throw new Error('There is nothing to render yet.');
      const label = formats.length === 1 ? 'Rendering your video. Keep this tab open.' : `Rendering format ${i + 1} of ${formats.length}. Keep this tab open.`;
      const result = await exportComposition(comp, url, {
        size: deviceExportSize(),
        signal: controller.signal,
        onProgress: (f) => report((i + f) / formats.length, label),
      });
      files.push({ format, mediaId: await saveMedia(result.blob, 'export'), extension: result.extension });
    }
    const state = useApp.getState();
    state.apply(projectId, (p) => setExportFiles(p, files));
    state.apply(projectId, finishJob);
    return 'done';
  } catch (err) {
    const cancelled = controller.signal.aborted;
    const state = useApp.getState();
    state.addCredits(cost);
    state.apply(projectId, (p) => failJob(p, cancelled ? 'the export was cancelled. Your credit is back.' : `${(err as Error)?.message ?? 'the render stopped.'} Your credit is back.`));
    return cancelled ? 'cancelled' : 'failed';
  } finally {
    running.delete(projectId);
  }
}
