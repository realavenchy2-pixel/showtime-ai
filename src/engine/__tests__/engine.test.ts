import { describe, expect, it } from 'vitest';

import {
  addSampleTake,
  addTake,
  advance,
  approveAllShots,
  approvePlan,
  buildCut,
  buildShots,
  connectLive,
  coverage,
  createProject,
  exportCost,
  exportVideo,
  failJob,
  finishJob,
  finishShooting,
  lockCut,
  lockEdit,
  MIN_SHOT_SEC,
  redoShot,
  removeTake,
  reshuffleCut,
  resumeSwitch,
  revisit,
  setAutonomy,
  setJobProgress,
  setLook,
  setRange,
  setResolution,
  setSwitchSettings,
  settle,
  snippetRange,
  startSwitch,
  switchProgress,
  updateShot,
  updateSong,
  videoRange,
} from '../actions';
import { agentAct, applyCommand, estimateBudget, parseCommands, respond, runAgent, settleAuto } from '../agent';
import { nextActions } from '../director';
import { buildCues, planForPack } from '../fx';
import { routeIdea } from '../ideas';
import { buildSampleProjects } from '../sampleProjects';
import { barSec, DEFAULT_TAKE_PLAN, DEMO_TRACKS, demoDuration, SCENE_SEC, scenesFor, songFromDemo, withScenes } from '../samples';
import { currentStage, stageStatus, trackerView } from '../stages';
import { HANDLE_SEC, SWITCHX } from '../switchx';
import { lockPlan, planFromBrief, setVideoLength, SNIPPET_SEC, suggestedLength, videoLength } from '../brief';
import { recentChat, summarize } from '../summary';
import type { Project } from '../types';

const mud = () => songFromDemo(DEMO_TRACKS[0]);

/** Distance from the nearest whole number: 0 when `x` sits on the grid. */
const offGrid = (x: number) => Math.abs(x - Math.round(x));

function fresh(overrides: Partial<Parameters<typeof createProject>[0]> = {}): Project {
  return settle(createProject({ song: mud(), vibe: 'Drill', formats: ['16:9'], ...overrides }));
}

function shot(p: Project): Project {
  let next = p;
  for (const t of DEFAULT_TAKE_PLAN) next = addSampleTake(next, t.angle, t.scope);
  return next;
}

/** A project with the plan locked, the takes in and the cut locked: the switch is next. */
function planned(): Project {
  let p = setAutonomy(approvePlan(fresh()), 'ask');
  p = lockCut(settle(finishShooting(shot(p))));
  return { ...p, autonomy: 'auto' };
}

describe('song', () => {
  it('lays demo sections on the bar grid', () => {
    const song = mud();
    const bar = barSec(142);
    expect(song.durationSec).toBeCloseTo(48 * bar, 2);
    expect(song.sections.map((s) => s.label)).toEqual(['Intro', 'Verse 1', 'Hook', 'Verse 2', 'Hook', 'Outro']);
    for (const s of song.sections) expect(offGrid((s.end - s.start) / bar)).toBeCloseTo(0, 2);
    expect(song.sections[0].start).toBe(0);
    expect(song.sections.at(-1)!.end).toBeCloseTo(demoDuration(DEMO_TRACKS[0]), 3);
  });

  it('maps the track, then hands the shoot to the artist', () => {
    const started = createProject({ song: mud(), vibe: 'Drill', formats: ['16:9'] });
    expect(started.job?.stage).toBe('song');
    expect(currentStage(started)?.id).toBe('song');
    const p = settle(started);
    expect(currentStage(p)?.id).toBe('looks');
    expect(nextActions(p).primary).toEqual({ label: 'Lock the plan', run: 'approvePlan' });
    expect(p.messages.at(-1)?.attachment).toBe('plan');
    const locked = approvePlan(p);
    expect(currentStage(locked)?.id).toBe('shoot');
    expect(nextActions(locked).primary).toEqual({ label: 'Start recording', open: 'record' });
    expect(locked.messages.at(-1)?.attachment).toBe('takePlan');
  });

  it('skips the mapping job for a track that arrives already analyzed', () => {
    const p = createProject({ song: { ...mud(), analyzed: true, source: 'import' }, vibe: 'Trap', formats: ['9:16'] });
    expect(p.job).toBeUndefined();
    expect(currentStage(p)?.id).toBe('looks');
  });

  it('picks the effects pack from the tempo when nobody picks a vibe', () => {
    const p = createProject({ song: { ...mud(), analyzed: true }, formats: ['16:9'] });
    expect(p.vibe).toBe('Trap');
    expect(p.fx.pack).toBe('trapHype');
    expect(createProject({ song: { ...songFromDemo(DEMO_TRACKS[1]), analyzed: true }, formats: ['16:9'] }).vibe).toBe('Boom bap');
  });
});

