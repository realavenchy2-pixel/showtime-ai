import { describe, expect, it } from 'vitest';

import {
  addIdea,
  advance,
  approveAllShots,
  approveBroll,
  approvePlates,
  approveShot,
  buildCut,
  createProject,
  ensureBroll,
  ensureSwaps,
  exportCost,
  exportVideo,
  finishRecording,
  generateBroll,
  keepSwaps,
  lockCut,
  lockFinal,
  lockFx,
  makePlates,
  MAX_SHOT_FRAMES,
  recordTake,
  redoShot,
  renderFinal,
  renderFormats,
  revisit,
  runSwaps,
  setFxPack,
  setLocation,
  setResolution,
  settle,
  skipStage,
  startSwitch,
  SWITCH_CONCURRENCY,
  swapSegmentTake,
} from '../actions';
import { directorReply, nextActions } from '../director';
import { routeIdea } from '../ideas';
import { DEFAULT_TAKE_PLAN, SAMPLE_TRACKS } from '../samples';
import { buildSampleProjects } from '../sampleProjects';
import { currentStage, stagesToRedo, stageStatus, trackerView } from '../stages';
import type { Project } from '../types';

function newProject(): Project {
  return createProject({ track: SAMPLE_TRACKS[0], vibe: 'Drill', formats: ['16:9', '9:16'] });
}

function recorded(): Project {
  let p = settle(newProject());
  for (const t of DEFAULT_TAKE_PLAN) p = recordTake(p, t.angle, t.scope);
  return p;
}

function atSwitch(): Project {
  let p = settle(finishRecording(recorded()));
  p = lockCut(p);
  p = settle(makePlates(p));
  return approvePlates(p);
}

describe('stage machine', () => {
  it('starts on the song with the analysis running', () => {
    const p = newProject();
    expect(currentStage(p)?.id).toBe('song');
    expect(stageStatus(p, 'song')).toBe('working');
    expect(stageStatus(p, 'record')).toBe('locked');
    expect(nextActions(p).primary).toBeNull();
  });

  it('moves to recording with a take plan once the song is mapped', () => {
    const p = settle(newProject());
    expect(stageStatus(p, 'song')).toBe('done');
    expect(currentStage(p)?.id).toBe('record');
    expect(p.takePlan).toHaveLength(4);
    expect(nextActions(p).primary?.label).toBe('Start recording');
    expect(p.messages.some((m) => m.attachment === 'takePlan')).toBe(true);
  });

  it('asks for review when results are back', () => {
    const p = settle(finishRecording(recorded()));
    expect(currentStage(p)?.id).toBe('roughcut');
    expect(stageStatus(p, 'roughcut')).toBe('needs_you');
    expect(nextActions(p).primary?.label).toBe('Review the cut');
  });

  it('runs a whole video to the wrap', () => {
    let p = atSwitch();
    p = approveAllShots(settle(startSwitch(p)));
    p = ensureSwaps(p);
    p = keepSwaps(settle(runSwaps(p)));
    p = ensureBroll(p);
    p = approveBroll(settle(generateBroll(p)));
    p = lockFx(setFxPack(p, 'drill'));
    p = lockFinal(settle(renderFinal(p)));
    p = settle(renderFormats(p));
    p = settle(exportVideo(p));
    const view = trackerView(p);
    expect(view.wrapped).toBe(true);
    expect(view.completed).toBe(11);
    expect(nextActions(p).primary?.label).toBe('Watch your video');
    expect(p.messages.at(-1)?.attachment).toBe('wrap');
  });

  it('lets optional stages be skipped and required ones not', () => {
    let p = approveAllShots(settle(startSwitch(atSwitch())));
    expect(currentStage(p)?.id).toBe('genjutsu');
    expect(skipStage(p, 'vfx')).toBe(p);
    p = skipStage(p, 'genjutsu');
    expect(stageStatus(p, 'genjutsu')).toBe('skipped');
    expect(currentStage(p)?.id).toBe('broll');
    p = skipStage(p, 'broll');
    expect(currentStage(p)?.id).toBe('vfx');
    expect(trackerView(p).completed).toBe(7);
  });

  it('lists the later stages a revisit will redo and resets them', () => {
    let p = approveAllShots(settle(startSwitch(atSwitch())));
    p = skipStage(p, 'genjutsu');
    const redo = stagesToRedo(p, 'location').map((s) => s.id);
    expect(redo).toEqual(['switch', 'genjutsu']);
    p = revisit(p, 'location');
    expect(currentStage(p)?.id).toBe('location');
    expect(p.shots).toHaveLength(0);
    expect(p.skipped).not.toContain('genjutsu');
    expect(stageStatus(p, 'roughcut')).toBe('done');
  });
});

