// The 1440p and 4K finish: Topaz upscaling through fal.
//
// The app renders the video on the phone or computer, sends the file straight to fal's storage
// (a signed upload, so a big file never passes through this server), then this server asks Topaz
// to upscale it and hands back the finished file's address.
//
// Two looks:
//   clean   Topaz Proteus on fal-ai/topaz/upscale/video: sharpens and cleans, true to the footage.
//   detail  Topaz Starlight on topaz/upscale/video/generative: rebuilds fine texture. About 3x the cost.
//
// Checked against https://fal.ai/models/fal-ai/topaz/upscale/video/llms.txt and
// https://fal.ai/models/topaz/upscale/video/generative/llms.txt on 2026-11-26. Storage upload is the
// two-step initiate-then-PUT that fal's own clients use.

import { ProviderError } from './beeble.mjs';

const FAL_QUEUE = 'https://queue.fal.run/';

function b64url(text) {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text) {
  return atob(text.replace(/-/g, '+').replace(/_/g, '/'));
}

/** fal hands out files from these hosts; the upscale only takes a file fal already holds. */
const FAL_FILE = /^https:\/\/([a-z0-9-]+\.)*fal\.media\//i;

/**
 * @param {{ falKey?: string, fetch?: typeof fetch, restUrl?: string, cleanModel?: string, detailModel?: string }} cfg
 */
export function createUpscale(cfg) {
  const doFetch = cfg.fetch ?? globalThis.fetch;
  const rest = (cfg.restUrl || 'https://rest.alpha.fal.ai').replace(/\/+$/, '');
  const endpoints = {
    clean: cfg.cleanModel || 'fal-ai/topaz/upscale/video',
    detail: cfg.detailModel || 'topaz/upscale/video/generative',
  };

  async function fal(method, url, body) {
    const res = await doFetch(url, {
      method,
      headers: { Authorization: `Key ${cfg.falKey}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ProviderError(data?.detail?.[0]?.msg ?? data?.detail ?? data?.error ?? `fal answered ${res.status}`, res.status);
    return data;
  }

  function need() {
    if (!cfg.falKey) throw new ProviderError('Upscaling is not set up on this server yet (it needs FAL_KEY).', 501, 'NOT_CONFIGURED');
  }

  return {
    /** Which upscale looks this server can run. */
    looks() {
      return cfg.falKey ? ['clean', 'detail'] : [];
    },

    /** A signed slot in fal's storage for the rendered video. The app uploads to `uploadUrl` itself. */
    async upload(input) {
      need();
      const name = String(input.filename ?? '').slice(-120);
      if (!/\.(mp4|mov|webm)$/i.test(name)) throw new ProviderError('Send a filename ending in .mp4, .mov or .webm.', 400);
      const type = ['video/mp4', 'video/quicktime', 'video/webm'].includes(input.contentType) ? input.contentType : 'video/mp4';
      const slot = await fal('POST', `${rest}/storage/upload/initiate?storage_type=fal-cdn-v3`, { content_type: type, file_name: name });
      if (!slot?.upload_url || !slot?.file_url) throw new ProviderError('fal did not hand out an upload slot.', 502);
      return { uploadUrl: slot.upload_url, fileUrl: slot.file_url };
    },

    /**
     * Starts the upscale. `factor` is how many times bigger, 1 to 4 (a 1080p render to 4K is 2).
     * @param {{ videoUrl: string, factor: number, look?: 'clean' | 'detail' }} input
     */
    async start(input) {
      need();
      const videoUrl = String(input.videoUrl ?? '');
      if (!FAL_FILE.test(videoUrl)) throw new ProviderError('Upload the video to fal storage first.', 400);
      const factor = Number(input.factor);
      if (!(factor >= 1 && factor <= 4)) throw new ProviderError('The upscale factor must be between 1 and 4.', 400);
      const look = input.look === 'detail' ? 'detail' : 'clean';
      // H.264 out, so every browser and phone can play the file; H.265 is fal's default.
      const job =
        look === 'clean'
          ? { video_url: videoUrl, model: 'Proteus', upscale_factor: Math.round(factor * 1000) / 1000, H264_output: true }
          : { video_url: videoUrl, upscale_factor: Math.round(factor * 1000) / 1000, H264_output: true };
      const q = await fal('POST', FAL_QUEUE + endpoints[look], job);
      if (!q?.status_url || !q?.response_url) throw new ProviderError('fal did not queue the upscale.', 502);
      return { id: `u:${b64url(JSON.stringify([q.status_url, q.response_url]))}`, status: 'queued', look };
    },

    async status(id) {
      need();
      if (!String(id).startsWith('u:')) throw new ProviderError('Unknown upscale job.', 404);
      let statusUrl;
      let responseUrl;
      try {
        [statusUrl, responseUrl] = JSON.parse(unb64url(String(id).slice(2)));
      } catch {
        throw new ProviderError('Unknown upscale job.', 404);
      }
      if (!String(statusUrl).startsWith(FAL_QUEUE) || !String(responseUrl).startsWith(FAL_QUEUE)) throw new ProviderError('Unexpected upscale job address.', 400);
      const s = await fal('GET', statusUrl);
      const word = String(s?.status ?? '').toUpperCase();
      if (word === 'COMPLETED') {
        const out = await fal('GET', responseUrl);
        const url = out?.video?.url;
        return url ? { id, status: 'ready', url } : { id, status: 'failed', error: 'The upscale came back empty.' };
      }
      if (/FAIL|ERROR|CANCEL/.test(word)) return { id, status: 'failed', error: s?.error ?? 'The upscale failed.' };
      return { id, status: word === 'IN_QUEUE' ? 'queued' : 'rendering' };
    },
  };
}