describe('shoot', () => {
  it('clamps a take to the song and reports coverage', () => {
    let p = fresh();
    p = addTake(p, { source: 'record', fromSec: 10, durationSec: 500, fps: 30, width: 1080, height: 1920 });
    const take = p.takes[0];
    expect(take.start).toBe(10);
    expect(take.end).toBeCloseTo(p.song!.durationSec, 3);
    expect(coverage(p)).toBeCloseTo((p.song!.durationSec - 10) / p.song!.durationSec, 3);
    p = addTake(p, { source: 'record', fromSec: 0, durationSec: 20 });
    expect(coverage(p)).toBe(1);
    expect(p.takes.map((t) => t.n)).toEqual([1, 2]);
  });

  it('ignores takes too short to cut with', () => {
    const p = fresh();
    expect(addTake(p, { source: 'record', fromSec: 0, durationSec: 0.2 })).toBe(p);
  });

  it('wraps the shoot into a cut job', () => {
    const p = finishShooting(shot(fresh()));
    expect(p.shootLocked).toBe(true);
    expect(p.job?.stage).toBe('cut');
    const empty = fresh();
    expect(finishShooting(empty)).toBe(empty);
  });
});

describe('cut', () => {
  it('tiles the whole song on the bar grid with no gaps or overlaps', () => {
    const p = planned();
    const segs = p.cut.segments;
    expect(segs[0].start).toBe(0);
    expect(segs.at(-1)!.end).toBeCloseTo(p.song!.durationSec, 2);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeCloseTo(segs[i - 1].end, 3);
    const bar = barSec(p.song!.bpm);
    for (const seg of segs) {
      const section = p.song!.sections.find((s) => s.id === seg.sectionId)!;
      expect(seg.start).toBeGreaterThanOrEqual(section.start - 0.001);
      expect(seg.end).toBeLessThanOrEqual(section.end + 0.001);
      expect(offGrid((seg.start - section.start) / bar)).toBeCloseTo(0, 2);
    }
  });

  it('cuts hooks faster and brings them back to the low angle', () => {
    const p = planned();
    const low = p.takes.find((t) => t.angle === 'Low angle')!;
    const hookIds = p.song!.sections.filter((s) => s.kind === 'hook').map((s) => s.id);
    const hookSegs = p.cut.segments.filter((s) => hookIds.includes(s.sectionId));
    const verseSegs = p.cut.segments.filter((s) => p.song!.sections.find((x) => x.id === s.sectionId)!.kind === 'verse');
    expect(hookSegs.filter((s) => s.takeId === low.id).length).toBeGreaterThanOrEqual(hookSegs.length / 2 - 1);
    expect(verseSegs.every((s) => s.takeId !== low.id)).toBe(true);
    const avg = (xs: typeof hookSegs) => xs.reduce((sum, s) => sum + (s.end - s.start), 0) / xs.length;
    expect(avg(hookSegs)).toBeLessThan(avg(verseSegs));
  });

  it('never shows the same take twice in a row when another one covers the shot', () => {
    const segs = planned().cut.segments;
    for (let i = 1; i < segs.length; i++) expect(segs[i].takeId).not.toBe(segs[i - 1].takeId);
  });

  it('uses every full-song take in the verses', () => {
    const p = planned();
    const used = new Set(p.cut.segments.map((s) => s.takeId));
    for (const take of p.takes) expect(used.has(take.id)).toBe(true);
  });

  it('leaves a gap where no take covers the song', () => {
    let p = fresh();
    p = addTake(p, { source: 'record', fromSec: 0, durationSec: 30 });
    p = settleAuto(finishShooting(p));
    const gaps = p.cut.segments.filter((s) => !s.takeId);
    expect(gaps.length).toBeGreaterThan(0);
    // The take leaves on the last beat it covers, not mid-beat.
    expect(gaps[0].start).toBeLessThanOrEqual(30);
    expect(gaps[0].start).toBeGreaterThan(30 - 60 / p.song!.bpm - 0.01);
    expect(p.cut.segments.filter((s) => s.takeId).every((s) => s.end <= 30.01)).toBe(true);
    expect(p.messages.some((m) => /have no take on them, so b-roll covers that stretch/.test(m.text))).toBe(true);
  });

  it('shuffles into a different cut until the switch starts', () => {
    const p = planned();
    const shuffled = reshuffleCut(p);
    expect(shuffled.cut.seed).toBe(1);
    expect(shuffled.cut.segments.map((s) => s.end - s.start)).not.toEqual(p.cut.segments.map((s) => s.end - s.start));
    const running = runAgent(p);
    expect(running.job).toBeDefined();
    expect(reshuffleCut(running)).toBe(running);
  });
});

