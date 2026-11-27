import { describe, expect, it } from 'vitest';

import {
  addBrollIdea,
  addTake,
  approveAllShots,
  approveBroll,
  buildEdit,
  createProject,
  exportCost,
  exportVideo,
  finishShooting,
  generateBroll,
  lockEdit,
  pickPart,
  setAutonomy,
  setResolution,
  setFxPack,
  settle,
  skipStage,
  startSwitch,
  videoRange,
} from '../actions';
import { parseCommands, respond, settleAuto } from '../agent';
import { lockPlan } from '../brief';
import { nextActions } from '../director';
import { lockLocation, lockScene, nextScene, reviseLocation, scenesOf } from '../production';
import { DEMO_TRACKS, songFromDemo, withScenes } from '../samples';
import { currentStage, isStageDone } from '../stages';
import { makeFullSong, newBackground, remakeBroll, reshootScene, touchUpBroll, touchUpEdit, touchUpOptions } from '../touchup';
import type { Project } from '../types';
import { latestVersion, versionSlug } from '../versions';

/** A snippet from the middle of the song, laid out in scenes like a song set up in the app, planned and ready to shoot. */
function planned(): Project {
  const p = settle(createProject({ song: withScenes(songFromDemo(DEMO_TRACKS[0])), formats: ['9:16'], path: 'ai' }));
  const picked = pickPart(p, 'snippet', { start: 40, end: 70 });
  return lockPlan(picked, { brief: '', length: 'snippet' });
}

/** Every scene that has no take yet gets one, then the scene and its background are locked. */
function shootAll(p: Project): Project {
  let next = p;
  for (const scene of scenesOf(next)) {
    if (!next.takes.some((t) => t.scene === scene.index)) {
      next = addTake(next, { source: 'record', fromSec: scene.section.start, durationSec: scene.section.end - scene.section.start, scene: scene.index, sync: 'audio' });
    }
    next = lockLocation(lockScene(next, scene.index), scene.index);
  }
  return next;
}

/** Runs the pipeline to a finished export, approving whatever the director stops for. */
function toExport(p: Project): Project {
  let next = settleAuto(setAutonomy(p, 'auto'));
  for (let i = 0; i < 12 && currentStage(next); i++) {
    const stage = currentStage(next)!.id;
    if (stage === 'shoot') next = finishShooting(next);
    else if (stage === 'switch') next = next.shots.length ? approveAllShots(next) : startSwitch(next);
    else if (stage === 'broll') next = next.broll.ideas.some((x) => x.status === 'clip') ? approveBroll(next) : next.broll.ideas.some((x) => x.keep && x.status === 'idea') ? generateBroll(next) : skipStage(next, 'broll');
    else if (stage === 'edit') next = next.final.builds ? lockEdit(next) : buildEdit(next);
    else if (stage === 'export') next = exportVideo(next);
    next = settleAuto(next);
  }
  return next;
}

function exported(): Project {
  return toExport(shootAll(planned()));
}

const sceneId = (p: Project, i: number) => scenesOf(p)[i].section.id;

describe('versions', () => {
  it('makes every export a numbered version, named for what it is', () => {
    const p = exported();
    expect(currentStage(p)).toBeUndefined();
    const v = latestVersion(p)!;
    expect(v.n).toBe(1);
    expect(v.part).toBe('snippet');
    expect(v.changes).toEqual([]);
    expect(versionSlug('Mud on the Rims', v)).toBe('mud-on-the-rims-v1-snippet');
    expect(nextActions(p).secondary?.label).toBe('Touch it up');
    expect(touchUpOptions(p)).toMatchObject({ edit: true, background: true, reshoot: true, full: true, nextVersion: 2 });
  });

  it('makes touch-ups free on a plan, and a credit without one', () => {
    const open = touchUpEdit(exported());
    expect(open.exportState.resolution).toBe('1080p');
    // Before the first export every plan pays for the video.
    expect(exportCost(planned(), 'Standard')).toBe(1);
    expect(exportCost(open, 'Standard')).toBe(0);
    expect(exportCost(open, 'Premium')).toBe(0);
    expect(exportCost(open, 'Free trial')).toBe(1);
    // Going bigger than the video has been still takes the upscale credit, unless Premium includes it.
    const big = setResolution(open, '4K');
    expect(exportCost(big, 'Standard')).toBe(1);
    expect(exportCost(big, 'Premium')).toBe(0);
    expect(exportCost(big, 'Free trial')).toBe(2);
    // Once it has been 4K, 4K and smaller touch-ups are free again.
    const again = touchUpEdit(toExport(lockEdit(big)));
    expect(exportCost(setResolution(again, '4K'), 'Standard')).toBe(0);
    expect(exportCost(setResolution(again, '1440p'), 'Standard')).toBe(0);
  });

  it('opens the edit without switching anything again, and the next export is v2', () => {
    const p = exported();
    const shots = p.shots.length;
    const open = touchUpEdit(p);
    expect(currentStage(open)?.id).toBe('edit');
    expect(open.final.builds).toBeGreaterThan(0);
    expect(open.shots.length).toBe(shots);
    expect(isStageDone(open, 'switch')).toBe(true);
    const next = toExport(lockEdit(setFxPack(open, p.fx.pack === 'dark' ? 'drill' : 'dark')));
    const v = latestVersion(next)!;
    expect(v.n).toBe(2);
    expect(v.changes.join(' ')).toMatch(/New effects/);
    expect(next.versions).toHaveLength(2);
  });
});

