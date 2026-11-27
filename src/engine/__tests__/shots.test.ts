import { describe, expect, it } from 'vitest';

import { addTake, approvePlan, buildCut, createProject, pickPart, settle } from '../actions';
import { applyCommand, parseCommands } from '../agent';
import { lockPlan } from '../brief';
import { canChangeShot, coverageTakes, lockScene, propsFor, readScene, recordLabel, scenesOf, setSceneShot } from '../production';
import { locationPreset, DEMO_TRACKS, songFromDemo, withScenes } from '../samples';
import { callShot, coverFor, FRAMINGS, frameHeight, rigFor, SHOT_ANGLES, upgradeGuide, type SceneRead } from '../shots';
import { summarize } from '../summary';
import type { Pose, Project, SetGuide } from '../types';

const read = (over: Partial<SceneRead> = {}): SceneRead => ({ index: 1, count: 4, plan: '', words: '', about: '', tempo: 'mid', before: [], ...over });

/** A song set up in the app: laid out in scenes by time, no lyrics, nothing said about it. */
function blankScenes(): Project {
  const song = withScenes({ ...songFromDemo(DEMO_TRACKS[0], true), lyrics: [], source: 'import' as const });
  const p = settle(createProject({ song, formats: ['16:9'], path: 'ai' }));
  return pickPart(p, 'full', { start: 0, end: song.durationSec });
}

/** The same song, planned and locked, ready to shoot. */
function shootReady(): Project {
  return lockPlan(blankScenes(), { brief: '', length: 'full' });
}

function shoot(p: Project, scene: number, times = 1): Project {
  let next = p;
  for (let i = 0; i < times; i++) {
    const s = scenesOf(next)[scene];
    next = addTake(next, { source: 'sample', fromSec: s.section.start, durationSec: s.section.end - s.section.start, scene, sync: 'audio' });
  }
  return next;
}

describe('optics', () => {
  it('puts the phone where the framing really fits, with room for the editor to punch in', () => {
    for (const pose of ['stand', 'sit', 'hang', 'lean'] as Pose[]) {
      for (const framing of FRAMINGS) {
        for (const angle of SHOT_ANGLES) {
          const rig = rigFor(framing, pose, angle);
          const span = rig.frame[1] - rig.frame[0];
          expect(frameHeight(rig.distance, rig.lensMm)).toBeGreaterThanOrEqual(span);
          if (rig.noZoomDistance) expect(frameHeight(rig.noZoomDistance, 24)).toBeGreaterThanOrEqual(span);
          if (rig.ultraWideDistance) expect(frameHeight(rig.ultraWideDistance, 13)).toBeGreaterThanOrEqual(span);
        }
      }
    }
  });

  it('frames a close-up on 2x from about 1.6 m, chest up, not from arm\'s length', () => {
    const close = rigFor('close', 'stand', 'level');
    expect(close.zoom).toBe(2);
    expect(close.distance).toBeCloseTo(1.6, 1);
    expect(close.noZoomDistance).toBeCloseTo(0.8, 1);
    expect(rigFor('wide', 'stand', 'low').height).toBeLessThan(1);
    expect(rigFor('medium', 'sit', 'level').height).toBeLessThan(rigFor('medium', 'stand', 'level').height);
  });
});