describe('scenes and the brief', () => {
  const scened = (start = 0) => {
    const base = { ...songFromDemo(DEMO_TRACKS[0]), analyzed: true };
    const range = start > 0 ? { start, end: base.durationSec } : undefined;
    return settle(createProject({ song: withScenes(base, range), formats: ['16:9'], range }));
  };

  it('lays the video out in scenes by time, with no verse or hook', () => {
    const song = { ...songFromDemo(DEMO_TRACKS[0]), analyzed: true };
    const scenes = scenesFor(song).filter((s) => s.scene);
    expect(scenes[0].start).toBe(0);
    expect(scenes.at(-1)!.end).toBeCloseTo(song.durationSec, 2);
    for (const s of scenes) expect(s.end - s.start).toBeGreaterThan(SCENE_SEC * 0.5);
    for (const s of scenes) expect(s.end - s.start).toBeLessThan(SCENE_SEC * 1.6);
    const fromHalf = scenesFor(song, { start: 40, end: song.durationSec });
    expect(fromHalf[0]).toMatchObject({ id: 'before', start: 0, end: 40 });
    expect(fromHalf[1].start).toBe(40);
  });

  it('starts from the artist\'s start point and picks a snippet length itself', () => {
    let p = scened(40);
    expect(videoRange(p).start).toBe(40);
    expect(videoLength(p)).toBe('full');
    p = setVideoLength(p, 'snippet');
    const r = videoRange(p);
    expect(r.start).toBe(40);
    expect(Math.abs(r.end - r.start - SNIPPET_SEC)).toBeLessThan(barSec(p.song!.bpm));
    expect(videoLength(p)).toBe('snippet');
    // New scenes cover just the snippet, each with a look.
    const inside = p.song!.sections.filter((s) => s.scene);
    expect(inside[0].start).toBe(40);
    expect(inside.at(-1)!.end).toBeCloseTo(r.end, 3);
    for (const s of p.song!.sections) expect(p.looks[s.id]).toBeDefined();
    expect(setVideoLength(p, 'full').range).toEqual({ start: 40, end: p.song!.durationSec });
  });

  it('turns a description into looks in the order described, cutaways and an effects pack', () => {
    let p = scened();
    const scenes = p.song!.sections.filter((s) => s.scene);
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    p = planFromBrief(p, 'Rainy alley at night with neon. Then on the beach at sunset. A Lambo pulls up. Keep it dark and grimy');
    expect(p.brief).toContain('Rainy alley');
    expect(p.looks[scenes[0].id].location).toBe('alley');
    expect(p.looks[scenes.at(-1)!.id].location).toBe('beach');
    expect(p.looks[scenes[0].id].prompt).toContain('Rainy alley at night with neon');
    expect(p.broll.ideas.some((i) => /lambo/i.test(i.shot))).toBe(true);
    expect(p.fx.pack).toBe('dark');
    expect(p.messages.at(-1)?.text).toMatch(/^Got it\. \d+ scenes, moving from alley to beach/);
    expect(approvePlan(p).planApproved).toBe(true);
  });

  it('builds a custom world when the description names no preset place', () => {
    let p = scened();
    p = planFromBrief(p, 'On a rooftop over the city at sunrise');
    for (const s of p.song!.sections.filter((x) => x.scene)) {
      expect(p.looks[s.id].location).toBe('custom');
      expect(p.looks[s.id].prompt).toContain('On a rooftop over the city at sunrise');
    }
    const vague = planFromBrief(scened(), 'make it look expensive');
    const first = vague.song!.sections.find((s) => s.scene)!;
    expect(vague.looks[first.id]).toMatchObject({ location: 'custom' });
    expect(vague.looks[first.id].prompt).toContain('Make it look expensive');
  });

  it('locks the plan in one step: length, description, then locked before any take', () => {
    const p = lockPlan(scened(), { brief: 'Rainy alley at night. Then the beach. Lambo pulls up', length: 'snippet' });
    expect(p.planApproved).toBe(true);
    expect(p.length).toBe('snippet');
    expect(videoRange(p).start).toBe(0);
    expect(p.messages.some((m) => m.from === 'user' && m.text.startsWith('Rainy alley'))).toBe(true);
    expect(p.messages.some((m) => /^Got it\./.test(m.text))).toBe(true);
    expect(currentStage(p)?.id).toBe('shoot');
    // Nothing described: the director's own pitch stands and the plan still locks.
    const quiet = lockPlan(scened(), { brief: '  ', length: 'full' });
    expect(quiet.planApproved).toBe(true);
    expect(quiet.brief).toBeUndefined();
  });

  it('places the video where the first take starts, keeping the plan in order', () => {
    let p = lockPlan(scened(), { brief: 'Rainy alley at night. Then the beach. Lambo pulls up', length: 'snippet' });
    const planned = p.song!.sections.filter((s) => s.scene).map((s) => p.looks[s.id].location);
    p = addTake(p, { source: 'record', fromSec: 42, durationSec: 40 });
    const r = videoRange(p);
    expect(r.start).toBe(42);
    expect(Math.abs(r.end - r.start - SNIPPET_SEC)).toBeLessThan(barSec(p.song!.bpm));
    expect(p.song!.sections[0]).toMatchObject({ id: 'before', end: 42 });
    const scenes = p.song!.sections.filter((s) => s.scene);
    expect(scenes[0].start).toBe(42);
    expect(scenes.map((s) => p.looks[s.id].location)).toEqual(planned);
    for (const s of p.song!.sections) expect(p.looks[s.id]).toBeDefined();
    for (const idea of p.broll.ideas) if (idea.at !== undefined) expect(idea.at).toBeGreaterThanOrEqual(42);
    expect(p.messages.some((m) => m.text.startsWith('The video starts at 0:42 and runs'))).toBe(true);
    expect(p.planApproved).toBe(true);
    // Later takes land inside the video and don't move it.
    const again = addTake(p, { source: 'record', fromSec: 80, durationSec: 10 });
    expect(videoRange(again)).toEqual(r);
    // Clearing every take lets the artist start somewhere else.
    const cleared = removeTake(p, p.takes[0].id);
    expect(videoRange(addTake(cleared, { source: 'record', fromSec: 10, durationSec: 30 })).start).toBe(10);
  });

  it('runs a full video from the first take to the end of the song', () => {
    const top = addTake(lockPlan(scened(), { brief: '', length: 'full' }), { source: 'record', fromSec: 0, durationSec: 30 });
    expect(top.range).toBeUndefined();
    expect(top.messages.some((m) => m.text.startsWith('The video'))).toBe(false);
    const late = addTake(lockPlan(scened(), { brief: '', length: 'full' }), { source: 'upload', fromSec: 60, durationSec: 30 });
    expect(late.range).toEqual({ start: 60, end: late.song!.durationSec });
    expect(late.messages.some((m) => m.text === 'The video starts at 1:00 and runs to the end of the song.')).toBe(true);
  });

  it('suggests a snippet for vertical-only videos and the full song otherwise', () => {
    expect(suggestedLength(scened())).toBe('full');
    const vertical = settle(createProject({ song: withScenes({ ...mud(), analyzed: true }), formats: ['9:16'] }));
    expect(suggestedLength(vertical)).toBe('snippet');
  });

  it('lets Claude plan a scene in its own words', () => {
    const p = scened();
    const res = applyCommand(p, { type: 'setLook', section: 'Scene 2', location: 'custom', prompt: 'A rooftop at dawn, wind in the flags.' });
    expect(res.ok).toBe(true);
    expect(res.project.looks['scene-2']).toMatchObject({ location: 'custom', prompt: 'A rooftop at dawn, wind in the flags.' });
    const preset = applyCommand(p, { type: 'setLook', section: 'Scene 1', location: 'beach', prompt: 'Beach at noon, harsh sun.' }).project;
    expect(preset.looks['scene-1']).toMatchObject({ location: 'beach', prompt: 'Beach at noon, harsh sun.' });
    expect(summarize(p)).toMatchObject({ video: { length: 'full', from: 0 } });
  });

  it('gives scenes rotating looks and still lands effects in Clean', () => {
    const p = scened();
    const ids = p.song!.sections.filter((s) => s.scene).map((s) => p.looks[s.id].location);
    expect(new Set(ids).size).toBeGreaterThan(1);
    const cues = buildCues(p.song!, planForPack('drill', 'Clean'));
    expect(cues.filter((c) => c.fx === 'shake').length).toBeGreaterThan(10);
  });
});

