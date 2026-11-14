import { describe, expect, it } from 'vitest';

import {
  addSampleTake,
  addTake,
  advance,
  approveAllShots,
  approvePlan,
  buildCut,
  buildShots,
  coverage,
  createProject,
  exportCost,
  exportVideo,
  failJob,
  finishJob,
  finishShooting,
  lockEdit,
  redoShot,
  reshuffleCut,
  revisit,
  setAutonomy,
  setJobProgress,
  setLook,
  setResolution,
  settle,
  startSwitch,
  switchProgress,
  updateShot,
} from '../actions';
import { agentAct, applyCommand, estimateBudget, parseCommands, respond, runAgent, settleAuto } from '../agent';
import { nextActions } from '../director';
import { buildCues, planForPack } from '../fx';
import { routeIdea } from '../ideas';
import { buildSampleProjects } from '../sampleProjects';
import { barSec, DEFAULT_TAKE_PLAN, DEMO_TRACKS, demoDuration, songFromDemo } from '../samples';
import { currentStage, stageStatus, trackerView } from '../stages';
import { HANDLE_SEC, SWITCHX } from '../switchx';
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

/** A project stopped at the plan, the first place autopilot waits for the artist. */
function planned(): Project {
  return settleAuto(finishShooting(shot(fresh())));
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
    expect(currentStage(p)?.id).toBe('shoot');
    expect(nextActions(p).primary).toEqual({ label: 'Start recording', open: 'record' });
    expect(p.messages.at(-1)?.attachment).toBe('takePlan');
  });

  it('skips the mapping job for a track that arrives already analyzed', () => {
    const p = createProject({ song: { ...mud(), analyzed: true, source: 'import' }, vibe: 'Trap', formats: ['9:16'] });
    expect(p.job).toBeUndefined();
    expect(currentStage(p)?.id).toBe('shoot');
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
    expect(gaps[0].start).toBeCloseTo(30, 1);
    expect(p.cut.segments.filter((s) => s.takeId).every((s) => s.end <= 30.01)).toBe(true);
    expect(p.messages.some((m) => /no take on it/.test(m.text))).toBe(true);
  });

  it('shuffles into a different cut until the plan runs', () => {
    const p = planned();
    const shuffled = reshuffleCut(p);
    expect(shuffled.cut.seed).toBe(1);
    expect(shuffled.cut.segments.map((s) => s.end - s.start)).not.toEqual(p.cut.segments.map((s) => s.end - s.start));
    const running = approvePlan(p);
    expect(reshuffleCut(running)).toBe(running);
  });
});

describe('plan', () => {
  it('pitches looks, b-roll and effects, then waits for the artist', () => {
    const p = planned();
    expect(currentStage(p)?.id).toBe('looks');
    expect(stageStatus(p, 'looks')).toBe('needs_you');
    expect(p.cut.locked).toBe(true);
    expect(Object.keys(p.looks)).toHaveLength(p.song!.sections.length);
    expect(p.broll.ideas.length).toBe(3);
    expect(p.fx.pack).toBe('drill');
    expect(p.messages.at(-1)?.attachment).toBe('plan');
    expect(nextActions(p).primary).toEqual({ label: 'Run it', run: 'approvePlan' });
    expect(agentAct(p)).toBeNull();
  });

  it('places b-roll inside verses and the outro, on the bar grid', () => {
    const p = planned();
    const bar = barSec(p.song!.bpm);
    for (const idea of p.broll.ideas) {
      const section = p.song!.sections.find((s) => s.id === idea.sectionId)!;
      expect(section.kind === 'verse' || section.kind === 'outro').toBe(true);
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

  it('renders five at a time', () => {
    let p = runAgent(settle(runAgent(approvePlan(planned()))));
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
    let p = setAutonomy(fresh(), 'ask');
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
    p = revisit(p, 'looks');
    expect(currentStage(p)?.id).toBe('looks');
    expect(p.planApproved).toBe(false);
    expect(p.plates).toBe('none');
    expect(p.shots).toHaveLength(0);
    expect(p.final.builds).toBe(0);
    expect(p.cut.locked).toBe(true);
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
    expect(b.switchFrames).toBeGreaterThan(1900);
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
