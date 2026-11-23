import { create } from 'zustand';

import { addUserMessage, approvePlan, connectLive, resumeSwitch, setVideoLength } from '@/engine/actions';
import { applyReply, replyLocally } from '@/engine/agent';
import { lockPlan as lockPlanHere, planFromBrief } from '@/engine/brief';
import { locationsToMake, setLocationImage } from '@/engine/production';
import { useApp } from '@/engine/store';
import { recentChat, summarize } from '@/engine/summary';
import type { Project, VideoLength } from '@/engine/types';

import { askDirector, cleanUrl, makeReference, getCaps, sameOriginServer, savedServer, saveServer, StudioError, toLiveCaps, type ServerCaps, type ServerConfig } from './client';
import { pickUp, type RunnerHost } from './runner';

// The app's connection to the studio server: whether one is connected, what it can run,
// and the glue that sends live jobs and chat messages its way.

export type ServerStatus = 'off' | 'checking' | 'on' | 'locked' | 'error';

interface ServerState {
  status: ServerStatus;
  config?: ServerConfig;
  caps?: ServerCaps;
  /** Why the last connection attempt did not work. */
  error?: string;
  /** Projects waiting on the director's answer. */
  thinking: Record<string, boolean>;
}

export const useServer = create<ServerState>(() => ({ status: 'off', thinking: {} }));

const host: RunnerHost = {
  project: (id) => useApp.getState().projects[id],
  apply: (id, fn) => useApp.getState().apply(id, fn),
};

function liveConfig(): ServerConfig | undefined {
  const s = useServer.getState();
  return s.status === 'on' ? s.config : undefined;
}

/** Brings projects in line with the server: new work goes live, interrupted switches resume, live jobs get picked up. */
function reconcile(): void {
  const server = useServer.getState();
  if (server.status === 'checking') return;
  const cfg = liveConfig();
  const caps = cfg && server.caps ? toLiveCaps(server.caps) : undefined;
  const app = useApp.getState();
  for (const id of app.order) {
    const p = app.projects[id];
    if (!p || p.isSample) continue;
    if (caps && !p.job && p.shots.length === 0) app.apply(id, (x) => connectLive(x, caps));
    if (cfg && p.pipeline === 'live' && !p.job) app.apply(id, (x) => resumeSwitch(x));
    const now = useApp.getState().projects[id];
    if (now?.job?.external) pickUp(host, cfg, now);
  }
}

let started = false;
let scheduled = false;

/** Call once when the app starts. */
export function startSession(): void {
  if (started) return;
  started = true;
  useApp.subscribe(() => {
    // Coalesce bursts of store updates into one pass.
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      reconcile();
    }, 50);
  });
  void connectServer();
}

/**
 * Connects to a studio server. With no argument it tries the saved one, then a server deployed with the web app.
 * Resolves with the new status.
 */
export async function connectServer(input?: { url: string; key?: string }): Promise<ServerStatus> {
  const candidates: ServerConfig[] = [];
  if (input) candidates.push({ url: cleanUrl(input.url), key: input.key?.trim() || undefined });
  else {
    const saved = savedServer();
    if (saved) candidates.push(saved);
    const here = sameOriginServer();
    if (here && here !== saved?.url) candidates.push({ url: here, key: saved?.key });
  }
  if (candidates.length === 0 || !candidates[0].url) {
    useServer.setState({ status: 'off', config: undefined, caps: undefined, error: undefined });
    return 'off';
  }

  useServer.setState({ status: 'checking', error: undefined });
  let last: { status: ServerStatus; error?: string; config?: ServerConfig } = { status: 'off' };
  for (const config of candidates) {
    try {
      const caps = await getCaps(config);
      saveServer(config);
      useServer.setState({ status: 'on', config, caps, error: caps.switch?.error });
      reconcile();
      return 'on';
    } catch (err) {
      const locked = err instanceof StudioError && err.code === 'BAD_ACCESS_CODE';
      last = { status: locked ? 'locked' : 'error', error: err instanceof Error ? err.message : 'The studio server could not be reached.', config };
      if (locked) break;
    }
  }
  // A silent first try (nothing typed in, nothing saved) that finds no server just means demo mode.
  const quiet = !input && !savedServer();
  useServer.setState(quiet ? { status: 'off', config: undefined, caps: undefined, error: undefined } : { status: last.status, config: last.config, caps: undefined, error: last.error });
  reconcile();
  return quiet ? 'off' : last.status;
}

