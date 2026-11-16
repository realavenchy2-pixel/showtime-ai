import { describe, expect, it } from 'vitest';

import { buildComposition } from '@/media/composition';

import {
  addBrollIdea,
  addClip,
  addTake,
  approveAllShots,
  approveBroll,
  createProject,
  finishShooting,
  generateBroll,
  lockCut,
  setAutonomy,
  settle,
  startSwitch,
  toggleBrollKeep,
  videoRange,
} from '../actions';
import { settleAuto } from '../agent';
import { lockPlan } from '../brief';
import { BROLL_SHARE, brollPrompt, buildShots, cutawaySec, cutawayWindows, missingShots, performancePieces, skippedSeconds, uncovered } from '../broll';
import { currentStage } from '../stages';
import { barSec, DEMO_TRACKS, songFromDemo, withScenes } from '../samples';
import type { Project } from '../types';

// The hardest part of the pipeline: b-roll is generated after the switch, but where it lands
// decides what the switch renders. These tests walk that handoff.

const BRIEF = 'Rainy alley with neon at night. Then a rooftop at sunset. A Lambo pulls up and a money counter. Dark and grimy';

function snippet(brief = BRIEF): Project {
  const song = withScenes({ ...songFromDemo(DEMO_TRACKS[0]), analyzed: true });
  const p = settle(createProject({ song, formats: ['16:9'] }));
  return setAutonomy(lockPlan(p, { brief, length: 'snippet' }), 'ask');
}

/** Two takes from 0:16: a full pass and a partial one, then the cut, ready to lock. */
function cut(p = snippet(), second = 13): Project {
  let next = addTake(p, { source: 'record', fromSec: 16, durationSec: 40 });
  const r = videoRange(next);
  next = addTake(next, { source: 'record', fromSec: r.start, durationSec: second, angle: 'Close-up' });
  return settle(finishShooting(next));
}

const seconds = (xs: { start: number; end: number }[]) => xs.reduce((sum, x) => sum + (x.end - x.start), 0);