describe('snippets', () => {
  it('rounds a snippet to whole bars and keeps it inside the song', () => {
    const song = mud();
    const bar = barSec(song.bpm);
    const r = snippetRange(song, song.sections[2].start, 15);
    expect(r.start).toBe(song.sections[2].start);
    expect(offGrid((r.end - r.start) / bar)).toBeCloseTo(0, 2);
    expect(Math.abs(r.end - r.start - 15)).toBeLessThan(bar);
    const late = snippetRange(song, song.durationSec - 2, 30);
    expect(late.end).toBeCloseTo(song.durationSec, 3);
    expect(late.end - late.start).toBeGreaterThan(25);
  });

  it('cuts, covers and pitches b-roll only inside the snippet', () => {
    let p = fresh();
    const hook = p.song!.sections.find((s) => s.kind === 'hook')!;
    p = setRange(p, snippetRange(p.song!, hook.start, 30));
    const r = videoRange(p);
    expect(p.broll.ideas.every((i) => i.at === undefined || (i.at >= r.start && i.at + i.durationSec <= r.end + 0.01))).toBe(true);
    p = approvePlan(p);
    expect(setRange(p, undefined)).toBe(p);
    p = addTake(p, { source: 'record', fromSec: 0, durationSec: p.song!.durationSec });
    expect(coverage(p)).toBe(1);
    p = lockCut(settle(finishShooting(setAutonomy(p, 'ask'))));
    expect(p.cut.segments[0].start).toBeCloseTo(r.start, 3);
    expect(p.cut.segments.at(-1)!.end).toBeCloseTo(r.end, 3);
    for (const s of p.cut.segments) expect(s.start >= r.start - 0.001 && s.end <= r.end + 0.001).toBe(true);
  });
});

