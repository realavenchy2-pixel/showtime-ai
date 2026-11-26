import type { SceneKind } from '@/components/art/SceneArt';
import { isStageDone, stageStatus } from '@/engine/stages';
import type { Project } from '@/engine/types';
import { latestVersion, partTitle } from '@/engine/versions';

export interface Cover {
  /** A real frame from the artist's footage, when there is one. */
  thumb?: string;
  /** The drawn set for projects without footage. */
  kind: SceneKind;
  relit: boolean;
}

/** Cover for a project tile: the latest take, or the drawn set for sample projects. */
export function coverFor(p: Project): Cover {
  const thumb = [...p.takes].reverse().find((t) => t.thumb)?.thumb;
  const switched = isStageDone(p, 'switch') || stageStatus(p, 'switch') === 'needs_you';
  const hook = p.song?.sections.find((s) => s.kind === 'hook');
  const look = (hook && p.looks[hook.id]) || Object.values(p.looks)[0];
  const set = look && look.location !== 'custom' ? look.location : undefined;
  if (switched && set) return { thumb, kind: set, relit: true };
  if (p.plates !== 'none' && set) return { thumb, kind: set, relit: true };
  return { thumb, kind: 'room', relit: false };
}

/** A short label for where the picture stands: raw, cut, switched, finished. */
export function versionLabel(p: Project): string {
  if (isStageDone(p, 'export')) {
    const v = latestVersion(p);
    return v ? `v${v.n}, ${partTitle(v).toLowerCase()}, exported` : 'Final, exported';
  }
  if (isStageDone(p, 'edit')) return 'Final edit';
  if (p.final.builds > 0) return 'Edit with effects';
  if (isStageDone(p, 'switch')) return 'Switched';
  if (p.shots.some((s) => s.status === 'ready' || s.status === 'approved')) return 'Switching';
  if (p.cut.segments.length) return 'Cut on the beat';
  if (p.takes.length) return p.takes.length === 1 ? 'Raw take' : `${p.takes.length} raw takes`;
  return 'No footage yet';
}
