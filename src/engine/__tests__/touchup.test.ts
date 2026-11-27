import { describe, expect, it } from 'vitest';

import {
  addBrollIdea,
  addTake,
  approveAllShots,
  approveBroll,
  buildEdit,
  createProject,
  deliverAt,
  exportCost,
  exportVideo,
  finishJob,
  finishShooting,
  generateBroll,
  lockEdit,
  pickPart,
  setAutonomy,
  setResolution,
  setFxPack,
  setUpscaler,
  settle,
  skipStage,
  startSwitch,
  upscaleFailed,
  videoRange,
} from '../actions';
import { parseCommands, respond, settleAuto } from '../agent';
import { lockPlan } from '../brief';
import { nextActions } from '../director';
import { lockLocation, lockScene, nextScene, reviseLocation, scenesOf, setBackgrounds } from '../production';
import { setupList } from '../shots';
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

  it('charges one more for Topaz Starlight at 1440p and 4K, on every plan', () => {
    const open = touchUpEdit(exported());
    const detail = setUpscaler(open, 'detail');
    // At 1080p nothing is upscaled, so the look costs nothing.
    expect(exportCost(detail, 'Standard')).toBe(0);
    expect(exportCost(setResolution(detail, '4K'), 'Standard')).toBe(2);
    expect(exportCost(setResolution(detail, '4K'), 'Premium')).toBe(1);
    expect(exportCost(setResolution(detail, '1440p'), 'Free trial')).toBe(3);
    expect(exportCost(setResolution(planned(), '4K'), 'Free trial')).toBe(2);
    expect(exportCost(setUpscaler(setResolution(planned(), '4K'), 'detail'), 'Free trial')).toBe(3);
  });

  it('delivers the on-device size when the upscale does not finish, and hands the upscale credit back', () => {
    const ready = setUpscaler(setResolution(lockEdit(touchUpEdit(exported())), '4K'), 'clean');
    expect(currentStage(ready)?.id).toBe('export');
    const running = exportVideo(ready, 2, { external: true });
    expect(running.job?.stage).toBe('export');
    const fell = upscaleFailed(running, '1080p', 'Topaz timed out.', 1);
    expect(fell.exportState.resolution).toBe('1080p');
    expect(fell.exportState.creditsCharged).toBe(1);
    expect(fell.messages.at(-1)?.text).toBe("The 4K upscale didn't finish (the upscaler timed out). You have it in 1080p and the upscale credit is back.");
    const done = finishJob(fell);
    expect(latestVersion(done)?.resolution).toBe('1080p');
    // Only a running export can fall back.
    expect(upscaleFailed(ready, '1080p', 'x', 1)).toBe(ready);
    // A phone renders 1080p as 720p, and the version says so.
    const phone = finishJob(deliverAt(exportVideo(setResolution(lockEdit(touchUpEdit(exported())), '1080p'), 0, { external: true }), '720p'));
    expect(latestVersion(phone)?.resolution).toBe('720p');
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

describe('shooting where you are', () => {
  function realPlanned(): Project {
    const p = settle(createProject({ song: withScenes(songFromDemo(DEMO_TRACKS[0])), formats: ['9:16'], path: 'vision' }));
    const picked = pickPart(setBackgrounds(p, 'real'), 'snippet', { start: 40, end: 70 });
    return lockPlan(picked, { brief: 'In the alley behind my building, then my car at night', places: 'In the alley behind my building, then my car at night', length: 'snippet' });
  }

  it('plans the real spots with set guides and no backgrounds to pick', () => {
    const p = realPlanned();
    expect(p.planApproved).toBe(true);
    for (const sc of scenesOf(p)) {
      expect(sc.look?.location).toBe('custom');
      expect(sc.look?.options ?? []).toEqual([]);
    }
    expect(scenesOf(p)[0].look?.prompt).toMatch(/alley behind my building/);
    const steps = p.guides!.map((g) => g.steps.join(' ')).join(' ');
    expect(steps).toMatch(/Pick your spot/);
    expect(steps).not.toMatch(/switch cleanest|plain wall/);
    expect(p.messages.at(-1)!.text + p.messages.map((m) => m.text).join(' ')).not.toMatch(/empty location/);
  });

  it('skips the switch, keeps b-roll and the edit, and offers no new backgrounds after', () => {
    const p = exportedFrom(realPlanned());
    expect(currentStage(p)).toBeUndefined();
    expect(p.skipped).toContain('switch');
    expect(p.shots).toEqual([]);
    expect(isStageDone(p, 'edit')).toBe(true);
    expect(touchUpOptions(p).background).toBe(false);
    expect(newBackground(p, 0)).toBe(p);
  });

  it('asks for the real thing instead of stand-ins', () => {
    const g = { pose: 'sit' as const, props: [{ kind: 'seat' as const, for: 'the car seat', say: 'Sit on a chair.' }, { kind: 'stand' as const, for: 'the mic stand', say: 'A broom.' }] };
    expect(setupList(g, true).map((i) => i.title)).toEqual(['Sit down', 'A mic stand']);
    expect(setupList(g, true)[1].say).toMatch(/real thing/);
    expect(setupList(g).map((i) => i.title)).toEqual(['Sit down', 'A stand-in for the mic stand']);
  });

  it('is decided before the plan locks', () => {
    const p = realPlanned();
    expect(setBackgrounds(p, 'new')).toBe(p);
  });
});

function exportedFrom(p: Project): Project {
  return toExport(shootAll(p));
}