describe('plan', () => {
  it('pitches looks, b-roll and effects before the shoot, then waits for the artist', () => {
    const p = fresh();
    expect(currentStage(p)?.id).toBe('looks');
    expect(stageStatus(p, 'looks')).toBe('current');
    expect(p.takes).toHaveLength(0);
    expect(Object.keys(p.looks)).toHaveLength(p.song!.sections.length);
    expect(p.broll.ideas.length).toBe(3);
    expect(p.fx.pack).toBe('drill');
    expect(p.messages.at(-1)?.attachment).toBe('plan');
    expect(nextActions(p).primary).toEqual({ label: 'Lock the plan', run: 'approvePlan' });
    expect(agentAct(p)).toBeNull();
  });

  it('re-pitches the plan when the song gets new parts', () => {
    const p = approvePlan(fresh());
    const song = { ...p.song!, sections: [{ id: 'part-a', kind: 'verse' as const, label: 'Verse 1', start: 0, end: p.song!.durationSec }] };
    const next = updateSong(p, { song, formats: p.formats });
    expect(Object.keys(next.looks)).toEqual(['part-a']);
    expect(next.planApproved).toBe(false);
    expect(currentStage(next)?.id).toBe('looks');
  });

  it('places b-roll off the hooks, on the bar grid', () => {
    const p = planned();
    const bar = barSec(p.song!.bpm);
    for (const idea of p.broll.ideas.filter((i) => i.keep)) {
      const section = p.song!.sections.find((s) => s.id === idea.sectionId)!;
      expect(section.kind).not.toBe('hook');
      expect(offGrid(idea.at! / bar)).toBeCloseTo(0, 2);
      expect(idea.durationSec).toBeGreaterThanOrEqual(3);
    }
  });

  it('lets the artist change looks until the plan runs', () => {
    const p = planned();
    const hook = p.song!.sections.find((s) => s.kind === 'hook')!;
    const changed = setLook(p, hook.id, 'beach');
    expect(changed.looks[hook.id].location).toBe('beach');
    expect(changed.looks[hook.id].prompt).toMatch(/beach/i);
    const done = settleAuto(approvePlan(changed));
    expect(setLook(done, hook.id, 'alley')).toBe(done);
  });
});

describe('switch', () => {
  it('keeps every shot inside what SwitchX 3.0 takes in one generation', () => {
    const p = planned();
    const shots = buildShots(p);
    expect(shots.length).toBeGreaterThan(0);
    for (const s of shots) {
      expect(s.frames).toBeLessThanOrEqual(SWITCHX.maxFrames);
      expect(s.end - s.start).toBeLessThanOrEqual(15.001);
      expect(s.frames).toBe(Math.ceil((s.end - s.start) * s.fps - 1e-6));
    }
  });

  it('gives 30 fps footage shorter shots, and a tighter server limit even shorter ones', () => {
    let p = fresh({ song: songFromDemo(DEMO_TRACKS[1]) });
    p = addTake(p, { source: 'upload', fromSec: 0, durationSec: 500, fps: 30 });
    p = settleAuto(finishShooting(p));
    for (const s of buildShots(p)) {
      expect(s.frames).toBeLessThanOrEqual(360);
      expect(s.end - s.start).toBeLessThanOrEqual(12.001);
    }
    for (const s of buildShots(p, 240)) expect(s.frames).toBeLessThanOrEqual(240);
  });

  it('adds handles and never crosses a section with a different look', () => {
    const p = planned();
    const shots = buildShots(p);
    const first = shots.find((s) => s.n === 2)!;
    const segs = p.cut.segments.filter((x) => x.takeId === first.takeId && x.sectionId === first.sectionId);
    expect(segs.some((x) => Math.abs(x.start - HANDLE_SEC - first.start) < 0.002)).toBe(true);
    for (const s of shots) {
      const section = p.song!.sections.find((x) => x.id === s.sectionId)!;
      expect(s.start).toBeGreaterThanOrEqual(section.start - HANDLE_SEC - 0.002);
      expect(s.end).toBeLessThanOrEqual(section.end + HANDLE_SEC + 0.002);
    }
  });

  it('builds reference frames, then renders five at a time', () => {
    let p = runAgent(planned());
    expect(p.job?.stage).toBe('looks');
    expect(stageStatus(p, 'switch')).toBe('working');
    for (let i = 0; i < 100 && p.job?.stage === 'looks'; i++) p = advance(p, 250);
    expect(p.plates).toBe('approved');
    expect(p.job?.stage).toBe('switch');
    let peak = 0;
    for (let i = 0; i < 400 && p.job; i++) {
      p = advance(p, 100);
      peak = Math.max(peak, p.shots.filter((s) => s.status === 'rendering').length);
    }
    expect(peak).toBe(SWITCHX.concurrency);
  });

  it('stops for flagged shots and keeps going once they are approved', () => {
    const p = settleAuto(approvePlan(planned()));
    expect(currentStage(p)?.id).toBe('switch');
    expect(stageStatus(p, 'switch')).toBe('needs_you');
    const flagged = p.shots.filter((s) => s.flag);
    expect(flagged).toHaveLength(2);
    expect(p.shots.filter((s) => s.status === 'approved')).toHaveLength(p.shots.length - 2);
    expect(nextActions(p).primary?.label).toBe('Review 2 shots');
    const moved = settleAuto(approveAllShots(p));
    expect(currentStage(moved)?.id).toBe('edit');
  });

  it('redoes a shot without flagging it again', () => {
    const p = settleAuto(approvePlan(planned()));
    const flagged = p.shots.find((s) => s.flag)!;
    const redone = settle(redoShot(p, flagged.id));
    const again = redone.shots.find((s) => s.id === flagged.id)!;
    expect(again.status).toBe('ready');
    expect(again.flag).toBeUndefined();
    expect(redone.messages.at(-1)?.text).toMatch(/Redo is back/);
  });
});

