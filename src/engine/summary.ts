import { coverage, videoLength, videoRange } from './actions';
import { estimateBudget } from './agent';
import { nextActions } from './director';
import { currentStage, stageStatus } from './stages';
import type { Project } from './types';

/**
 * The project as the director (Claude) sees it: everything it needs to answer and act, nothing it doesn't.
 * Kept small on purpose; it is sent with every chat message.
 */
export function summarize(p: Project): Record<string, unknown> {
  const stage = currentStage(p);
  const sections = p.song?.sections ?? [];
  const label = (id: string) => sections.find((s) => s.id === id)?.label ?? id;
  const shots = p.shots;
  const budget = estimateBudget(p);
  return {
    title: p.title,
    vibe: p.vibe,
    formats: p.formats,
    video: p.song ? { length: videoLength(p), from: Math.round(videoRange(p).start), to: Math.round(videoRange(p).end), placed: p.takes.length > 0 || !p.length } : undefined,
    brief: p.brief,
    autonomy: p.autonomy,
    pipeline: p.pipeline,
    stage: stage ? { id: stage.id, status: stageStatus(p, stage.id), next: nextActions(p).primary?.label } : { id: 'wrapped' },
    job: p.job ? { stage: p.job.stage, label: p.job.label, percent: Math.round(p.job.progress * 100) } : undefined,
    song: p.song
      ? {
          title: p.song.title,
          bpm: p.song.bpm,
          seconds: Math.round(p.song.durationSec),
          hasLyrics: p.song.lyrics.length > 0,
          // Scenes are the plan's units; "Before" and "After" are song outside the video.
          sections: sections.map((s) => ({ id: s.id, label: s.label, kind: s.scene ? 'scene' : s.kind, start: Math.round(s.start), end: Math.round(s.end) })),
        }
      : undefined,
    takes: p.takes.map((t) => ({ n: t.n, label: t.label, angle: t.angle, from: Math.round(t.start), to: Math.round(t.end), source: t.source, linedUpBy: t.sync, note: t.flag })),
    songCovered: `${Math.round(coverage(p) * 100)}%`,
    ownClips: p.clips.length,
    cut: { shots: p.cut.segments.length, uncovered: p.cut.segments.filter((s) => !s.takeId).length, locked: p.cut.locked },
    looks: Object.fromEntries(Object.entries(p.looks).map(([id, look]) => [label(id), { location: look.location, prompt: look.prompt.slice(0, 140), references: look.refs.length }])),
    planApproved: p.planApproved,
    switch: {
      model: p.switchSettings.model,
      maxFrames: p.switchSettings.maxFrames,
      resolution: p.switchSettings.resolution,
      shots: shots.length,
      rendering: shots.filter((s) => s.status === 'queued' || s.status === 'rendering').length,
      back: shots.filter((s) => s.status === 'ready').length,
      approved: shots.filter((s) => s.status === 'approved').length,
      failed: shots.filter((s) => s.status === 'failed').map((s) => ({ n: s.n, error: s.error })),
      notes: shots.filter((s) => s.flag).map((s) => ({ n: s.n, note: s.flag })),
    },
    broll: p.broll.ideas.map((i) => ({ shot: i.shot, at: i.at === undefined ? undefined : Math.round(i.at), status: i.status, keep: i.keep, model: i.model })),
    effects: { pack: p.fx.pack, intensity: p.fx.intensity, on: Object.entries(p.fx.effects).filter(([, on]) => on).map(([id]) => id) },
    edit: { built: p.final.builds > 0, locked: p.final.locked },
    exported: p.exportState.done,
    ideas: p.ideas.map((i) => ({ stage: i.stage, text: i.text })),
    renderBudget: { beebleCredits: budget.totalCredits, switchFrames: budget.switchFrames, brollSeconds: budget.brollSeconds },
  };
}

/** The last few chat lines, for the director's memory of the conversation. */
export function recentChat(p: Project, n = 10): { from: 'user' | 'director'; text: string }[] {
  return p.messages
    .filter((m) => m.from !== 'system')
    .slice(-n)
    .map((m) => ({ from: m.from as 'user' | 'director', text: m.text.slice(0, 400) }));
}
