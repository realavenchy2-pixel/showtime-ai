import { create } from 'zustand';

import { addDirectorMessage, addIdea, addUserMessage, advance, createProject, exportCost, exportVideo } from './actions';
import { directorReply } from './director';
import type { SampleTrack } from './samples';
import { buildSampleProjects } from './sampleProjects';
import type { Format, Project, Vibe } from './types';

// App state for the prototype. Phase 2 swaps the simulated jobs in `advance` for real
// provider calls behind the same project transitions.

export type PlanId = 'Free trial' | 'Standard' | 'Premium';

interface AppState {
  projects: Record<string, Project>;
  order: string[];
  credits: number;
  plan: PlanId;
  createProject: (input: { track: SampleTrack; vibe: Vibe; formats: Format[] }) => string;
  /** Applies a pure project transition from the engine. */
  apply: (id: string, fn: (p: Project) => Project) => void;
  sendMessage: (id: string, text: string) => void;
  exportVideo: (id: string) => 'started' | 'needCredits';
  addCredits: (n: number) => void;
  setPlan: (plan: PlanId) => void;
  /** Advances every running job by `dtMs`. */
  tick: (dtMs: number) => void;
}

function seed(): Pick<AppState, 'projects' | 'order'> {
  const samples = buildSampleProjects();
  return {
    projects: Object.fromEntries(samples.map((p) => [p.id, p])),
    order: samples.map((p) => p.id),
  };
}

export const useApp = create<AppState>((set, get) => ({
  ...seed(),
  credits: 3,
  plan: 'Free trial',

  createProject: (input) => {
    const p = createProject(input);
    set((s) => ({ projects: { ...s.projects, [p.id]: p }, order: [p.id, ...s.order] }));
    return p.id;
  },

  apply: (id, fn) => {
    const p = get().projects[id];
    if (!p) return;
    const next = fn(p);
    if (next !== p) set((s) => ({ projects: { ...s.projects, [id]: next } }));
  },

  sendMessage: (id, text) => {
    const clean = text.trim();
    if (!clean) return;
    get().apply(id, (p) => {
      let next = addUserMessage(p, clean);
      const reply = directorReply(next, clean);
      if (reply.idea) next = addIdea(next, clean, reply.idea);
      return addDirectorMessage(next, reply.text);
    });
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

  addCredits: (n) => set((s) => ({ credits: s.credits + n })),
  setPlan: (plan) => set({ plan }),

  tick: (dtMs) => {
    const { projects } = get();
    let changed = false;
    const next: Record<string, Project> = { ...projects };
    for (const id of Object.keys(projects)) {
      const p = projects[id];
      if (p.job) {
        next[id] = advance(p, dtMs);
        changed = true;
      }
    }
    if (changed) set({ projects: next });
  },
}));

export function useProject(id: string | undefined): Project | undefined {
  return useApp((s) => (id ? s.projects[id] : undefined));
}
