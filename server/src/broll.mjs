// B-roll generation. MiniMax H3 runs through fal's queue; Gemini Omni runs through fal when
// FAL_OMNI_MODEL names an endpoint, otherwise straight from Google when GEMINI_API_KEY is set.
//
// fal H3 input checked against https://fal.ai/models/minimax/h3/text-to-video/llms.txt and Omni against
// https://aistudio.google.com/docs/omni.md, both on 2026-11-14.

import { ProviderError } from './beeble.mjs';

const FAL_QUEUE = 'https://queue.fal.run/';

function b64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text) {
  return atob(text.replace(/-/g, '+').replace(/_/g, '/'));
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * @param {{ falKey?: string, geminiKey?: string, falH3Model?: string, falOmniModel?: string, fetch?: typeof fetch }} cfg
 */
export function createBroll(cfg) {
  const doFetch = cfg.fetch ?? globalThis.fetch;
  const h3 = cfg.falH3Model || 'minimax/h3/text-to-video';

  async function fal(method, url, body) {
    if (!url.startsWith(FAL_QUEUE)) throw new ProviderError('Unexpected b-roll job address.', 400);
    const res = await doFetch(url, {
      method,
      headers: { Authorization: `Key ${cfg.falKey}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ProviderError(data?.detail?.[0]?.msg ?? data?.detail ?? data?.error ?? `fal answered ${res.status}`, res.status);
    return data;
  }

  return {
    /** Which b-roll models this server can run. */
    models() {
      const out = [];
      if (cfg.falKey) out.push('h3');
      if ((cfg.falKey && cfg.falOmniModel) || cfg.geminiKey) out.push('omni');
      return out;
    },

    /**
     * @param {{ model: 'h3' | 'omni', prompt: string, durationSec: number, aspect: string }} job
     * @returns {Promise<{ id: string, status: string, url?: string, dataUrl?: string, model: string }>}
     */
    async start(job) {
      const prompt = String(job.prompt ?? '').trim().slice(0, 2000);
      if (!prompt) throw new ProviderError('B-roll needs a description of the shot.', 400);
      const available = this.models();
      if (available.length === 0) throw new ProviderError('No b-roll provider is set up on this server.', 501, 'NO_BROLL');
      const model = available.includes(job.model) ? job.model : available[0];
      const aspect = ['16:9', '9:16', '1:1'].includes(job.aspect) ? job.aspect : '16:9';

      if (model === 'h3' || (model === 'omni' && cfg.falKey && cfg.falOmniModel)) {
        const endpoint = model === 'h3' ? h3 : cfg.falOmniModel;
        const input =
          model === 'h3'
            ? { prompt, duration: clamp(Math.round(job.durationSec), 5, 15), resolution: '768P', aspect_ratio: aspect, prompt_expansion_mode: 'fast' }
            : { prompt, duration: clamp(Math.round(job.durationSec), 3, 15), aspect_ratio: aspect === '1:1' ? '16:9' : aspect };
        const q = await fal('POST', FAL_QUEUE + endpoint, input);
        return { id: `f:${b64url(JSON.stringify([q.status_url, q.response_url]))}`, status: 'queued', model };
      }

      // Gemini Omni straight from Google: one long request that answers with the finished clip.
      const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(cfg.geminiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-omni-1.2-flash',
          input: prompt,
          response_format: { type: 'video', aspect_ratio: aspect === '9:16' ? '9:16' : '16:9', duration: `${clamp(Math.round(job.durationSec), 3, 15)}s` },
        }),
      });
      const data = await res.json().catch(() => undefined);
      if (!res.ok) throw new ProviderError(data?.error?.message ?? `Gemini answered ${res.status}`, res.status);
      const video = (data?.steps ?? []).flatMap((s) => s.content ?? []).find((c) => c.type === 'video' && c.data);
      if (!video) throw new ProviderError('Gemini finished without a video.', 502);
      return { id: 'g:done', status: 'ready', dataUrl: `data:${video.mime_type ?? 'video/mp4'};base64,${video.data}`, model };
    },

    async status(id) {
      if (!id.startsWith('f:')) throw new ProviderError('Unknown b-roll job.', 404);
      const [statusUrl, responseUrl] = JSON.parse(unb64url(id.slice(2)));
      const s = await fal('GET', statusUrl);
      const word = String(s.status ?? '').toUpperCase();
      if (word === 'COMPLETED') {
        const out = await fal('GET', responseUrl);
        const url = out?.video?.url ?? out?.videos?.[0]?.url;
        return url ? { id, status: 'ready', url } : { id, status: 'failed', error: 'The clip came back empty.' };
      }
      if (/FAIL|ERROR|CANCEL/.test(word)) return { id, status: 'failed', error: s.error ?? 'The b-roll render failed.' };
      return { id, status: word === 'IN_QUEUE' ? 'queued' : 'rendering' };
    },
  };
}