describe('autopilot', () => {
  it('runs from the plan to the finished edit, stopping only where it needs the artist', () => {
    let p = planned();
    p = settleAuto(approvePlan(p));
    expect(currentStage(p)?.id).toBe('switch');
    p = settleAuto(approveAllShots(p));
    expect(currentStage(p)?.id).toBe('edit');
    expect(stageStatus(p, 'edit')).toBe('needs_you');
    expect(stageStatus(p, 'broll')).toBe('done');
    expect(p.broll.ideas.every((i) => i.status === 'approved')).toBe(true);
    expect(p.final.builds).toBe(1);
    p = lockEdit(p);
    expect(currentStage(p)?.id).toBe('export');
    p = settle(exportVideo(p));
    expect(trackerView(p).wrapped).toBe(true);
    expect(p.messages.at(-1)?.attachment).toBe('wrap');
  });

  it('skips b-roll when the artist takes it out of the plan', () => {
    let p = planned();
    p = respond(p, 'no b-roll');
    expect(p.broll.ideas.every((i) => !i.keep)).toBe(true);
    p = settleAuto(approveAllShots(settleAuto(approvePlan(p))));
    expect(stageStatus(p, 'broll')).toBe('skipped');
    expect(currentStage(p)?.id).toBe('edit');
  });

  it('asks before every step when autopilot is off', () => {
    let p = setAutonomy(approvePlan(fresh()), 'ask');
    p = settleAuto(finishShooting(shot(p)));
    expect(currentStage(p)?.id).toBe('cut');
    expect(stageStatus(p, 'cut')).toBe('needs_you');
    expect(agentAct(p)).toBeNull();
    expect(nextActions(p).primary).toEqual({ label: 'Review the cut', open: 'cut' });
  });
});

describe('talking to the director', () => {
  it('moves a section to a new look', () => {
    const p = planned();
    const cmds = parseCommands('put the hook on the beach', p);
    expect(cmds).toEqual([{ type: 'setLook', section: 'hook', location: 'beach' }]);
    const next = respond(p, 'put the hook on the beach');
    const hooks = next.song!.sections.filter((s) => s.kind === 'hook');
    expect(hooks.every((s) => next.looks[s.id].location === 'beach')).toBe(true);
    expect(next.messages.at(-1)?.text).toBe('Beach for the hooks.');
  });

  it('changes effects by name and by feel', () => {
    const p = planned();
    expect(parseCommands('no shake', p)).toEqual([{ type: 'toggleEffect', effect: 'shake', on: false }]);
    expect(parseCommands('more effects', p)).toEqual([{ type: 'setFxIntensity', intensity: 'Unhinged' }]);
    expect(parseCommands('switch to the boom bap pack', p)).toEqual([{ type: 'setFxPack', pack: 'boomBap' }]);
    const next = respond(p, 'no shake');
    expect(next.fx.effects.shake).toBe(false);
  });

  it('redoes a shot by number and says so when it cannot', () => {
    const waiting = planned();
    expect(applyCommand(waiting, { type: 'redoShot', n: 3 }).ok).toBe(false);
    const back = settleAuto(approvePlan(waiting));
    const res = applyCommand(back, parseCommands('redo shot 3', back)[0]);
    expect(res.ok).toBe(true);
    expect(res.project.shots.find((s) => s.n === 3)?.status).toBe('queued');
  });

  it('runs the plan on a go-ahead', () => {
    const p = respond(planned(), 'bet, run it');
    expect(p.planApproved).toBe(true);
  });

  it('files ideas to the stage that uses them', () => {
    expect(routeIdea('Put a Lambo pulling up in the rain')).toBe('broll');
    expect(routeIdea('swap my chain for a bigger one')).toBe('switch');
    expect(routeIdea('more glitch on the drop')).toBe('edit');
    expect(routeIdea('what time is it')).toBeNull();
    const p = respond(planned(), 'Put a Lambo pulling up in the rain during the hook');
    expect(p.broll.ideas.at(-1)?.shot).toMatch(/Lambo/);
    expect(p.ideas).toHaveLength(1);
  });
});

describe('going back', () => {
  it('reopens looks and clears everything built on them', () => {
    let p = settleAuto(approveAllShots(settleAuto(approvePlan(planned()))));
    const takes = p.takes.length;
    p = revisit(p, 'looks');
    expect(currentStage(p)?.id).toBe('looks');
    expect(p.planApproved).toBe(false);
    expect(p.plates).toBe('none');
    expect(p.shots).toHaveLength(0);
    expect(p.final.builds).toBe(0);
    expect(p.cut.locked).toBe(false);
    expect(p.shootLocked).toBe(false);
    expect(p.takes).toHaveLength(takes);
  });

  it('cuts again right away when the artist reopens the cut', () => {
    const p = revisit(settleAuto(approvePlan(planned())), 'cut');
    expect(p.job?.stage).toBe('cut');
    expect(settleAuto(p).cut.segments.length).toBeGreaterThan(0);
  });
});