describe('b-roll for the switch', () => {
  it('takes the cutaways the artist described instead of the director’s stock ones', () => {
    const p = snippet();
    const shots = p.broll.ideas.map((i) => i.shot);
    expect(shots).toEqual(['A Lambo pulls up', 'A money counter']);
    expect(p.broll.ideas.every((i) => i.mine)).toBe(true);
  });

  it('spreads cutaways out: never back to back, never in the first bars, a minority of the video', () => {
    const p = cut();
    const r = videoRange(p);
    const bar = barSec(p.song!.bpm);
    const windows = cutawayWindows(p);
    expect(windows.length).toBeGreaterThan(0);
    expect(seconds(windows)).toBeLessThanOrEqual(BROLL_SHARE * (r.end - r.start) + 0.01);
    expect(windows[0].start).toBeGreaterThanOrEqual(r.start + 2 * bar - 0.01);
    for (let i = 1; i < windows.length; i++) expect(windows[i].start - windows[i - 1].end).toBeGreaterThanOrEqual(2 * bar - 0.02);
    // On cut points, so a cutaway replaces a shot rather than interrupting one mid-move.
    const cuts = p.cut.segments.map((s) => s.start);
    for (const w of windows) expect(cuts.some((c) => Math.abs(c - w.start) < 0.05)).toBe(true);
    // Each runs whole bars and at least three seconds.
    expect(cutawaySec(p.song!.bpm)).toBeGreaterThanOrEqual(3);
    for (const w of windows) expect(Math.abs(Math.round((w.end - w.start) / bar) - (w.end - w.start) / bar)).toBeLessThan(0.02);
  });

  it('never leaves a flash between two takes', () => {
    const p = cut();
    for (const s of p.cut.segments) expect(s.end - s.start).toBeGreaterThanOrEqual(0.99);
    expect(uncovered(p)).toEqual([]);
  });

  it('sends only what is on screen to the switch', () => {
    const p = lockCut(cut());
    const windows = cutawayWindows(p);
    const shots = buildShots(p);
    // No switched second sits under a cutaway (handles aside).
    for (const s of shots) {
      for (const w of windows) {
        const overlap = Math.min(s.end, w.end) - Math.max(s.start, w.start);
        expect(overlap).toBeLessThanOrEqual(0.26);
      }
    }
    const onScreen = seconds(performancePieces(p, windows));
    const all = seconds(performancePieces(p, []));
    expect(skippedSeconds(p)).toBeCloseTo(all - onScreen, 2);
    expect(skippedSeconds(p)).toBeGreaterThan(3);
    expect(p.messages.at(-1)?.text).toMatch(/seconds under b-roll are skipped/);
    expect(p.messages.at(-1)?.text).toContain(`goes through SwitchX in ${shots.length} shots`);
  });

  it('covers a stretch no take reaches with b-roll', () => {
    // One take that stops early, nothing after it.
    let p = snippet('Rainy alley at night');
    p = addTake(p, { source: 'record', fromSec: 16, durationSec: 20 });
    p = settle(finishShooting(p));
    const gaps = uncovered(p);
    expect(gaps.length).toBe(1);
    const windows = cutawayWindows(p);
    // Covered end to end, in cutaways of the usual length rather than one long clip.
    for (const g of gaps) {
      const over = windows.filter((w) => w.end > g.start + 0.01 && w.start < g.end - 0.01);
      expect(over[0].start).toBeLessThanOrEqual(g.start + 0.01);
      expect(over.at(-1)!.end).toBeGreaterThanOrEqual(g.end - 0.01);
      for (let i = 1; i < over.length; i++) expect(over[i].start).toBeCloseTo(over[i - 1].end, 2);
      for (const w of over) expect(w.end - w.start).toBeLessThan(1.5 * cutawaySec(p.song!.bpm) + 0.01);
    }
    // Different shots before any repeats.
    const shots = p.broll.ideas.filter((i) => i.keep).map((i) => i.shot);
    expect(new Set(shots.slice(0, 3)).size).toBe(Math.min(3, shots.length));
    const cover = p.broll.ideas.find((i) => i.cover);
    expect(cover?.keep).toBe(true);
    expect(cover!.at).toBe(gaps[0].start);
    // A cover can't be switched off: that would put a black hole in the video.
    expect(toggleBrollKeep(p, cover!.id)).toBe(p);
    // Record the missing stretch and nothing needs covering any more.
    const more = addTake({ ...p, shootLocked: false }, { source: 'record', fromSec: videoRange(p).start, durationSec: 40 });
    const fixed = settle(finishShooting({ ...more, cut: { ...more.cut, segments: [], locked: false } }));
    expect(uncovered(fixed)).toEqual([]);
    expect(fixed.broll.ideas.some((i) => i.cover)).toBe(false);
  });

  it('gives an idea the artist turns on a place, even if a director pitch has to give way', () => {
    let p = cut(snippet('Rainy alley at night'));
    const placed = p.broll.ideas.filter((i) => i.keep);
    const full = Math.floor((BROLL_SHARE * (videoRange(p).end - videoRange(p).start)) / cutawaySec(p.song!.bpm));
    expect(placed.length).toBe(full);
    p = addBrollIdea(p, 'Smoke rolling over the hood of a car');
    const mine = p.broll.ideas.find((i) => i.shot.startsWith('Smoke'))!;
    expect(mine.keep).toBe(true);
    expect(mine.at).toBeDefined();
    expect(p.broll.ideas.filter((i) => i.keep).length).toBe(full);
    // The pitch that gave way is waiting, not gone.
    expect(p.broll.ideas.some((i) => i.bumped && !i.keep)).toBe(true);
  });

  it('uses the artist’s own clips as cutaways, first, at no cost', () => {
    let p = cut(snippet('Rainy alley at night'));
    p = addClip(p, { label: 'Car pulling up.mov', durationSec: 6, fps: 30, width: 1920, height: 1080, mediaId: 'm1' });
    const idea = p.broll.ideas.find((i) => i.clipId)!;
    expect(idea.keep).toBe(true);
    expect(idea.at).toBeDefined();
    // Straight to "back" when b-roll starts: nothing to generate.
    p = lockCut(p);
    p = settleAuto(setAutonomy(p, 'auto'));
    const own = p.broll.ideas.find((i) => i.clipId)!;
    expect(['clip', 'approved']).toContain(own.status);
  });

  it('switches the seconds of a cutaway that was dropped after the switch, so the edit has no hole', () => {
    let p = lockCut(cut());
    p = settle(startSwitch(p));
    p = settle(approveAllShots(settle(p)));
    expect(currentStage(p)?.id).toBe('broll');
    p = settle(generateBroll(p));
    const dropped = p.broll.ideas.find((i) => i.keep)!;
    p = toggleBrollKeep(p, dropped.id);
    expect(missingShots(p).length).toBeGreaterThan(0);
    p = approveBroll(p);
    expect(p.job?.stage).toBe('switch');
    expect(p.shots.filter((s) => s.fill).length).toBeGreaterThan(0);
    p = settle(p);
    expect(currentStage(p)?.id).toBe('switch');
    p = approveAllShots(p);
    expect(currentStage(p)?.id).toBe('edit');
    expect(missingShots(p)).toEqual([]);
    // Every second of performance in the edit comes from a switched shot.
    const comp = buildComposition(p)!;
    const takes = comp.segments.filter((s) => s.kind === 'take' && s.end > comp.startSec && s.start < comp.durationSec);
    expect(takes.length).toBeGreaterThan(0);
    for (const s of takes) expect(s.switched).toBe(true);
    expect(comp.segments.filter((s) => s.kind === 'gap')).toEqual([]);
  });

  it('lays the edit out with cutaways where they were planned and nothing overlapping', () => {
    const p = settleAuto(setAutonomy(lockCut(cut()), 'auto'));
    expect(currentStage(p)?.id).toBe('edit');
    const comp = buildComposition(p)!;
    const shown = comp.segments.filter((s) => s.end > comp.startSec + 0.01 && s.start < comp.durationSec - 0.01);
    for (let i = 1; i < shown.length; i++) expect(shown[i].start).toBeCloseTo(shown[i - 1].end, 2);
    const broll = shown.filter((s) => s.kind === 'broll');
    expect(broll.map((s) => s.start)).toEqual(cutawayWindows(p, 'shown').map((w) => w.start));
    expect(shown[0].start).toBeCloseTo(comp.startSec, 2);
    expect(shown.at(-1)!.end).toBeCloseTo(comp.durationSec, 2);
  });

  it('asks for cutaways in the same world as the scene they cut away from', () => {
    const p = cut();
    const lambo = p.broll.ideas.find((i) => i.shot === 'A Lambo pulls up')!;
    expect(brollPrompt(p, lambo)).toMatch(/^A Lambo pulls up\. Light and color to match the scene it cuts away from: Night in a narrow city alley/);
  });
});