describe('cut and shots', () => {
  it('covers the whole song with no gaps', () => {
    const p = settle(finishRecording(recorded()));
    const segs = p.cut.segments;
    expect(segs[0].start).toBe(0);
    expect(segs.at(-1)?.end).toBe(p.song!.durationSec);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeCloseTo(segs[i - 1].end, 2);
  });

  it('puts the low angle take on hooks', () => {
    const p = settle(finishRecording(recorded()));
    const low = p.takes.find((t) => t.angle === 'Low angle')!;
    const hookIds = new Set(p.song!.sections.filter((s) => s.kind === 'hook').map((s) => s.id));
    const hookSegs = p.cut.segments.filter((s) => hookIds.has(s.sectionId));
    expect(hookSegs.some((s) => s.takeId === low.id)).toBe(true);
    const verseSegs = p.cut.segments.filter((s) => !hookIds.has(s.sectionId));
    expect(verseSegs.every((s) => s.takeId !== low.id)).toBe(true);
  });

  it('keeps every switch job inside the 240-frame limit', () => {
    const p = startSwitch(atSwitch());
    expect(p.shots.length).toBe(p.cut.segments.length);
    expect(p.shots.length).toBeGreaterThan(20);
    for (const s of p.shots) expect(s.frames).toBeLessThanOrEqual(MAX_SHOT_FRAMES);
  });

  it('never renders more than 5 shots at once', () => {
    let p = startSwitch(atSwitch());
    let peak = 0;
    while (p.job) {
      p = advance(p, 100);
      peak = Math.max(peak, p.shots.filter((s) => s.status === 'rendering').length);
    }
    expect(peak).toBe(SWITCH_CONCURRENCY);
    expect(p.shots.every((s) => s.status === 'ready')).toBe(true);
    expect(p.shots.filter((s) => s.flag)).toHaveLength(2);
    expect(stageStatus(p, 'switch')).toBe('needs_you');
  });

  it('redoes one shot without flagging it again', () => {
    let p = settle(startSwitch(atSwitch()));
    const flagged = p.shots.find((s) => s.flag)!;
    for (const s of p.shots) if (s.id !== flagged.id) p = approveShot(p, s.id);
    p = redoShot(p, flagged.id);
    expect(stageStatus(p, 'switch')).toBe('working');
    p = settle(p);
    const after = p.shots.find((s) => s.id === flagged.id)!;
    expect(after.status).toBe('ready');
    expect(after.flag).toBeUndefined();
    p = approveShot(p, flagged.id);
    expect(stageStatus(p, 'switch')).toBe('done');
    expect(currentStage(p)?.id).toBe('genjutsu');
  });

  it('only swaps takes before the cut is locked', () => {
    const p = settle(finishRecording(recorded()));
    const seg = p.cut.segments[0];
    const other = p.takes.find((t) => t.id !== seg.takeId)!;
    const swapped = swapSegmentTake(p, seg.id, other.id);
    expect(swapped.cut.segments[0].takeId).toBe(other.id);
    const locked = lockCut(swapped);
    expect(swapSegmentTake(locked, seg.id, seg.takeId)).toBe(locked);
  });

  it('builds no cut without takes', () => {
    expect(buildCut(settle(newProject()))).toEqual([]);
  });
});

describe('locations', () => {
  it('suggests a look for every section when the cut locks', () => {
    const p = lockCut(settle(finishRecording(recorded())));
    const sections = p.song!.sections;
    expect(sections.every((s) => p.locations[s.id])).toBe(true);
    expect(p.locations[sections.find((s) => s.kind === 'hook')!.id]).toBe('hangingMic');
  });

  it('needs new plates after a location change', () => {
    let p = lockCut(settle(finishRecording(recorded())));
    p = settle(makePlates(p));
    expect(p.plates).toBe('ready');
    p = setLocation(p, p.song!.sections[0].id, 'beach');
    expect(p.plates).toBe('none');
    expect(approvePlates(p)).toBe(p);
  });
});

describe('export', () => {
  it('charges one credit for 1080p and two for 4K', () => {
    let p = atSwitch();
    expect(exportCost(p)).toBe(1);
    p = setResolution(p, '4K');
    expect(exportCost(p)).toBe(2);
  });
});

describe('idea inbox', () => {
  it.each([
    ['put a lambo pulling up in the hook', 'broll'],
    ['gold mic on the hook', 'genjutsu'],
    ['fire behind me on the drop', 'vfx'],
    ['shoot the outro on the beach', 'location'],
    ['one more take from a low angle', 'record'],
  ])('files "%s" under %s', (text, stage) => {
    expect(routeIdea(text)).toBe(stage);
  });

  it('ignores chat that is not an idea', () => {
    expect(routeIdea('yo what up')).toBeNull();
    expect(routeIdea('sounds good')).toBeNull();
  });

  it('adds b-roll ideas to the b-roll list', () => {
    let p = settle(newProject());
    p = addIdea(p, 'lambo in the rain', 'broll');
    expect(p.ideas).toHaveLength(1);
    expect(p.broll.ideas[0]).toMatchObject({ shot: 'lambo in the rain', fromInbox: true, keep: true });
  });

  it('answers skip requests by stage', () => {
    const p = settle(newProject());
    expect(directorReply(p, 'can we skip this').text).toContain("can't be skipped");
  });
});

describe('sample projects', () => {
  it('builds three samples in different states', () => {
    const [mud, late, windy] = buildSampleProjects();
    expect(stageStatus(mud, 'switch')).toBe('working');
    expect(mud.ideas[0]?.stage).toBe('broll');
    expect(currentStage(late)?.id).toBe('record');
    expect(late.takes).toHaveLength(1);
    expect(trackerView(windy).wrapped).toBe(true);
    for (const p of [mud, late, windy]) expect(p.isSample).toBe(true);
  });
});