describe('effects', () => {
  it('puts every cue on the song and only for effects that are on', () => {
    const song = mud();
    const fx = planForPack('trapHype', 'Hype');
    const cues = buildCues(song, fx);
    expect(cues.length).toBeGreaterThan(50);
    for (let i = 1; i < cues.length; i++) expect(cues[i].t).toBeGreaterThanOrEqual(cues[i - 1].t);
    for (const c of cues) {
      expect(c.t).toBeGreaterThanOrEqual(0);
      expect(c.t).toBeLessThan(song.durationSec);
      expect(fx.effects[c.fx]).toBe(true);
      expect(c.amount).toBeGreaterThan(0);
      expect(c.amount).toBeLessThanOrEqual(1);
    }
  });

  it('keeps Clean to the hooks and section changes', () => {
    const song = mud();
    const cues = buildCues(song, planForPack('trapHype', 'Clean'));
    const verse = song.sections.find((s) => s.kind === 'verse')!;
    const inVerse = cues.filter((c) => c.t > verse.start + 0.5 && c.t < verse.end - 1 && c.fx === 'punchIn');
    expect(inVerse).toHaveLength(0);
    const hook = song.sections.find((s) => s.kind === 'hook')!;
    expect(cues.some((c) => c.fx === 'punchIn' && c.t >= hook.start && c.t < hook.end)).toBe(true);
    expect(buildCues(song, planForPack('trapHype', 'Unhinged')).length).toBeGreaterThan(buildCues(song, planForPack('trapHype', 'Hype')).length);
  });

  it('hits snares on beat 3 in half-time songs', () => {
    const song = mud();
    const beat = 60 / song.bpm;
    const hook = song.sections.find((s) => s.kind === 'hook')!;
    const punches = buildCues(song, planForPack('trapHype', 'Hype')).filter((c) => c.fx === 'punchIn' && c.t >= hook.start && c.t < hook.end);
    for (const c of punches) expect(Math.round((c.t - hook.start) / beat) % 4).toBe(2);
  });
});

describe('money', () => {
  it('prices the render in Beeble credits', () => {
    const p = planned();
    const b = estimateBudget(p);
    // Seconds under planned b-roll never go to the switch.
    const cutFrames = p.cut.segments.filter((s) => s.takeId).reduce((sum, s) => sum + (s.end - s.start) * 24, 0);
    expect(b.switchFrames).toBeGreaterThan(1500);
    expect(b.switchFrames).toBeLessThan(cutFrames);
    expect(b.switchCredits).toBeGreaterThanOrEqual(Math.ceil(b.switchFrames / 30) * 6);
    expect(b.referenceCredits).toBe(4 * 5);
    expect(b.brollCredits).toBeGreaterThan(0);
    expect(b.totalCredits).toBe(b.switchCredits + b.referenceCredits + b.brollCredits);
  });

  it('charges one credit per video and one more for 4K', () => {
    const p = lockEdit(settleAuto(approveAllShots(settleAuto(approvePlan(planned())))));
    expect(exportCost(p)).toBe(1);
    const k = setResolution(p, '4K');
    expect(exportCost(k)).toBe(2);
    expect(exportCost(k, true)).toBe(1);
  });
});

describe('short takes', () => {
  it('never cuts a sliver when two takes stop a moment apart', () => {
    let p = settle(createProject({ song: songFromDemo(DEMO_TRACKS[1]), vibe: 'Melodic', formats: ['16:9'] }));
    const take = (end: number) => ({ source: 'record' as const, fromSec: 0, durationSec: end, fps: 20, mediaId: `m-${end}` });
    p = addTake(p, take(8.2));
    p = addTake(p, take(8.45));
    p = settle(finishShooting(setAutonomy(p, 'ask')));
    const covered = p.cut.segments.filter((s) => s.takeId);
    expect(covered.length).toBeGreaterThan(0);
    for (const s of covered) expect(s.end - s.start).toBeGreaterThanOrEqual(MIN_SHOT_SEC);
    // Everything after the takes run out is one gap per section, not a string of fragments.
    expect(p.cut.segments.filter((s) => !s.takeId).length).toBeLessThanOrEqual(p.song!.sections.length);
  });
});

