import { addClip, addTake } from '@/engine/actions';
import type { Project } from '@/engine/types';
import type { ImportedVideo, Recording } from '@/media/types';

/** Footage this dark cuts badly against well-lit takes. */
const DARK = 0.16;

export function darkFlag(brightness: number | undefined): string | undefined {
  return brightness !== undefined && brightness < DARK ? "It's dark, so I'll lean on the other takes" : undefined;
}

/** Adds an uploaded video as a take when it could be lined up with the song, otherwise as a cutaway clip. */
export function addImported(p: Project, v: ImportedVideo): Project {
  if (v.songStartSec === undefined) {
    return addClip(p, { label: v.name, durationSec: v.durationSec, fps: v.fps, width: v.width, height: v.height, mediaId: v.mediaId, thumb: v.thumb });
  }
  // A clip that started rolling before the song skips its lead-in.
  const lead = Math.max(0, -v.songStartSec);
  return addTake(p, {
    source: 'upload',
    label: v.name,
    fromSec: Math.max(0, v.songStartSec),
    durationSec: v.durationSec - lead,
    mediaOffsetSec: lead,
    fps: v.fps,
    width: v.width,
    height: v.height,
    mediaId: v.mediaId,
    thumb: v.thumb,
    sync: 'audio',
    flag: darkFlag(v.brightness),
  });
}

/**
 * Adds a take that was just recorded. The camera rolls a moment before the song starts,
 * so the take begins at `fromSec` and skips that lead-in.
 */
export function addRecorded(p: Project, rec: Recording, fromSec: number, hookOnly: boolean, scene?: number): Project {
  const lead = Math.max(0, fromSec - rec.songStartSec);
  return addTake(p, {
    source: 'record',
    fromSec: rec.songStartSec + lead,
    durationSec: rec.durationSec - lead,
    mediaOffsetSec: lead,
    fps: rec.fps,
    width: rec.width,
    height: rec.height,
    mediaId: rec.mediaId,
    thumb: rec.thumb,
    lagMs: rec.lagMs,
    sync: rec.sync,
    hookOnly: hookOnly || undefined,
    flag: darkFlag(rec.brightness),
    scene,
  });
}
