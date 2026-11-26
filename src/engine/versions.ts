import { lookKey } from './broll';
import { FX_PACKS } from './fx';
import { scenesOf } from './production';
import type { Format, Project, Version, VersionRecipe } from './types';

// Every export is a version: v1, v2, v3, in order, each named for what it is (snippet or full song)
// and for what changed since the one before. Files never overwrite each other, so the artist can
// always go back to any version they posted.

let counter = 0;
function uid(): string {
  counter += 1;
  return `ver-${Date.now().toString(36)}${counter.toString(36)}`;
}

/** The video covers (nearly) the whole song. */
export function isFullSong(p: Project): boolean {
  const song = p.song;
  if (!song) return false;
  const r = p.range ?? { start: 0, end: song.durationSec };
  return r.end - r.start >= song.durationSec * 0.9 - 0.05;
}

export function latestVersion(p: Project): Version | undefined {
  const all = p.versions ?? [];
  return all[all.length - 1];
}

/** What a version is made from, to tell what the next one changed. */
export function recipeOf(p: Project): VersionRecipe {
  const range = p.range ?? { start: 0, end: p.song?.durationSec ?? 0 };
  const looks: Record<string, string> = {};
  for (const scene of scenesOf(p)) looks[scene.section.id] = lookKey(p, scene.section.id);
  return {
    range: { start: range.start, end: range.end },
    takeIds: p.takes.map((t) => t.id),
    looks,
    broll: p.broll.ideas.filter((i) => i.status === 'approved' && i.keep).map((i) => ({ id: i.id, shot: i.shot })),
    fx: JSON.stringify([p.fx.pack, p.fx.intensity, p.fx.effects, p.fx.copied ? 1 : 0, p.cameraLook ?? '']),
    cutSeed: p.cut.seed,
  };
}

function words(text: string, n: number): string {
  const all = text.trim().split(/\s+/);
  return all.length > n ? `${all.slice(0, n).join(' ')}...` : all.join(' ');
}

function sceneWord(n: number): string {
  return `scene ${n}`;
}

function list(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What changed between two versions, in plain words, most important first. */
export function describeChanges(p: Project, before: Version | undefined, now: VersionRecipe, formats: Format[], resolution: string): string[] {
  if (!before) return [];
  const prev = before.recipe;
  const out: string[] = [];
  const scenes = scenesOf(p);
  const sceneOf = (sectionId: string) => scenes.findIndex((s) => s.section.id === sectionId) + 1;

  const longer = now.range.end - now.range.start > prev.range.end - prev.range.start + 1;
  if (longer) out.push(isFullSong(p) ? 'Now the full song' : 'Longer: more of the song');
  else if (Math.abs(now.range.start - prev.range.start) > 0.5 || Math.abs(now.range.end - prev.range.end) > 0.5) out.push('A different part of the song');

  const newTakes = p.takes.filter((t) => !prev.takeIds.includes(t.id));
  const oldScenes = new Set(Object.keys(prev.looks));
  const reshot = [...new Set(newTakes.map((t) => (t.scene !== undefined ? scenes[t.scene]?.section.id : undefined)).filter((id): id is string => !!id && oldScenes.has(id)))];
  if (reshot.length) out.push(`Reshot ${list(reshot.map(sceneOf).sort((a, b) => a - b).map(sceneWord))}`);
  else if (newTakes.length && !longer) out.push(newTakes.length === 1 ? 'A new take' : `${newTakes.length} new takes`);

  const restyled = Object.keys(now.looks).filter((id) => prev.looks[id] !== undefined && prev.looks[id] !== now.looks[id]);
  if (restyled.length) out.push(`New background in ${list(restyled.map(sceneOf).sort((a, b) => a - b).map(sceneWord))}`);

  const added = now.broll.filter((b) => !prev.broll.some((x) => x.id === b.id));
  const removed = prev.broll.filter((b) => !now.broll.some((x) => x.id === b.id));
  if (added.length === 1) out.push(`New b-roll: ${words(added[0].shot, 6)}`);
  else if (added.length > 1) out.push(`${added.length} new b-roll clips`);
  if (removed.length === 1) out.push(`Took out b-roll: ${words(removed[0].shot, 6)}`);
  else if (removed.length > 1) out.push(`Took out ${removed.length} b-roll clips`);

  if (now.fx !== prev.fx) {
    const pack = FX_PACKS.find((x) => x.id === p.fx.pack)?.title;
    out.push(p.fx.pack === 'copied' ? 'Effects copied from your video' : pack ? `New effects: ${pack}, ${p.fx.intensity}` : 'New effects');
  }
  if (now.cutSeed !== prev.cutSeed) out.push('A new cut');

  if (out.length === 0) {
    const sizes = resolution !== before.resolution ? `in ${resolution}` : formats.join(',') !== before.formats.join(',') ? 'in new sizes' : 'again';
    out.push(`Same video, exported ${sizes}`);
  }
  return out;
}

/** Records the export that just finished as the next version. */
export function recordVersion(p: Project, now = Date.now()): Project {
  const before = latestVersion(p);
  const recipe = recipeOf(p);
  const range = p.range ?? { start: 0, end: p.song?.durationSec ?? 0 };
  const version: Version = {
    id: uid(),
    n: (before?.n ?? 0) + 1,
    part: isFullSong(p) ? 'full' : 'snippet',
    range: { start: range.start, end: range.end },
    at: now,
    changes: describeChanges(p, before, recipe, p.exportState.formats, p.exportState.resolution),
    formats: p.exportState.formats,
    resolution: p.exportState.resolution,
    files: p.exportState.files,
    recipe,
  };
  return { ...p, versions: [...(p.versions ?? []), version] };
}

export function partTitle(v: Pick<Version, 'part'>): string {
  return v.part === 'full' ? 'Full song' : 'Snippet';
}

/** "v2 · Full song" */
export function versionTitle(v: Version): string {
  return `v${v.n} · ${partTitle(v)}`;
}

/** "Keef, v2, full song": how the version reads anywhere outside the app. */
export function versionName(p: Project, v: Version): string {
  return `${p.title}, v${v.n}, ${partTitle(v).toLowerCase()}`;
}

/** "keef-v2-full-song": the start of every file name in a version, so files sort in order. */
export function versionSlug(title: string, v: Pick<Version, 'n' | 'part'>): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'showtime';
  return `${slug}-v${v.n}-${v.part === 'full' ? 'full-song' : 'snippet'}`;
}