describe('live jobs', () => {
  it('leaves an external job alone until the runner reports back', () => {
    let p: Project = { ...approvePlan(setAutonomy(planned(), 'ask')), plates: 'approved' };
    p = startSwitch(p, { external: true });
    expect(p.job?.external).toBe(true);
    expect(advance(p, 5000)).toBe(p);
    p = setJobProgress(p, 0.5, 'Uploading shot 1');
    expect(p.job?.progress).toBe(0.5);
    for (const s of p.shots) p = updateShot(p, s.id, { status: 'ready', progress: 1, renderUrl: `https://cdn.example/${s.id}.mp4` });
    p = switchProgress(p);
    expect(p.job).toBeUndefined();
    expect(p.shots.every((s) => s.renderUrl)).toBe(true);
    expect(stageStatus(p, 'switch')).toBe('needs_you');
  });

  it('marks in-flight shots failed when the provider goes down', () => {
    let p = approvePlan(setAutonomy(planned(), 'ask'));
    p = startSwitch({ ...p, plates: 'approved' }, { external: true });
    p = failJob(p, 'Beeble balance is too low.');
    expect(p.job).toBeUndefined();
    expect(p.shots.every((s) => s.status === 'failed')).toBe(true);
    expect(p.messages.at(-1)?.text).toMatch(/balance is too low/);
  });

  const caps = { model: 'switchx', maxFrames: 240, maxRefs: 1, resolutions: [720, 1080], broll: ['h3' as const], references: false, director: true };

  it('adopts the server limits when a project goes live, and cuts shorter shots for the public SwitchX', () => {
    let p = connectLive(setSwitchSettings(planned(), { resolution: 2160 }), caps);
    expect(p.pipeline).toBe('live');
    expect(p.switchSettings).toMatchObject({ model: 'switchx', maxFrames: 240, maxRefs: 1, resolution: 1080 });
    expect(p.messages.at(-1)?.text).toMatch(/Live: the switch runs on SwitchX, up to 10 seconds a shot/);
    expect(connectLive(p, caps)).toBe(p);
    p = runAgent(approvePlan(p));
    // No reference generator on the server: the looks step passes straight through, and the switch is a live job.
    expect(p.plates).toBe('approved');
    expect(p.job).toMatchObject({ stage: 'switch', external: true });
    expect(p.shots.length).toBeGreaterThan(0);
    for (const s of p.shots) expect(s.frames).toBeLessThanOrEqual(240);
  });

  it('keeps samples and already-switched projects in demo mode', () => {
    const sample = buildSampleProjects()[0];
    expect(connectLive(sample, caps)).toBe(sample);
    const switched = settleAuto(approvePlan(planned()));
    expect(switched.shots.length).toBeGreaterThan(0);
    expect(connectLive(switched, caps)).toBe(switched);
  });

  it('skips b-roll with a note when the server has no b-roll provider', () => {
    let p = connectLive(planned(), { ...caps, broll: [] });
    p = { ...approvePlan(p), plates: 'approved' as const };
    p = startSwitch(p);
    for (const s of p.shots) p = updateShot(p, s.id, { status: 'ready', progress: 1 });
    p = runAgent(switchProgress(p));
    expect(p.skipped).toContain('broll');
    expect(p.messages.some((m) => /B-roll isn't set up/.test(m.text))).toBe(true);
    // The seconds saved for b-roll go back through the switch, then the edit.
    expect(p.job?.stage).toBe('switch');
    expect(p.shots.some((s) => s.fill)).toBe(true);
    for (const s of p.shots.filter((x) => x.fill)) p = updateShot(p, s.id, { status: 'ready', progress: 1 });
    p = runAgent(switchProgress(p));
    expect(currentStage(p)?.id).toBe('edit');
  });

  it('picks a live switch back up after a reload', () => {
    let p = connectLive(planned(), caps);
    p = startSwitch({ ...approvePlan(p), plates: 'approved' as const });
    const reloaded: Project = { ...p, job: undefined };
    const resumed = resumeSwitch(reloaded);
    expect(resumed.job).toMatchObject({ stage: 'switch', external: true });
    expect(resumeSwitch(resumed)).toBe(resumed);
    expect(resumeSwitch(planned())).toEqual(expect.objectContaining({ job: undefined }));
  });

  it('gives the director a compact, accurate picture of the project', () => {
    const p = settleAuto(approvePlan(planned()));
    const s = summarize(p) as { stage: { id: string }; switch: { shots: number; approved: number }; song: { sections: unknown[] }; takes: unknown[] };
    expect(s.stage.id).toBe(currentStage(p)?.id);
    expect(s.switch.shots).toBe(p.shots.length);
    expect(s.song.sections).toHaveLength(p.song!.sections.length);
    expect(s.takes).toHaveLength(p.takes.length);
    expect(JSON.stringify(s).length).toBeLessThan(6000);
    expect(recentChat(p, 4)).toHaveLength(4);
    expect(recentChat(p).every((m) => m.from === 'user' || m.from === 'director')).toBe(true);
  });

  it('finishes an external job the same way the simulation would', () => {
    let p = lockEdit(settleAuto(approveAllShots(settleAuto(approvePlan(planned())))));
    p = exportVideo(p, 1, { external: true });
    p = finishJob(setJobProgress(p, 0.99));
    expect(p.exportState.done).toBe(true);
  });
});

describe('samples', () => {
  it('builds one project mid-switch, one shooting and one wrapped', () => {
    const [mudProject, late, windy] = buildSampleProjects();
    expect(mudProject.job?.stage).toBe('switch');
    expect(mudProject.shots.some((s) => s.status === 'rendering')).toBe(true);
    expect(mudProject.ideas).toHaveLength(1);
    expect(currentStage(late)?.id).toBe('shoot');
    expect(late.takes).toHaveLength(1);
    expect(trackerView(windy).wrapped).toBe(true);
    expect(new Set([mudProject.id, late.id, windy.id]).size).toBe(3);
    for (const p of [mudProject, late, windy]) expect(p.isSample).toBe(true);
  });
});

describe('buildCut on its own', () => {
  it('returns nothing without takes', () => {
    expect(buildCut(fresh())).toEqual([]);
  });
});