describe("the director's shot calls", () => {
  it('goes close on personal bars', () => {
    const pick = callShot(read({ words: 'Mama said keep going, I cried when my brother passed away' }));
    expect(pick.framing).toBe('close');
    expect(pick.why).toMatch(/personal/);
    expect(pick.move).toBe('push');
  });

  it('puts a car scene in a seated medium, and never wide, even where the song hits hardest', () => {
    const pick = callShot(read({ plan: 'In the driver seat of a Lambo at night, city lights going by', energy: 1.4, peak: true }));
    expect(pick.framing).toBe('medium');
    expect(pick.pose).toBe('sit');
    expect(pick.move).toBe('still');
    expect(pick.why).toMatch(/car/);
    expect(pick.props[0]).toMatchObject({ kind: 'seat', for: 'the car seat' });
  });

  it('keeps all of you in frame hanging off a helicopter, with a bar to grab', () => {
    const pick = callShot(read({ plan: 'Hanging off a helicopter over the city' }));
    expect(pick).toMatchObject({ framing: 'wide', pose: 'hang' });
    expect(pick.props[0].kind).toBe('bar');
  });

  it('goes wide for dancing and the crew', () => {
    const pick = callShot(read({ words: 'we dancing all night with the whole crew' }));
    expect(pick.framing).toBe('wide');
    expect(pick.why).toMatch(/moving|crew/);
  });

  it('goes wide and low where the song hits hardest, and close where it pulls back', () => {
    expect(callShot(read({ energy: 1.3, peak: true }))).toMatchObject({ framing: 'wide', angle: 'low', move: 'arc' });
    expect(callShot(read({ energy: 0.7 }))).toMatchObject({ framing: 'close', move: 'push' });
  });

  it('opens wide, gives the hook the low wide, and backs away at the end', () => {
    expect(callShot(read({ index: 0, count: 5 })).framing).toBe('wide');
    expect(callShot(read({ kind: 'hook' }))).toMatchObject({ framing: 'wide', angle: 'low' });
    expect(callShot(read({ index: 4, count: 5, before: ['close'] })).move).toBe('pull');
  });

  it("lets the plan's own words win, even against the shot before", () => {
    const pick = callShot(read({ plan: 'Tight close-up on my face under one red light', before: ['close', 'close'] }));
    expect(pick.framing).toBe('close');
    expect(pick.why).toBe('The plan calls for a close-up.');
    expect(callShot(read({ plan: 'Full body shot from a low angle on the roof' }))).toMatchObject({ framing: 'wide', angle: 'low' });
  });

  it("doesn't read a hanging mic as you hanging, or a lot full of cars as a car seat", () => {
    const mic = callShot(read({ plan: locationPreset('hangingMic').prompt }));
    expect(mic.pose).toBe('stand');
    expect(mic.props.map((p) => p.kind)).toEqual(['mic']);
    expect(propsFor('A black studio with one microphone hanging from the ceiling. The artist wants: a mic stand on a dark stage.').map((p) => p.kind)).toEqual(['stand']);
    const lot = callShot(read({ plan: 'A parking lot full of exotic cars at night with security behind you' }));
    expect(lot.pose).toBe('stand');
    expect(lot.props).toEqual([]);
  });

  it('reads what the song is about across every scene, more lightly than the scene itself', () => {
    const pick = callShot(read({ about: 'My grandma passing and how I kept going' }));
    expect(pick.framing).toBe('close');
    expect(pick.why).toBe('The song is personal, so the camera stays close.');
  });
});

