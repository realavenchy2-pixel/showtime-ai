import type { AgentCommand } from '@/engine/agent';
import type { BrollModel, LiveCaps } from '@/engine/types';

// Talks to the studio server (server/README.md). The server holds the provider keys;
// this app only ever holds the server's address and an access code.

export interface ServerConfig {
  url: string;
  /** Access code, when the server asks for one. */
  key?: string;
}

export interface ServerCaps {
  ok: boolean;
  switch: { provider: string; mode?: string; model?: string; maxFrames?: number; maxRefs?: number; resolutions?: number[]; note?: string; error?: string } | null;
  broll: BrollModel[];
  director: { model: string } | null;
  references: boolean;
  locked: boolean;
}

export class StudioError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const KEY = 'showtime:server';

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function savedServer(): ServerConfig | undefined {
  try {
    const raw = storage()?.getItem(KEY);
    const cfg = raw ? (JSON.parse(raw) as ServerConfig) : undefined;
    return cfg?.url ? cfg : undefined;
  } catch {
    return undefined;
  }
}

export function saveServer(cfg: ServerConfig | undefined): void {
  try {
    if (cfg) storage()?.setItem(KEY, JSON.stringify(cfg));
    else storage()?.removeItem(KEY);
  } catch {
    // Not saved; the connection still works for this session.
  }
}

/** Where a server lives when it is deployed together with the web app (Vercel serves both). */
export function sameOriginServer(): string | undefined {
  if (typeof window === 'undefined' || !window.location) return undefined;
  const { origin, hostname } = window.location;
  // GitHub Pages and local previews are static: there is no server behind them.
  if (!origin.startsWith('http') || hostname.endsWith('github.io')) return undefined;
  return `${origin}/api`;
}

export function cleanUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

async function call<T>(cfg: ServerConfig, method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cfg.key ? { 'x-showtime-key': cfg.key } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) throw new StudioError('That address did not answer like a studio server.', res.status, 'NOT_A_SERVER');
    const data = (await res.json()) as T & { error?: { message?: string; code?: string } };
    if (!res.ok) throw new StudioError(data?.error?.message ?? `The studio server answered ${res.status}.`, res.status, data?.error?.code);
    return data;
  } catch (err) {
    if (err instanceof StudioError) throw err;
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new StudioError(aborted ? 'The studio server took too long to answer.' : 'The studio server could not be reached.', 0, aborted ? 'TIMEOUT' : 'UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

export function getCaps(cfg: ServerConfig): Promise<ServerCaps> {
  return call<ServerCaps>(cfg, 'GET', '/v1/capabilities', undefined, 12000);
}

/** The limits a project adopts when it goes live. Undefined when the server cannot run the switch. */
export function toLiveCaps(caps: ServerCaps): LiveCaps | undefined {
  const sw = caps.switch;
  if (!sw || sw.error || !sw.model || !sw.maxFrames) return undefined;
  return {
    model: sw.model,
    maxFrames: sw.maxFrames,
    maxRefs: sw.maxRefs ?? 1,
    resolutions: sw.resolutions?.length ? sw.resolutions : [720, 1080],
    broll: caps.broll ?? [],
    // Generated reference frames stay off until that step is checked against a live key.
    references: false,
    director: !!caps.director,
  };
}

export interface RemoteJob {
  id: string;
  status: 'queued' | 'rendering' | 'ready' | 'failed';
  progress?: number;
  renderUrl?: string;
  alphaUrl?: string;
  url?: string;
  dataUrl?: string;
  error?: string;
  model?: string;
}

export function createUpload(cfg: ServerConfig, filename: string): Promise<{ uploadUrl: string; uri: string }> {
  return call(cfg, 'POST', '/v1/uploads', { filename });
}

/** Sends a file to its upload slot: straight to storage when the browser may, through the server otherwise. */
export async function putFile(cfg: ServerConfig, uploadUrl: string, blob: Blob, contentType: string): Promise<void> {
  try {
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
    if (res.ok) return;
  } catch {
    // Storage that does not accept browser uploads: go through the server.
  }
  const res = await fetch(`${cfg.url}/v1/uploads/proxy?url=${encodeURIComponent(uploadUrl)}`, {
    method: 'PUT',
    headers: { 'content-type': contentType, ...(cfg.key ? { 'x-showtime-key': cfg.key } : {}) },
    body: blob,
  });
  if (!res.ok) throw new StudioError('The shot could not be uploaded.', res.status, 'UPLOAD_FAILED');
}

export function startSwitch(
  cfg: ServerConfig,
  job: { sourceUri: string; prompt: string; referenceUris: string[]; alphaMode: string; resolution: number; idempotencyKey: string },
): Promise<RemoteJob> {
  return call(cfg, 'POST', '/v1/switch', job, 60000);
}

export function switchStatus(cfg: ServerConfig, id: string): Promise<RemoteJob> {
  return call(cfg, 'GET', `/v1/switch/${encodeURIComponent(id)}`);
}

export function startBroll(cfg: ServerConfig, job: { model: BrollModel; prompt: string; durationSec: number; aspect: string }): Promise<RemoteJob> {
  // Omni straight from Google answers with the finished clip, so this call can run for minutes.
  return call(cfg, 'POST', '/v1/broll', job, 280000);
}

export function brollStatus(cfg: ServerConfig, id: string): Promise<RemoteJob> {
  return call(cfg, 'GET', `/v1/broll/${encodeURIComponent(id)}`);
}

export function makeReference(cfg: ServerConfig, input: { prompt: string; aspect: string }): Promise<{ uri: string; dataUrl: string }> {
  return call(cfg, 'POST', '/v1/references', input, 120000);
}

export function askDirector(
  cfg: ServerConfig,
  input: { project: Record<string, unknown>; history: { from: string; text: string }[]; text?: string; task?: 'chat' | 'edit' },
): Promise<{ reply: string; commands: AgentCommand[] }> {
  return call(cfg, 'POST', '/v1/director', input, 60000);
}

/** Downloads a finished render through the server, so the player can read its pixels. */
export async function fetchRender(cfg: ServerConfig, url: string): Promise<Blob> {
  if (url.startsWith('data:')) return (await fetch(url)).blob();
  const res = await fetch(`${cfg.url}/v1/fetch?url=${encodeURIComponent(url)}`, { headers: cfg.key ? { 'x-showtime-key': cfg.key } : {} });
  if (!res.ok) throw new StudioError('The finished shot could not be downloaded.', res.status, 'DOWNLOAD_FAILED');
  return res.blob();
}
