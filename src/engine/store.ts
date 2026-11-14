import { create } from 'zustand';

import { advance, createProject, exportCost, exportVideo, type NewProjectInput } from './actions';
import { respond, runAgent } from './agent';
import { buildSampleProjects } from './sampleProjects';
import type { Project } from './types';

// App state. Projects change only through the engine's pure transitions; after each one the
// director takes whatever steps it can on its own. Real projects are saved on the device.

export type PlanId = 'Free trial' | 'Standard' | 'Premium';

interface Saved {
  v: 2;
  projects: Project[];
  credits: number;
  plan: PlanId;
}

const KEY = 'showtime:v2';

interface AppState {
  projects: Record<string, Project>;
  order: string[];
  credits: number;
  plan: PlanId;
  createProject: (input: NewProjectInput) => string;
  removeProject: (id: string) => void;
  /** Applies a pure project transition from the engine, then lets the director carry on. */
  apply: (id: string, fn: (p: Project) => Project) => void;
  /** The artist said something in the chat. */
  send: (id: string, text: string) => void;
  /** Starts the simulated export. Returns `needCredits` when the balance is short. */
  exportVideo: (id: string) => 'started' | 'needCredits';
  /** Takes the credits for an export that renders on this device. */
  chargeExport: (id: string) => number | null;
  addCredits: (n: number) => void;
  setPlan: (plan: PlanId) => void;
  /** Advances every running simulated job by `dtMs`. */
  tick: (dtMs: number) => void;
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function load(): Saved | undefined {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return undefined;
    const saved = JSON.parse(raw) as Saved;
    return saved?.v === 2 && Array.isArray(saved.projects) ? saved : undefined;
  } catch {
    return undefined;
  }
}

function seed(): Pick<AppState, 'projects' | 'order' | 'credits' | 'plan'> {
  const samples = buildSampleProjects();
  const saved = load();
  // A job that was rendering on this device when the app closed can't be resumed; simulated ones can.
  const mine = (saved?.projects ?? []).map((p) => (p.job?.external ? { ...p, job: undefined } : p));
  const all = [...mine, ...samples];
  return {
    projects: Object.fromEntries(all.map((p) => [p.id, p])),
    order: all.map((p) => p.id),
    credits: saved?.credits ?? 3,
    plan: saved?.plan ?? 'Free trial',
  };
}

export const useApp = create<AppState>((set, get) => ({
  ...seed(),

  createProject: (input) => {
    const p = runAgent(createProject(input));
    set((s) => ({ projects: { ...s.projects, [p.id]: p }, order: [p.id, ...s.order] }));
    return p.id;
  },

  removeProject: (id) => {
    set((s) => {
      const projects = { ...s.projects };
      delete projects[id];
      return { projects, order: s.order.filter((x) => x !== id) };
    });
  },

  apply: (id, fn) => {
    const p = get().projects[id];
    if (!p) return;
    const changed = fn(p);
    if (changed === p) return;
    const next = runAgent(changed);
    set((s) => ({ projects: { ...s.projects, [id]: next } }));
  },

  send: (id, text) => {
    if (!text.trim()) return;
    get().apply(id, (p) => respond(p, text));
  },

  exportVideo: (id) => {
    const p = get().projects[id];
    if (!p) return 'needCredits';
    const cost = exportCost(p, get().plan === 'Premium');
    if (get().credits < cost) return 'needCredits';
    set((s) => ({ credits: s.credits - cost }));
    get().apply(id, (x) => exportVideo(x, cost));
    return 'started';
  },

  chargeExport: (id) => {
    const p = get().projects[id];
    if (!p) return null;
    const cost = exportCost(p, get().plan === 'Premium');
    if (get().credits < cost) return null;
    set((s) => ({ credits: s.credits - cost }));
    return cost;
  },

  addCredits: (n) => set((s) => ({ credits: s.credits + n })),
  setPlan: (plan) => set({ plan }),

  tick: (dtMs) => {
    const { projects } = get();
    let changed = false;
    const next: Record<string, Project> = { ...projects };
    for (const id of Object.keys(projects)) {
      const p = projects[id];
      if (!p.job || p.job.external) continue;
      const advanced = advance(p, dtMs);
      next[id] = advanced.job ? advanced : runAgent(advanced);
      changed = true;
    }
    if (changed) set({ projects: next });
  },
}));

// Save real projects (not the samples) a moment after they change.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useApp.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const saved: Saved = {
      v: 2,
      projects: state.order.map((id) => state.projects[id]).filter((p) => p && !p.isSample),
      credits: state.credits,
      plan: state.plan,
    };
    try {
      storage()?.setItem(KEY, JSON.stringify(saved));
    } catch {
      // Storage is full or blocked. The session still works; it just won't survive a reload.
    }
  }, 400);
});

export function useProject(id: string | undefined): Project | undefined {
  return useApp((s) => (id ? s.projects[id] : undefined));
}