describe('set guides', () => {
  it('keeps neighboring scenes on different framings when nothing else decides', () => {
    const p = shootReady();
    const framings = p.guides!.map((g) => g.framing);
    expect(framings.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < framings.length; i++) expect(framings[i]).not.toBe(framings[i - 1]);
    // All three framings get used, so the cut has wides, mediums and close-ups to move between.
    expect(new Set(framings).size).toBe(3);
    // Every scene gets a reason the artist reads on set.
    expect(p.guides!.every((g) => g.why.length > 10)).toBe(true);
  });

  it('says where the phone goes in meters and feet, with a way out for no zoom and small rooms', () => {
    const p = setSceneShot(setSceneShot(shootReady(), 0, 'wide'), 1, 'close');
    const [wide, close] = p.guides!;
    expect(close.steps.join(' ')).toMatch(/2x zoom/);
    expect(close.steps.join(' ')).toMatch(/No zoom on your camera\? Bring the phone in to 0\.8 m \(2\.6 ft\) at 1x/);
    expect(wide.steps.join(' ')).toMatch(/Short on room\? On 0\.5x/);
    expect(wide.steps.join(' ')).toMatch(/\d\.\d m \(\d+\.\d ft\)/);
  });

  it('lets the artist change a scene until it is locked, and only that guide moves', () => {
    let p = shootReady();
    const before = p.guides!.map((g) => ({ ...g }));
    const other = before[1].framing === 'close' ? 'wide' : 'close';
    p = setSceneShot(p, 1, other);
    expect(p.guides![1]).toMatchObject({ framing: other, by: 'artist' });
    expect(p.guides![1].why).toMatch(/^Your call\./);
    expect(p.guides![1].camera.z).not.toBe(before[1].camera.z);
    expect(p.guides![0]).toEqual(before[0]);
    expect(p.guides![2]).toEqual(before[2]);
    // Locked scenes keep their shot.
    p = lockScene(shoot(p, 1), 1);
    expect(canChangeShot(p, 1)).toBe(false);
    expect(setSceneShot(p, 1, before[1].framing)).toBe(p);
  });

  it("carries the director's calls from the plan into the guides when it locks", () => {
    let p = blankScenes();
    p = setSceneShot(p, 0, 'close', { by: 'director', angle: 'low', why: 'Your story starts in your face.' });
    expect(p.guides).toBeUndefined();
    p = approvePlan(p);
    expect(p.guides![0]).toMatchObject({ framing: 'close', angle: 'low', by: 'director', why: 'Your story starts in your face.' });
  });

  it('takes a shot change from the chat', () => {
    const p = shootReady();
    const want = p.guides![1].framing === 'close' ? 'wide' : 'close';
    const said = want === 'close' ? 'make scene 2 a close-up' : 'go wide on scene 2';
    expect(parseCommands(said, p)).toEqual([{ type: 'setShot', scene: 2, framing: want }]);
    const res = applyCommand(p, { type: 'setShot', scene: 2, framing: want });
    expect(res.ok).toBe(true);
    expect(res.project.guides![1].framing).toBe(want);
    expect(res.note).toMatch(/^Scene 2 is a (wide|close-up) now\./);
    expect(applyCommand(p, { type: 'setShot', scene: 99, framing: 'wide' }).ok).toBe(false);
    expect(parseCommands('low angle for scene 1', p)).toEqual([{ type: 'setShot', scene: 1, framing: p.guides![0].framing, angle: 'low' }]);
  });

  it('tells the director each scene’s shot, words and energy', () => {
    const p = lockPlan(settle(createProject({ song: songFromDemo(DEMO_TRACKS[0]), formats: ['16:9'], path: 'ai' })), { brief: 'A rooftop at night', length: 'snippet' });
    const scenes = summarize(p).scenes as { framing?: string; lyrics?: string }[];
    expect(scenes.every((s) => s.framing)).toBe(true);
    expect(scenes.some((s) => s.lyrics && /mud|bottom|Mama/.test(s.lyrics))).toBe(true);
  });

  it('labels the recorder with the scene, the take and the shot', () => {
    const p = shootReady();
    expect(recordLabel(p, 0)).toMatch(/^Scene 1 · .+ · take 1 · (Wide|Medium|Close-up) (1|1\.5|2)x$/);
  });

  it('fills in guides saved before shot calls, keeping their framing and distance', () => {
    const old = {
      scene: 0,
      framing: 'wide',
      camera: { x: 0, z: 3.2, height: 0.6 },
      lensMm: 24,
      backroomM: 1.5,
      light: 'behind camera',
      steps: ['Stand on your mark.'],
      props: [{ kind: 'seat', for: 'the seat', say: 'Sit.' }],
    } as unknown as SetGuide;
    const g = upgradeGuide(old);
    expect(g).toMatchObject({ framing: 'wide', pose: 'sit', angle: 'low', zoom: 1, by: 'director', camera: { z: 3.2 } });
    expect(g.frame).toEqual([0, 1.55]);
  });

  it('reads the plan without the mood every scene shares', () => {
    const p = blankScenes();
    const scene = { ...scenesOf(p)[1], look: { location: 'custom' as const, prompt: 'A rooftop at night. Mood: slow push-ins on the hook.', refs: [] } };
    const r = readScene(p, scene);
    expect(r.plan).toBe('A rooftop at night.');
    expect(r.about).toContain('slow push-ins on the hook');
    expect(callShot(r).why).not.toMatch(/hook/);
  });
});

describe('coverage', () => {
  it('cuts between two framings of a scene, and sticks to the best take of one', () => {
    let p = shootReady();
    const first = scenesOf(p)[0];
    p = shoot(p, 0, 2);
    const inScene = (q: Project) => new Set(buildCut(q).filter((seg) => seg.sectionId === first.section.id && seg.takeId).map((seg) => seg.takeId));
    expect(inScene(p).size).toBe(1);
    expect(coverageTakes(p, 0)).toHaveLength(1);

    const alt = coverFor(p.guides![0]);
    expect(alt).not.toBe(p.guides![0].framing);
    p = shoot(setSceneShot(p, 0, alt), 0);
    const carry = coverageTakes(p, 0);
    expect(carry.map((t) => t.framing).sort()).toEqual([p.takes[0].framing, alt].sort());
    expect(inScene(p)).toEqual(new Set(carry.map((t) => t.id)));
  });

  it('records the framing on every take shot for a scene', () => {
    const p = shoot(shootReady(), 2);
    expect(p.takes.at(-1)!.framing).toBe(p.guides![2].framing);
  });
});