export function disconnectServer(): void {
  saveServer(undefined);
  useServer.setState({ status: 'off', config: undefined, caps: undefined, error: undefined });
}

/** True when Claude answers the chat for this project. */
export function directorIsLive(p: Project | undefined): boolean {
  const s = useServer.getState();
  return !!p && !p.isSample && s.status === 'on' && !!s.caps?.director;
}

/** The artist said something. Claude answers when the server has it; the built-in director answers otherwise. */
export function sendToDirector(projectId: string, input: string): void {
  const text = input.trim();
  if (!text) return;
  const app = useApp.getState();
  const cfg = liveConfig();
  const project = app.projects[projectId];
  if (!project) return;
  if (!cfg || !directorIsLive(project)) {
    app.send(projectId, text);
    return;
  }
  app.apply(projectId, (p) => addUserMessage(p, text));
  const setThinking = (on: boolean) => useServer.setState((s) => ({ thinking: { ...s.thinking, [projectId]: on } }));
  setThinking(true);
  const now = useApp.getState().projects[projectId];
  askDirector(cfg, { project: summarize(now), history: recentChat(now).slice(0, -1), text })
    .then(({ reply, commands }) => useApp.getState().apply(projectId, (p) => applyReply(p, reply, commands)))
    .catch(() => useApp.getState().apply(projectId, (p) => replyLocally(p, text)))
    .finally(() => {
      setThinking(false);
      makeLocations(projectId);
    });
}

/**
 * Has the studio server paint the empty location for every scene that doesn't have a picture yet.
 * Without a server (or without an image key on it) the app shows drawn stand-ins.
 */
export function makeLocations(projectId: string): void {
  const cfg = liveConfig();
  const project = useApp.getState().projects[projectId];
  if (!cfg || !project || project.pipeline !== 'live' || !project.live?.references) return;
  for (const ref of locationsToMake(project)) {
    makeReference(cfg, { prompt: ref.prompt ?? '', aspect: '16:9' })
      .then(({ uri, dataUrl }) => useApp.getState().apply(projectId, (p) => setLocationImage(p, ref.id, { uri: dataUrl, remoteUri: uri })))
      .catch(() => {});
  }
}

/**
 * The artist locks the plan. Claude reads the description into scenes when the server has it;
 * the built-in director does otherwise, or if Claude can't be reached.
 */
export function lockPlan(projectId: string, input: { brief: string; length: VideoLength }): void {
  const app = useApp.getState();
  const cfg = liveConfig();
  const project = app.projects[projectId];
  const brief = input.brief.trim();
  if (!project || project.planApproved) return;
  if (!cfg || !directorIsLive(project) || !brief) {
    app.apply(projectId, (p) => lockPlanHere(p, input));
    makeLocations(projectId);
    return;
  }
  app.apply(projectId, (p) => addUserMessage({ ...setVideoLength(p, input.length), brief }, brief));
  const setThinking = (on: boolean) => useServer.setState((s) => ({ thinking: { ...s.thinking, [projectId]: on } }));
  setThinking(true);
  const now = useApp.getState().projects[projectId];
  askDirector(cfg, { project: summarize(now), history: [], text: brief, task: 'plan' })
    .then(({ reply, commands }) => useApp.getState().apply(projectId, (p) => approvePlan(applyReply(p, reply, commands))))
    .catch(() => useApp.getState().apply(projectId, (p) => approvePlan(planFromBrief(p, brief))))
    .finally(() => setThinking(false));
}

/** One line for the Account screen and the studio header. */
export function serverLine(s: Pick<ServerState, 'status' | 'caps' | 'error'>): string {
  switch (s.status) {
    case 'checking':
      return 'Checking the studio server';
    case 'locked':
      return 'The access code is not right';
    case 'error':
      return s.error ?? 'The studio server could not be reached';
    case 'on': {
      const sw = s.caps?.switch;
      if (!sw) return 'Connected. The switch key is not set on the server yet';
      if (sw.error) return `Connected, but Beeble says: ${sw.error}`;
      const version = sw.model?.match(/(\d+\.\d+)/)?.[1];
      const parts = [`SwitchX${version ? ` ${version}` : ''}, ${Math.floor((sw.maxFrames ?? 240) / 24)}-second shots`];
      if (s.caps?.broll.length) parts.push(`b-roll on ${s.caps.broll.map((m) => (m === 'h3' ? 'H3' : 'Omni')).join(' and ')}`);
      if (s.caps?.director) parts.push('Claude directing');
      return parts.join(', ');
    }
    default:
      return 'Not connected. The switch and b-roll are simulated';
  }
}
