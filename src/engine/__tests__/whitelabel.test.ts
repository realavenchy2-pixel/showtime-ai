import { describe, expect, it } from 'vitest';

import { addTake, approveAllShots, approveBroll, buildEdit, connectLive, createProject, exportVideo, finishShooting, generateBroll, lockEdit, pickPart, setAutonomy, settle, skipStage, startSwitch } from '../actions';
import { settleAuto } from '../agent';
import { brollPrompt } from '../broll';
import { lockPlan } from '../brief';
import { CAMERA_LOOKS } from '../cameraLooks';
import { backgroundStyle, lockLocation, lockScene, reviseLocation, scenesOf, setCameraLook, setSongAbout, songMood } from '../production';
import { BROLL_MODEL, BROLL_RETRY_MODEL, DEMO_TRACKS, songFromDemo, withScenes } from '../samples';
import { currentStage } from '../stages';
import { remakeBroll, touchUpBroll } from '../touchup';
import type { Project } from '../types';
import { plainWords } from '../whitelabel';

const NAMES = /SwitchX|Beeble|Claude|Anthropic|Gemini|\bOmni\b|\bH3\b|MiniMax|Topaz|Proteus|Starlight|OpenAI|\bGPT\b|Sunburst|Nano Banana|\bfal\b/i;

function song() {
  return withScenes(songFromDemo(DEMO_TRACKS[0]));
}

/** Planned with a camera and what the song is about, before the shot list is made. */
function planned(camera: Parameters<typeof setCameraLook>[1] = 'venice'): Project {
  let p = settle(createProject({ song: song(), formats: ['9:16'], path: 'ai', vibe: 'Drill' }));
  p = pickPart(p, 'snippet', { start: 40, end: 70 });
  p = setSongAbout(p, 'Came up from nothing, now the money talks', 'Never fold');
  p = setCameraLook(p, camera);
  return lockPlan(p, { brief: '', length: 'snippet' });
}

function exported(p: Project): Project {
  let next = p;
  for (const scene of scenesOf(next)) {
    next = addTake(next, { source: 'record', fromSec: scene.section.start, durationSec: scene.section.end - scene.section.start, scene: scene.index, sync: 'audio' });
    next = lockLocation(lockScene(next, scene.index), scene.index);
  }
  next = settleAuto(setAutonomy(next, 'auto'));
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

describe('white label', () => {
  it('never names a model or company in anything the director or the app says', () => {
    const p = exported(planned());
    expect(currentStage(p)).toBeUndefined();
    const said = p.messages.map((m) => m.text).filter((t) => NAMES.test(t));
    expect(said).toEqual([]);
    const live = connectLive(settle(createProject({ song: song(), formats: ['9:16'] })), { model: 'switchx-3.0', maxFrames: 360, maxRefs: 4, resolutions: [720, 1080], broll: ['h3', 'omni'], references: true, director: true });
    expect(live.messages.at(-1)?.text).not.toMatch(NAMES);
  });

  it('turns a provider error into plain words', () => {
    expect(plainWords('Beeble balance is too low for SwitchX 3.0')).toBe('the switch balance is too low for the switch');
    expect(plainWords('OpenAI gpt-image-2.6-sunburst rate limit')).toBe('the image service rate limit');
    expect(plainWords('Gemini Omni timed out; Topaz Starlight failed')).toBe('the render service timed out; the upscaler failed');
    expect(plainWords('Drop it on the beat')).toBe('Drop it on the beat');
  });
});

describe('backgrounds match the camera and the song', () => {
  it('puts the camera and the mood in every background prompt', () => {
    const p = planned('venice');
    const options = scenesOf(p).flatMap((s) => s.look?.options ?? []);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      expect(o.prompt).toContain(CAMERA_LOOKS.find((c) => c.id === 'venice')!.prompt);
      expect(o.prompt).toMatch(/Mood: cold, gritty street energy/);
      expect(o.prompt).toMatch(/luxury and money/);
      expect(o.prompt).toMatch(/come-up energy/);
      expect(o.prompt).toMatch(/Natural color, no heavy grade/);
      // The artist's own words stay out of the image prompt; only mood words go in.
      expect(o.prompt).not.toMatch(/money talks|Never fold/);
    }
    expect(songMood(p)).toBe('cold, gritty street energy with hard shadows; luxury and money; hungry come-up energy, gritty');
  });

  it('leaves the camera out when the artist picks no look', () => {
    expect(backgroundStyle(planned('natural'))).not.toMatch(/Shot on/);
    expect(backgroundStyle(planned('film500t'))).toMatch(/^Shot on Kodak Vision3 500T/);
  });

  it('makes the first round on the default model and a redo on the backup', () => {
    const p = planned();
    expect(scenesOf(p).flatMap((s) => s.look?.options ?? []).some((o) => o.retry)).toBe(false);
    const redo = reviseLocation(p, 0, 'make it rain');
    const fresh = scenesOf(redo)[0].look!.options!;
    expect(fresh.every((o) => o.retry)).toBe(true);
    expect(fresh[0].prompt).toMatch(/Change: make it rain/);
  });

  it('gives b-roll the same camera and mood, and sends a redo to the backup model', () => {
    let p = exported(planned('venice'));
    const made = p.broll.ideas.find((i) => i.status === 'approved' && !i.clipId)!;
    expect(made.model).toBe(BROLL_MODEL);
    expect(brollPrompt(p, made)).toContain('Shot on a Sony Venice 2');
    p = remakeBroll(touchUpBroll(p), made.id);
    const again = p.broll.ideas.find((i) => i.id === made.id)!;
    expect(again.status).toBe('idea');
    expect(again.model).toBe(BROLL_RETRY_MODEL);
  });
});
