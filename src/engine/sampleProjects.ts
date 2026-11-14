import { addSampleTake, advance, approveAllShots, approvePlan, createProject, exportVideo, finishShooting, lockEdit, settle } from './actions';
import { respond, runAgent, settleAuto } from './agent';
import { DEFAULT_TAKE_PLAN, DEMO_TRACKS, songFromDemo } from './samples';
import type { Project } from './types';

// Three example projects so the first screen shows the app working: one mid-switch,
// one still shooting, one wrapped. They are marked as samples in the UI and have no footage.

function shootAll(p: Project): Project {
  let next = p;
  for (const t of DEFAULT_TAKE_PLAN) next = addSampleTake(next, t.angle, t.scope);
  return next;
}

export const SAMPLE_IDS = { mud: 'sample-out-the-mud', late: 'sample-late-night', windy: 'sample-windy-city' };

export function buildSampleProjects(now = Date.now()): Project[] {
  // Out the Mud: mid-switch, so the tracker shows a job running when the app first opens.
  let mud = settle(createProject({ song: songFromDemo(DEMO_TRACKS[0]), vibe: 'Drill', formats: ['16:9', '9:16'] }));
  mud = settleAuto(finishShooting(shootAll(mud)));
  mud = respond(mud, 'Put a Lambo pulling up in the rain during the hook');
  mud = runAgent(approvePlan(mud));
  mud = runAgent(settle(mud));
  for (let i = 0; i < 10; i++) mud = advance(mud, 250);
  mud = { ...mud, id: SAMPLE_IDS.mud, isSample: true, createdAt: now - 1000 * 60 * 40 };

  // Late Night Freestyle: one take in, still shooting.
  let late = settle(createProject({ song: songFromDemo(DEMO_TRACKS[1]), vibe: 'Melodic', formats: ['9:16'] }));
  late = addSampleTake(late, 'Wide', 'Full song');
  late = { ...late, id: SAMPLE_IDS.late, isSample: true, createdAt: now - 1000 * 60 * 60 * 26 };

  // Windy City: wrapped and exported.
  let windy = settle(createProject({ song: songFromDemo(DEMO_TRACKS[2]), vibe: 'Trap', formats: ['16:9'] }));
  windy = settleAuto(finishShooting(shootAll(windy)));
  windy = settleAuto(approvePlan(windy));
  windy = settleAuto(approveAllShots(windy));
  windy = lockEdit(windy);
  windy = settle(exportVideo(windy));
  windy = { ...windy, id: SAMPLE_IDS.windy, isSample: true, createdAt: now - 1000 * 60 * 60 * 24 * 6 };

  return [mud, late, windy];
}
