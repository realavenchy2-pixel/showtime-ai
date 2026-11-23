import { describe, expect, it } from 'vitest';

import { addTake, buildCut, createProject, finishShooting, settle } from '../actions';
import { lockPlan } from '../brief';
import { CAMERA_LOOKS, cssFilter, cubeLut, gradeColor } from '../cameraLooks';
import {
  addMyIdea,
  allScenesLocked,
  autoStills,
  bestTake,
  libraryView,
  locationRef,
  lockScene,
  pickIdea,
  remakeLocation,
  scenesOf,
  setInspiration,
  setPath,
  takesFor,
} from '../production';
import { DEMO_TRACKS, songFromDemo } from '../samples';
import type { Project } from '../types';

function fresh(path: Project['path'] = 'ai', approveEachStep = false): Project {
  return settle(createProject({ song: songFromDemo(DEMO_TRACKS[0]), formats: ['9:16'], path, approveEachStep }));
}

function locked(): Project {
  return lockPlan(fresh(), { brief: 'A rooftop at night, then a white room with one light.', length: 'snippet' });
}

/** Records `count` takes of a scene, covering all of it. */
function shoot(p: Project, scene: number, count: number, flagFirst = false): Project {
  let next = p;
  for (let i = 0; i < count; i++) {
    const s = scenesOf(next)[scene];
    next = addTake(next, { source: 'sample', fromSec: s.section.start, durationSec: s.section.end - s.section.start, scene, sync: 'audio', flag: flagFirst && i === 0 ? 'Out of frame' : undefined });
  }
  return next;
}

describe('path', () => {
  it('lets AI direct on its own, or stops at each step when asked', () => {
    expect(fresh('ai').autonomy).toBe('auto');
    expect(fresh('ai', true).autonomy).toBe('ask');
    expect(fresh('vision').autonomy).toBe('ask');
    expect(setPath(fresh('ai'), 'vision').path).toBe('vision');
  });
});

describe('shoot plan ideas', () => {
  it('pitches ideas from the song when the project starts', () => {
    const p = fresh();
    const fromSong = (p.planIdeas ?? []).filter((i) => i.source === 'song');
    expect(fromSong.length).toBe(3);
    expect(fromSong.every((i) => i.pitch.length > 20)).toBe(true);
  });

  it('takes the artist idea and a video link, and picking one sets the brief', () => {
    let p = addMyIdea(fresh(), 'Me in a warehouse with smoke');
    p = setInspiration(p, 'https://youtube.com/watch?v=abc');
    const mine = p.planIdeas!.find((i) => i.source === 'mine')!;
    const inspo = p.planIdeas!.find((i) => i.source === 'inspiration')!;
    expect(pickIdea(p, mine.id).brief).toBe('Me in a warehouse with smoke');
    expect(pickIdea(p, inspo.id).brief).toContain('https://youtube.com/watch?v=abc');
  });
});

describe('locking the plan', () => {
  it('makes an empty location and a set guide for every scene', () => {
    const p = locked();
    const scenes = scenesOf(p);
    expect(scenes.length).toBeGreaterThan(0);
    expect(p.guides?.length).toBe(scenes.length);
    for (const scene of scenes) {
      const ref = locationRef(scene.look);
      expect(ref?.location).toBe(true);
      // Made before the shoot: the artist is not in it.
      expect(ref?.prompt).toMatch(/nobody in the frame/i);
      // It is the scene's first reference for the switch.
      expect(scene.look?.refs[0]?.id).toBe(ref?.id);
    }
    expect((p.library ?? []).filter((i) => i.kind === 'location').length).toBe(scenes.length);
  });

  it('keeps the old location in the library when one is remade', () => {
    const p = locked();
    const before = locationRef(scenesOf(p)[0].look)!.id;
    const next = remakeLocation(p, 0);
    expect(locationRef(scenesOf(next)[0].look)!.id).not.toBe(before);
    expect((next.library ?? []).length).toBe((p.library ?? []).length + 1);
  });

  it('guides go low and wide on hooks', () => {
    const p = locked();
    for (const scene of scenesOf(p)) {
      const g = p.guides![scene.index];
      expect(g.steps.length).toBeGreaterThanOrEqual(3);
      if (scene.section.kind === 'hook') {
        expect(g.framing).toBe('wide');
        expect(g.camera.height).toBeLessThan(1);
      }
    }
  });
});

describe('shooting scene by scene', () => {
  it('records takes per scene, locks scenes, and the AI editor picks the best take', () => {
    let p = locked();
    const scenes = scenesOf(p);
    p = shoot(p, 0, 3, true);
    expect(takesFor(p, 0).length).toBe(3);
    // The flagged take loses to the clean ones; the latest clean take wins a tie.
    const best = bestTake(p, 0)!;
    expect(best.flag).toBeUndefined();
    expect(best.id).toBe(takesFor(p, 0)[2].id);
    for (let i = 1; i < scenes.length; i++) p = shoot(p, i, 2);
    expect(allScenesLocked(p)).toBe(false);
    for (const s of scenesOf(p)) p = lockScene(p, s.index);
    expect(allScenesLocked(p)).toBe(true);
  });

  it('matches a screenshot of each best take to its planned location, and the cut uses the best take', () => {
    let p = locked();
    for (const s of scenesOf(p)) p = lockScene(shoot(p, s.index, 2), s.index);
    const stills = autoStills(p);
    expect(stills.length).toBe(scenesOf(p).length);
    for (const st of stills) {
      expect(st.location?.location).toBe(true);
      expect(st.takeId).toBe(bestTake(p, st.scene)!.id);
    }
    const cut = buildCut(settle(finishShooting(p)));
    const bestIds = new Set(scenesOf(p).map((s) => bestTake(p, s.index)!.id));
    expect(cut.filter((c) => c.takeId).every((c) => bestIds.has(c.takeId))).toBe(true);
    expect(libraryView(p).some((i) => i.kind === 'still')).toBe(true);
  });
});

describe('camera looks', () => {
  it('are modeled on real cinema cameras, with no fisheye', () => {
    expect(CAMERA_LOOKS.map((l) => l.id)).toEqual(expect.arrayContaining(['alexa', 'venice', 'fx3', 'red']));
    expect(CAMERA_LOOKS.some((l) => /fisheye/i.test(l.name + l.feel))).toBe(false);
  });

  it('writes valid .cube LUTs and keeps neutral gray close to gray on "No look"', () => {
    const lut = cubeLut('alexa', 5);
    const rows = lut.trim().split('\n').filter((l) => /^[\d.]+ [\d.]+ [\d.]+$/.test(l));
    expect(rows.length).toBe(125);
    const [r, g, b] = gradeColor('natural', [0.5, 0.5, 0.5]);
    expect(Math.abs(r - 0.5) + Math.abs(g - 0.5) + Math.abs(b - 0.5)).toBeLessThan(0.01);
    expect(cssFilter('venice')).toMatch(/contrast\(/);
  });
});
