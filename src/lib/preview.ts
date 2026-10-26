import type { SceneKind } from '@/components/art/SceneArt';
import { isSkipped, isStageDone, stageStatus } from '@/engine/stages';
import type { Format, LocationKind, Project } from '@/engine/types';

/** The look a project's preview shows right now, and the version label under it. */
export function previewFor(p: Project): { kind: SceneKind; label: string; behindText?: string } {
  const hook = p.song?.sections.find((s) => s.kind === 'hook');
  const hookLoc: LocationKind | undefined = hook ? p.locations[hook.id] : undefined;
  const firstLoc = Object.values(p.locations)[0];
  const switched = isStageDone(p, 'switch') || stageStatus(p, 'switch') === 'needs_you';
  const kind: SceneKind = switched ? (hookLoc ?? firstLoc ?? 'darkVoid') : 'room';
  const textBehind = p.fx.locked && p.fx.effects.textBehind ? p.title.toUpperCase() : undefined;

  if (isStageDone(p, 'export')) return { kind, label: 'Final, exported', behindText: textBehind };
  if (isStageDone(p, 'final')) return { kind, label: 'Final', behindText: textBehind };
  if (isStageDone(p, 'vfx')) return { kind, label: 'With effects', behindText: textBehind };
  if (switched) return { kind, label: isStageDone(p, 'broll') || isSkipped(p, 'broll') ? 'Switched, with b-roll' : 'Switched' };
  if (p.cut.segments.length) return { kind, label: 'Rough cut' };
  if (p.takes.length) return { kind, label: `Raw take ${p.takes.length}` };
  return { kind, label: 'No footage yet' };
}

/** Cover art for a project tile: the hook's location once plates exist, otherwise the raw take. */
export function coverFor(p: Project): { kind: SceneKind; relit: boolean; behindText?: string } {
  const preview = previewFor(p);
  if (preview.kind !== 'room') return { kind: preview.kind, relit: true, behindText: preview.behindText };
  if (p.plates === 'none') return { kind: 'room', relit: false };
  const hook = p.song?.sections.find((s) => s.kind === 'hook');
  const loc = (hook && p.locations[hook.id]) || Object.values(p.locations)[0];
  return loc ? { kind: loc, relit: true } : { kind: 'room', relit: false };
}

/** The format the preview frame uses: YouTube when the artist posts there, otherwise vertical. */
export function previewFormat(p: Project): Format {
  return p.formats.includes('16:9') || p.formats.length === 0 ? '16:9' : p.formats[0];
}
