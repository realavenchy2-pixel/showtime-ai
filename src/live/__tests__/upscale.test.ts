import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../server/src/app.mjs';
import { upscaleVideo, uploadType } from '../upscale';

/** The studio server in-process, with fal faked: storage, the Topaz queue and the finished file. */
function studio(opts: { fail?: boolean; directDownload?: boolean } = {}) {
  const uploaded: { type: string; size: number }[] = [];
  const jobs: unknown[] = [];
  let polls = 0;
  const fal = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    if (url.includes('/storage/upload/initiate')) return json({ upload_url: 'https://v3b.fal.media/upload/slot1?sig=x', file_url: 'https://v3b.fal.media/files/slot1/video.mp4' });
    if (url.startsWith('https://queue.fal.run/') && init.method === 'POST') {
      jobs.push({ url, body: JSON.parse(String(init.body)) });
      return json({ request_id: 'r1', status_url: 'https://queue.fal.run/fal-ai/topaz/requests/r1/status', response_url: 'https://queue.fal.run/fal-ai/topaz/requests/r1' });
    }
    if (url.endsWith('/requests/r1/status')) {
      polls += 1;
      return json({ status: opts.fail ? 'FAILED' : polls < 3 ? 'IN_PROGRESS' : 'COMPLETED', error: opts.fail ? 'Video too long' : undefined });
    }
    if (url.endsWith('/requests/r1')) return json({ video: { url: 'https://v3b.fal.media/files/out/upscaled.mp4' } });
    if (url === 'https://v3b.fal.media/files/out/upscaled.mp4') return new Response(new Blob([new Uint8Array(4096)], { type: 'video/mp4' }));
    return new Response('{}', { status: 404 });
  };
  const app = createApp({ FAL_KEY: 'fk', SHOWTIME_APP_KEY: 'door' }, { fetch: fal });
  const browser = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://studio.test')) return app(new Request(url, init));
    if (url.startsWith('https://v3b.fal.media/upload/') && init.method === 'PUT') {
      const body = init.body as Blob;
      uploaded.push({ type: String((init.headers as Record<string, string>)['content-type']), size: body.size });
      return new Response(null, { status: 200 });
    }
    if (url.startsWith('https://v3b.fal.media/files/')) {
      if (!opts.directDownload) throw new TypeError('Failed to fetch');
      return fal(url);
    }
    throw new TypeError(`Unexpected fetch ${url}`);
  };
  return { browser, uploaded, jobs, fal };
}

const cfg = { url: 'https://studio.test', key: 'door' };
const video = new Blob([new Uint8Array(1024)], { type: 'video/mp4;codecs=avc1.640028,mp4a.40.2' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Topaz upscale from the app', () => {
  it('uploads straight to fal, upscales with Proteus and brings the bigger file back', async () => {
    const s = studio({ directDownload: true });
    vi.stubGlobal('fetch', s.browser);
    const phases: string[] = [];
    const kept: Blob[] = [];
    const out = await upscaleVideo(cfg, video, {
      look: 'clean',
      factor: 2,
      filename: 'keef-v1-reels.mp4',
      pollMs: 1,
      onProgress: (phase) => phases.push(phase),
      keepAudio: async (up, original) => {
        kept.push(original);
        return up;
      },
    });
    expect(out.size).toBe(4096);
    expect(s.uploaded).toEqual([{ type: 'video/mp4', size: 1024 }]);
    expect(s.jobs).toEqual([{ url: 'https://queue.fal.run/fal-ai/topaz/upscale/video', body: { video_url: 'https://v3b.fal.media/files/slot1/video.mp4', model: 'Proteus', upscale_factor: 2, H264_output: true } }]);
    expect(kept).toEqual([video]);
    expect(phases[0]).toBe('upload');
    expect(phases).toContain('upscaling');
    expect(phases.at(-1)).toBe('download');
  });

  it('falls back to the server for the download when the browser cannot read fal directly', async () => {
    const s = studio({ directDownload: false });
    vi.stubGlobal('fetch', s.browser);
    // /v1/fetch on the server reads the file with its own fetch, which is the fake fal.
    const out = await upscaleVideo(cfg, video, { look: 'detail', factor: 1.5, filename: 'a.mp4', pollMs: 1 });
    expect(out.size).toBe(4096);
    expect((s.jobs[0] as { url: string }).url).toBe('https://queue.fal.run/topaz/upscale/video/generative');
  });

  it('says why when Topaz fails, and stops when cancelled', async () => {
    vi.stubGlobal('fetch', studio({ fail: true }).browser);
    await expect(upscaleVideo(cfg, video, { look: 'clean', factor: 2, filename: 'a.mp4', pollMs: 1 })).rejects.toThrow('Video too long');
    vi.stubGlobal('fetch', studio().browser);
    const stop = new AbortController();
    const run = upscaleVideo(cfg, video, { look: 'clean', factor: 2, filename: 'a.mp4', pollMs: 50, signal: stop.signal, onProgress: (phase) => phase === 'upscaling' && stop.abort() });
    await expect(run).rejects.toThrow('Cancelled');
  });

  it('sends fal the plain file type', () => {
    expect(uploadType(video)).toBe('video/mp4');
    expect(uploadType(new Blob([], { type: 'video/webm;codecs=vp9,opus' }))).toBe('video/webm');
    expect(uploadType(new Blob([]))).toBe('video/mp4');
  });
});
