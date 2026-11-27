// The Showtime studio server: holds the provider keys and runs the AI steps for the app.
// One fetch-style handler, no dependencies, so it runs on Vercel, Cloudflare Workers, Deno or plain Node.
//
//   GET  /v1/health                 is the server up
//   GET  /v1/capabilities           what this server can run (switch, b-roll, backgrounds, director, upscale)
//   POST /v1/uploads                a slot to upload a shot or reference image to Beeble
//   PUT  /v1/uploads/proxy?url=     the same upload sent through this server (when the browser can't PUT directly)
//   POST /v1/switch                 start one SwitchX generation        GET /v1/switch/:id   where it stands
//   POST /v1/broll                  start one b-roll clip               GET /v1/broll/:id    where it stands
//   POST /v1/references             paint a background for a scene (default image model; a redo goes to the backup)
//   POST /v1/director               the director's answer plus commands (Claude)
//   POST /v1/upscale/upload         a signed slot in fal storage for a rendered video (1440p and 4K)
//   POST /v1/upscale                start a Topaz upscale               GET /v1/upscale/:id  where it stands
//   GET  /v1/fetch?url=             a finished render, passed through so the browser can read it
//
// Every route except health needs the access code (header `x-showtime-key`) when SHOWTIME_APP_KEY is set.

import { createBeeble, ProviderError } from './beeble.mjs';
import { createBroll } from './broll.mjs';
import { direct } from './claude.mjs';
import { createUpscale } from './upscale.mjs';

const RESULT_HOSTS = /(^|\.)(beeble\.ai|higgsfield\.ai|amazonaws\.com|googleapis\.com|googleusercontent\.com|cloudfront\.net|fal\.media|fal\.run|r2\.cloudflarestorage\.com|blob\.core\.windows\.net)$/i;

