import {
  addIdea,
  addUserMessage,
  addDirectorMessage,
  advance,
  approveAllShots,
  approveBroll,
  approvePlates,
  createProject,
  ensureBroll,
  ensureSwaps,
  exportVideo,
  finishRecording,
  generateBroll,
  keepSwaps,
  lockCut,
  lockFinal,
  lockFx,
  makePlates,
  recordTake,
  renderFinal,
  renderFormats,
  runSwaps,
  setFxPack,
  settle,
  startSwitch,
} from './actions';
import { directorReply } from './director';
import { DEFAULT_TAKE_PLAN, SAMPLE_TRACKS } from './samples';
import type { Project } from './types';

// Three example projects so the first screen shows the app working: one mid-switch,
// one still recording, one wrapped. They are marked as samples in the UI.

function recordAll(p: Project): Project {
  let next = p;
  for (const t of DEFAULT_TAKE_PLAN) next = recordTake(next, t.angle, t.scope);
  return next;
}

function sendIdea(p: Project, text: string): Project {
  let next = addUserMessage(p, text);
  const reply = directorReply(next, text);
  if (reply.idea) next = addIdea(next, text, reply.idea);
  return addDirectorMessage(next, reply.text);
}

export function buildSampleProjects(): Project[] {
  const now = Date.now();

  // Out the Mud: mid-switch, so the tracker shows a job running when the app opens.
  let mud = createProject({ track: SAMPLE_TRACKS[0], vibe: 'Drill', formats: ['16:9', '9:16'] });
  mud = settle(mud);
  mud = recordAll(mud);
  mud = sendIdea(mud, 'Put a Lambo pulling up in the rain during the hook');
  mud = settle(finishRecording(mud));
  mud = lockCut(mud);
  mud = settle(makePlates(mud));
  mud = approvePlates(mud);
  mud = startSwitch(mud);
  for (let i = 0; i < 12; i++) mud = advance(mud, 250);
  mud = { ...mud, isSample: true, createdAt: now - 1000 * 60 * 40 };

  // Late Night Freestyle: one take in, still recording.
  let late = createProject({ track: SAMPLE_TRACKS[1], vibe: 'Melodic', formats: ['9:16'] });
  late = settle(late);
  late = recordTake(late, 'Wide', 'Full song');
  late = { ...late, isSample: true, createdAt: now - 1000 * 60 * 60 * 26 };

  // Windy City: wrapped and exported.
  let windy = createProject({ track: SAMPLE_TRACKS[2], vibe: 'Trap', formats: ['16:9'] });
  windy = settle(windy);
  windy = recordAll(windy);
  windy = settle(finishRecording(windy));
  windy = lockCut(windy);
  windy = settle(makePlates(windy));
  windy = approvePlates(windy);
  windy = approveAllShots(settle(startSwitch(windy)));
  windy = ensureSwaps(windy);
  windy = keepSwaps(settle(runSwaps(windy)));
  windy = ensureBroll(windy);
  windy = approveBroll(settle(generateBroll(windy)));
  windy = lockFx(setFxPack(windy, 'trapHype'));
  windy = lockFinal(settle(renderFinal(windy)));
  windy = settle(renderFormats(windy));
  windy = settle(exportVideo(windy));
  windy = { ...windy, isSample: true, createdAt: now - 1000 * 60 * 60 * 24 * 6 };

  return [mud, late, windy];
}