describe('touch-ups', () => {
  it('re-switches only the scene whose background changed', () => {
    const p = exported();
    expect(scenesOf(p).length).toBeGreaterThan(1);
    const open = newBackground(p, 1);
    expect(currentStage(open)?.id).toBe('switch');
    expect(open.renders?.length).toBeGreaterThan(0);
    // The switch waits for the new background to be locked.
    expect(startSwitch(open)).toBe(open);
    expect(nextActions(open).primary).toEqual({ label: "Lock scene 2's background", open: 'looks' });

    const changed = lockLocation(reviseLocation(open, 1, 'make it rain'), 1);
    const switching = startSwitch(changed);
    const fresh = switching.shots.filter((s) => !s.reused);
    const kept = switching.shots.filter((s) => s.reused);
    expect(fresh.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    expect(fresh.every((s) => s.sectionId === sceneId(changed, 1))).toBe(true);
    expect(kept.every((s) => s.sectionId !== sceneId(changed, 1))).toBe(true);

    const v = latestVersion(toExport(switching))!;
    expect(v.n).toBe(2);
    expect(v.changes).toContain('New background in scene 2');
  });

  it('never reuses a demo render once the project is live', () => {
    const open = lockLocation(reviseLocation(newBackground(exported(), 1), 1, 'make it rain'), 1);
    expect(startSwitch(open).shots.some((s) => s.reused)).toBe(true);
    const live = startSwitch({ ...open, pipeline: 'live' });
    expect(live.shots.length).toBeGreaterThan(0);
    expect(live.shots.some((s) => s.reused)).toBe(false);
  });

  it('goes back to the camera for one scene and keeps every other scene', () => {
    const p = exported();
    const open = reshootScene(p, 0);
    expect(currentStage(open)?.id).toBe('shoot');
    expect(nextScene(open)?.index).toBe(0);
    expect(nextActions(open).primary).toEqual({ label: 'Shoot scene 1', open: 'shoot' });

    const s = scenesOf(open)[0];
    let next = addTake(open, { source: 'record', fromSec: s.section.start, durationSec: s.section.end - s.section.start, scene: 0, sync: 'audio' });
    next = toExport(lockScene(next, 0));
    const fresh = next.shots.filter((x) => !x.reused);
    expect(next.shots.some((x) => x.reused)).toBe(true);
    expect(fresh.every((x) => x.sectionId === sceneId(next, 0))).toBe(true);
    expect(latestVersion(next)!.changes).toContain('Reshot scene 1');
  });

  it('keeps b-roll clips made, makes only new ones, and remakes one on request', () => {
    let p = exported();
    const made = p.broll.ideas.filter((i) => i.status === 'approved').map((i) => i.id);
    expect(made.length).toBeGreaterThan(0);
    p = touchUpBroll(p);
    expect(currentStage(p)?.id).toBe('broll');
    expect(made.every((id) => p.broll.ideas.find((i) => i.id === id)?.status === 'clip')).toBe(true);
    const added = addBrollIdea(p, 'A Cutlass pulling up in the rain');
    expect(nextActions(added).primary?.label).toMatch(/^Generate/);
    const again = remakeBroll(p, made[0]);
    expect(again.broll.ideas.find((i) => i.id === made[0])?.status).toBe('idea');
  });

  it('turns a snippet into the full song, keeping the scenes already shot', () => {
    const p = exported();
    const before = scenesOf(p).map((s) => s.section.id);
    const takes = p.takes.map((t) => ({ id: t.id, section: sceneId(p, t.scene!) }));
    const full = makeFullSong(p);
    const song = full.song!;
    expect(videoRange(full)).toEqual({ start: 0, end: song.durationSec });
    expect(currentStage(full)?.id).toBe('shoot');

    const scenes = scenesOf(full);
    expect(scenes.length).toBeGreaterThan(before.length);
    expect(new Set(scenes.map((s) => s.section.id)).size).toBe(scenes.length);
    expect(scenes.map((s) => s.section.label)).toEqual(scenes.map((_, i) => `Scene ${i + 1}`));
    // Takes and locks follow their scene, not its number.
    for (const t of takes) expect(sceneId(full, full.takes.find((x) => x.id === t.id)!.scene!)).toBe(t.section);
    for (const id of before) expect(full.sceneLocks?.[scenes.findIndex((s) => s.section.id === id)]).toBe(true);
    // New scenes have backgrounds to lock and a set guide each.
    expect(full.guides).toHaveLength(scenes.length);
    const fresh = scenes.filter((s) => !before.includes(s.section.id));
    expect(fresh.every((s) => (s.look?.options?.length ?? 0) > 0 && !s.look?.locationLocked)).toBe(true);
    expect(nextScene(full)?.section.id).toBe(fresh[0].section.id);

    const done = toExport(shootAll(full));
    const v = latestVersion(done)!;
    expect(v.n).toBe(2);
    expect(v.part).toBe('full');
    expect(v.changes[0]).toBe('Now the full song');
    expect(done.shots.some((s) => s.reused)).toBe(true);
    expect(touchUpOptions(done).full).toBe(false);
  });

  it('understands touch-ups typed into the chat', () => {
    const p = exported();
    expect(parseCommands('reshoot scene 2', p)).toEqual([{ type: 'reshootScene', scene: 2 }]);
    expect(parseCommands('give scene 1 a new background', p)).toEqual([{ type: 'newBackground', scene: 1 }]);
    expect(parseCommands('redo b-roll 1', p)).toEqual([{ type: 'remakeBroll', n: 1 }]);
    const full = respond(p, "let's make it the full song");
    expect(videoRange(full).end).toBe(full.song!.durationSec);
    expect(full.messages.at(-1)?.text).toMatch(/Full song it is/);
    const reshoot = respond(p, 'reshoot scene 9');
    expect(reshoot.messages.at(-1)?.text).toMatch(/There is no scene 9/);
  });
});