// White label: the app never names the companies or models behind it, errors included.
const NAMES = [
  [/\bbeeble(?:\.ai)?(?:'s)?\b/gi, 'the switch'],
  [/\bswitch\s?x(?:[\s-]*\d+(?:\.\d+)?)?\b/gi, 'the switch'],
  [/\btopaz(?:\s+(?:proteus|starlight))?\b/gi, 'the upscaler'],
  [/\b(?:proteus|starlight)\b/gi, 'the upscaler'],
  [/\b(?:openai|chatgpt|gpt[\s-]?image[\w.-]*|sunburst)\b/gi, 'the image service'],
  [/\b(?:gemini(?:[\s-]+(?:omni|\d[\w.-]*))*|nano\s+banana(?:\s+(?:pro|\d+(?:\.\d+)?))?|google)\b/gi, 'the render service'],
  [/\bomni\b/gi, 'the render service'],
  [/\b(?:minimax(?:\s+h3)?|h3|hailuo|seedance|kling|veo|sora|magi-?2?|sand\.ai|higgsfield)\b/gi, 'the render service'],
  [/\bfal(?:\.ai|\.run|\.media)?\b/gi, 'the render service'],
  [/\b(?:anthropic|claude(?:-[\w.-]+)?)\b/gi, 'the director'],
];

export function plainWords(text) {
  let out = String(text);
  for (const [re, word] of NAMES) out = out.replace(re, word);
  // "OpenAI gpt-image-2.6" becomes one "the image service", not two.
  for (const word of new Set(NAMES.map(([, w]) => w))) out = out.replace(new RegExp(`${word}(?:[\\s,/-]+${word})+`, 'gi'), word);
  return out.replace(/\b(the)\s+the\b/gi, '$1');
}

function allowedHost(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && RESULT_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {(request: Request) => Promise<Response>}
 */
export function createApp(env, deps = {}) {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const beeble = env.BEEBLE_API_KEY ? createBeeble({ apiKey: env.BEEBLE_API_KEY, fetch: doFetch, prefer: env.SWITCHX_VERSION || undefined }) : undefined;
  const higgsfieldKey = env.HIGGSFIELD_API_KEY || (env.HF_API_KEY_ID && env.HF_API_KEY_SECRET ? `${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}` : undefined);
  const broll = createBroll({ falKey: env.FAL_KEY, geminiKey: env.GEMINI_API_KEY, higgsfieldKey, magiModel: env.HIGGSFIELD_MAGI_MODEL, falH3Model: env.FAL_H3_MODEL, falOmniModel: env.FAL_OMNI_MODEL, fetch: doFetch });
  const upscale = createUpscale({ falKey: env.FAL_KEY, fetch: doFetch, restUrl: env.FAL_REST_URL, cleanModel: env.FAL_UPSCALE_MODEL, detailModel: env.FAL_UPSCALE_DETAIL_MODEL });
  const claude = env.ANTHROPIC_API_KEY ? { apiKey: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL, fetch: doFetch } : undefined;
  const origins = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);

  function cors(request) {
    const origin = request.headers.get('origin') ?? '';
    const allow = origins.includes('*') ? '*' : origins.includes(origin) ? origin : origins[0];
    return {
      'access-control-allow-origin': allow,
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'content-type, x-showtime-key',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
  }

  function json(request, body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(request) } });
  }

  function fail(request, err) {
    const status = err instanceof ProviderError ? (err.status >= 400 && err.status < 600 ? err.status : 502) : 500;
    console.error('studio:', err instanceof Error ? err.message : err);
    const message = plainWords(err instanceof Error ? err.message : 'Something went wrong on the studio server.');
    return json(request, { error: { message, code: err instanceof ProviderError ? err.code : undefined } }, status === 401 ? 502 : status);
  }

  async function body(request) {
    try {
      return (await request.json()) ?? {};
    } catch {
      throw new ProviderError('The request body was not JSON.', 400);
    }
  }

  function need(thing, name) {
    if (!thing) throw new ProviderError(`${name} is not set up on this server yet.`, 501, 'NOT_CONFIGURED');
    return thing;
  }

  // Backgrounds: a default image model and a backup. A redo (the artist asked for something
  // different) goes to the backup first, for a real second opinion; either one covers for the other
  // when it fails or isn't set up. The app never learns which one made the picture.
  const painters = {
    openai: env.OPENAI_API_KEY ? { model: env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-sunburst', quality: env.OPENAI_IMAGE_QUALITY || 'high' } : undefined,
    google: env.GEMINI_API_KEY ? { model: env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image', size: env.GEMINI_IMAGE_SIZE || '2K' } : undefined,
  };

  async function paintOpenAI(prompt, aspect, signal) {
    const cfg = painters.openai;
    const res = await doFetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, prompt, size: aspect === '9:16' ? '1024x1536' : '1536x1024', quality: cfg.quality, n: 1 }),
      signal,
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ProviderError(data?.error?.message ?? `OpenAI answered ${res.status}`, res.status);
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new ProviderError('The image model finished without an image.', 502);
    return { b64, mime: 'image/png' };
  }

  async function paintGoogle(prompt, aspect, signal) {
    const cfg = painters.google;
    // Same Interactions API the b-roll uses, asking for an image instead of a video.
    const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, input: prompt, response_format: { type: 'image', aspect_ratio: aspect === '9:16' ? '9:16' : '16:9', image_size: cfg.size } }),
      signal,
    });
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ProviderError(data?.error?.message ?? `Gemini answered ${res.status}`, res.status);
    const image = (data?.steps ?? []).flatMap((st) => st.content ?? []).find((c) => c.type === 'image' && c.data);
    if (!image) throw new ProviderError('The image model finished without an image.', 502);
    return { b64: image.data, mime: image.mime_type ?? 'image/png' };
  }

  /** Paints one background, default model first (backup first on a redo), within the request's time. */
  async function paint(prompt, aspect, retry) {
    const order = (retry ? ['google', 'openai'] : ['openai', 'google']).filter((name) => painters[name]);
    if (order.length === 0) throw new ProviderError('Backgrounds are not set up on this server yet.', 501, 'NOT_CONFIGURED');
    let last;
    for (let i = 0; i < order.length; i++) {
      // The first try leaves room in the request for the backup.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), i === 0 && order.length > 1 ? 150_000 : 120_000);
      try {
        return await (order[i] === 'openai' ? paintOpenAI : paintGoogle)(prompt, aspect, controller.signal);
      } catch (err) {
        last = err;
        console.error(`references: ${order[i]} failed`, err instanceof Error ? err.message : err);
      } finally {
        clearTimeout(timer);
      }
    }
    throw last instanceof ProviderError ? last : new ProviderError('The background could not be made.', 502);
  }

  async function capabilities() {
    let sw;
    if (beeble) {
      try {
        const c = await beeble.capabilities();
        sw = { provider: 'beeble', mode: c.mode, model: c.model, maxFrames: c.maxFrames, maxRefs: c.maxRefs, resolutions: c.resolutions, note: c.why };
      } catch (err) {
        sw = { provider: 'beeble', error: err instanceof Error ? err.message : String(err) };
      }
    }
    return {
      ok: true,
      switch: sw ?? null,
      broll: broll.models(),
      director: claude ? { model: claude.model || 'claude-sonnet-5-5' } : null,
      references: !!((painters.openai || painters.google) && beeble),
      upscale: upscale.looks(),
      locked: !!env.SHOWTIME_APP_KEY,
    };
  }

  async function makeReference(input) {
    const b = need(beeble, 'The switch');
    const prompt = String(input.prompt ?? '').trim().slice(0, 4000);
    if (!prompt) throw new ProviderError('A reference needs a prompt.', 400);
    const { b64, mime } = await paint(`A cinematic still for a music video, no people in frame. ${prompt}`, input.aspect, input.retry === true);
    const ext = /jpe?g/.test(mime) ? 'jpg' : /webp/.test(mime) ? 'webp' : 'png';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const slot = await b.createUpload(`reference.${ext}`);
    const put = await doFetch(slot.uploadUrl, { method: 'PUT', headers: { 'content-type': mime }, body: bytes });
    if (!put.ok) throw new ProviderError(`The reference could not be stored (${put.status}).`, 502);
    return { uri: slot.uri, dataUrl: `data:${mime};base64,${b64}` };
  }

  return async function handle(request) {
    const url = new URL(request.url);
    const raw = url.searchParams.get('__path') ?? url.pathname;
    const path = ('/' + raw).replace(/\/+/g, '/').replace(/^\/api(?=\/|$)/, '').replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    if (path === '/v1/health' || path === '/') return json(request, { ok: true, service: 'showtime-studio' });

    if (env.SHOWTIME_APP_KEY) {
      const given = request.headers.get('x-showtime-key') ?? url.searchParams.get('key');
      if (given !== env.SHOWTIME_APP_KEY) return json(request, { error: { message: 'That access code is not right.', code: 'BAD_ACCESS_CODE' } }, 401);
    }

    try {
      if (method === 'GET' && path === '/v1/capabilities') return json(request, await capabilities());

      if (method === 'POST' && path === '/v1/uploads') {
        const { filename } = await body(request);
        if (typeof filename !== 'string' || !/\.(mp4|mov|png|jpe?g|webp)$/i.test(filename)) throw new ProviderError('Send a filename ending in .mp4, .mov, .png, .jpg or .webp.', 400);
        return json(request, await need(beeble, 'The switch').createUpload(filename.slice(-120)));
      }

      if (method === 'PUT' && path === '/v1/uploads/proxy') {
        const target = url.searchParams.get('url') ?? '';
        if (!allowedHost(target)) throw new ProviderError('That upload address is not one this server sends files to.', 400);
        const put = await doFetch(target, { method: 'PUT', headers: { 'content-type': request.headers.get('content-type') ?? 'application/octet-stream' }, body: await request.arrayBuffer() });
        if (!put.ok) throw new ProviderError(`The upload was refused (${put.status}).`, 502);
        return json(request, { ok: true });
      }

      if (method === 'POST' && path === '/v1/switch') {
        const input = await body(request);
        if (typeof input.sourceUri !== 'string') throw new ProviderError('A switch needs sourceUri.', 400);
        const started = await need(beeble, 'The switch').startSwitch({
          sourceUri: input.sourceUri,
          prompt: typeof input.prompt === 'string' ? input.prompt : undefined,
          referenceUris: Array.isArray(input.referenceUris) ? input.referenceUris.filter((x) => typeof x === 'string') : [],
          alphaMode: ['auto', 'fill', 'select', 'custom'].includes(input.alphaMode) ? input.alphaMode : 'auto',
          alphaUri: typeof input.alphaUri === 'string' ? input.alphaUri : undefined,
          resolution: [720, 1080, 2160].includes(input.resolution) ? input.resolution : 720,
          seed: Number.isInteger(input.seed) ? input.seed : undefined,
          idempotencyKey: String(input.idempotencyKey ?? crypto.randomUUID()).slice(0, 200),
        });
        return json(request, started);
      }

      const sw = path.match(/^\/v1\/switch\/([^/]+)$/);
      if (method === 'GET' && sw) return json(request, await need(beeble, 'The switch').switchStatus(decodeURIComponent(sw[1])));

      if (method === 'POST' && path === '/v1/broll') {
        const input = await body(request);
        return json(request, await broll.start({ model: ['magi', 'omni', 'h3'].includes(input.model) ? input.model : 'magi', prompt: input.prompt, durationSec: Number(input.durationSec) || 5, aspect: input.aspect }));
      }

      const br = path.match(/^\/v1\/broll\/([^/]+)$/);
      if (method === 'GET' && br) return json(request, await broll.status(decodeURIComponent(br[1])));

      if (method === 'POST' && path === '/v1/references') return json(request, await makeReference(await body(request)));

      if (method === 'POST' && path === '/v1/upscale/upload') return json(request, await upscale.upload(await body(request)));
      if (method === 'POST' && path === '/v1/upscale') return json(request, await upscale.start(await body(request)));
      const up = path.match(/^\/v1\/upscale\/([^/]+)$/);
      if (method === 'GET' && up) return json(request, await upscale.status(decodeURIComponent(up[1])));

      if (method === 'POST' && path === '/v1/director') {
        const input = await body(request);
        const answer = await direct(need(claude, 'The director'), {
          project: input.project ?? {},
          history: Array.isArray(input.history) ? input.history : [],
          text: input.text,
          task: ['edit', 'plan'].includes(input.task) ? input.task : 'chat',
        });
        return json(request, answer);
      }

      if (method === 'GET' && path === '/v1/fetch') {
        const target = url.searchParams.get('url') ?? '';
        if (!allowedHost(target)) throw new ProviderError('That address is not a render this server hands out.', 400);
        const upstream = await doFetch(target);
        if (!upstream.ok) throw new ProviderError(`The render could not be fetched (${upstream.status}).`, 502);
        return new Response(upstream.body, {
          status: 200,
          headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'private, max-age=3600', ...cors(request) },
        });
      }

      return json(request, { error: { message: 'No such route.', code: 'NOT_FOUND' } }, 404);
    } catch (err) {
      return fail(request, err);
    }
  };
}
