import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createApp, plainWords } from '../src/app.mjs';
import { createBeeble, normalizeStatus, productInputs } from '../src/beeble.mjs';
import { createBroll } from '../src/broll.mjs';
import { cleanCommands, COMMAND_ENUMS, direct } from '../src/claude.mjs';
import { createUpscale } from '../src/upscale.mjs';
import { FX_EFFECTS, FX_PACKS } from '../../src/engine/fx';
import { LOCATIONS } from '../../src/engine/samples';
import { STAGES } from '../../src/engine/stages';

/** A fake provider: answers from a route table and remembers every call. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = String(url);
    const method = (init.method ?? 'GET').toUpperCase();
    let body;
    try {
      body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    } catch {
      body = init.body;
    }
    calls.push({ url: u, method, headers: init.headers ?? {}, body });
    for (const [key, answer] of Object.entries(routes)) {
      const [m, pattern] = key.split(' ');
      if (m === method && u.includes(pattern)) {
        const out = typeof answer === 'function' ? answer({ url: u, body }) : answer;
        const status = out?.__status ?? 200;
        const payload = out?.__status ? out.body : out;
        return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ detail: 'not found' }), { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

const PRODUCT_ROUTES = {
  'GET /v1/product-access': { context: 'personal', eligible: true, approved: true, products: ['switchx'] },
  'GET /v1/products/switchx/models': {
    models: [
      { id: 'switchx-2.0', name: 'SwitchX 2.0', input_schema: { properties: { source_uri: {}, prompt: {}, reference_image_uri: {}, alpha_mode: {}, max_resolution: { type: 'integer' } } } },
      {
        id: 'switchx-3.0',
        name: 'SwitchX 3.0',
        input_schema: { properties: { source_uri: {}, prompt: {}, reference_image_uris: { type: 'array' }, alpha_mode: {}, alpha_uri: {}, resolution: { type: 'string', enum: ['720p', '1080p', '2160p'] }, seed: {} } },
      },
    ],
  },
  'GET /v1/products': { products: [{ id: 'switchx', name: 'SwitchX', billing_units: ['credits'] }, { id: 'switchx_finish', name: 'Finish', billing_units: ['credits'] }] },
};

describe('Beeble: which SwitchX a key can run', () => {
  it('uses 3.0 through the Product API when the key has it', async () => {
    const fetch = fakeFetch(PRODUCT_ROUTES);
    const caps = await createBeeble({ apiKey: 'k', fetch }).capabilities();
    expect(caps).toMatchObject({ mode: 'product', product: 'switchx', model: 'switchx-3.0', maxFrames: 360, maxRefs: 4, finishProduct: 'switchx_finish' });
    expect(caps.resolutions).toEqual([720, 1080, 2160]);
    expect(fetch.calls.every((c) => c.headers['x-api-key'] === 'k')).toBe(true);
  });

  it('falls back to the public SwitchX API when the Product API is closed to the key', async () => {
    const fetch = fakeFetch({ 'GET /v1/product-access': { context: 'personal', eligible: false, approved: false, blocked_reason: 'free' } });
    const caps = await createBeeble({ apiKey: 'k', fetch }).capabilities();
    expect(caps).toMatchObject({ mode: 'public', model: 'switchx', maxFrames: 240, maxRefs: 1 });
    expect(caps.why).toContain('free');
  });

  it('falls back when the Product API errors, but not when the key itself is bad', async () => {
    const down = fakeFetch({ 'GET /v1/product-access': { __status: 500, body: { detail: 'boom' } } });
    expect((await createBeeble({ apiKey: 'k', fetch: down }).capabilities()).mode).toBe('public');
    const bad = fakeFetch({ 'GET /v1/product-access': { __status: 401, body: { detail: 'Invalid API key' } } });
    await expect(createBeeble({ apiKey: 'k', fetch: bad }).capabilities()).rejects.toThrow('Invalid API key');
  });

  it('drops to 2.0 when 3.0 is not listed yet', async () => {
    const routes = { ...PRODUCT_ROUTES, 'GET /v1/products/switchx/models': { models: [{ id: 'switchx-2.0', name: 'SwitchX 2.0', input_schema: {} }] } };
    const caps = await createBeeble({ apiKey: 'k', fetch: fakeFetch(routes) }).capabilities();
    expect(caps).toMatchObject({ mode: 'product', model: 'switchx-2.0', maxFrames: 240 });
  });

  it('asks Beeble once and remembers the answer', async () => {
    const fetch = fakeFetch(PRODUCT_ROUTES);
    const beeble = createBeeble({ apiKey: 'k', fetch });
    await beeble.capabilities();
    const n = fetch.calls.length;
    await beeble.capabilities();
    expect(fetch.calls.length).toBe(n);
  });
});

describe('Beeble: starting and reading a switch', () => {
  const job = { sourceUri: 'beeble://uploads/u1/shot.mp4', prompt: 'Night alley', referenceUris: ['beeble://uploads/r1/a.png', 'beeble://uploads/r2/b.png'], alphaMode: 'auto', resolution: 2160, idempotencyKey: 'shot-1' };

  it('sends 3.0 jobs to the Product API with the model\'s own field names', async () => {
    const fetch = fakeFetch({ ...PRODUCT_ROUTES, 'POST /v1/products/switchx/jobs': { id: 'pj_1', product: 'switchx', model_id: 'switchx-3.0', status: 'queued', created_at: 'now' } });
    const started = await createBeeble({ apiKey: 'k', fetch }).startSwitch(job);
    expect(started).toEqual({ id: 'p:pj_1', model: 'switchx-3.0', status: 'queued' });
    const sent = fetch.calls.at(-1).body;
    expect(sent).toMatchObject({ model_id: 'switchx-3.0', billing_unit: 'credits', idempotency_key: 'shot-1' });
    expect(sent.inputs).toEqual({ source_uri: job.sourceUri, prompt: 'Night alley', reference_image_uris: job.referenceUris, alpha_mode: 'auto', resolution: '2160p' });
  });

  it('sends public jobs in the documented shape: one reference, 1080 at most', async () => {
    const fetch = fakeFetch({ 'GET /v1/product-access': { eligible: false }, 'POST /v1/switchx/generations': { id: 'swx_9', status: 'in_queue' } });
    const started = await createBeeble({ apiKey: 'k', fetch }).startSwitch(job);
    expect(started).toEqual({ id: 's:swx_9', model: 'switchx', status: 'queued' });
    expect(fetch.calls.at(-1).body).toEqual({
      generation_type: 'video',
      source_uri: job.sourceUri,
      prompt: 'Night alley',
      reference_image_uri: job.referenceUris[0],
      alpha_mode: 'auto',
      max_resolution: 1080,
      idempotency_key: 'shot-1',
    });
  });

  it('refuses a switch with no prompt and no reference', async () => {
    const fetch = fakeFetch({ 'GET /v1/product-access': { eligible: false } });
    await expect(createBeeble({ apiKey: 'k', fetch }).startSwitch({ sourceUri: 'x', idempotencyKey: 'a' })).rejects.toThrow('prompt or a reference');
  });

  it('reads both kinds of job into one shape', async () => {
    const fetch = fakeFetch({
      'GET /v1/switchx/generations/swx_9': { id: 'swx_9', status: 'completed', progress: 100, output: { render: 'https://cdn.beeble.ai/r.mp4', alpha: 'https://cdn.beeble.ai/a.mp4' } },
      'GET /v1/product-jobs/pj_1': { id: 'pj_1', status: 'processing', progress: 0.4, outputs: {} },
      'GET /v1/product-jobs/pj_2': { id: 'pj_2', status: 'succeeded', progress: 100, outputs: { render: { url: 'https://cdn.beeble.ai/p.mp4' }, alpha_url: 'https://cdn.beeble.ai/pa.mp4' }, credits_charged: 72 },
      'GET /v1/product-jobs/pj_3': { id: 'pj_3', status: 'failed', error: { message: 'Source too long' } },
    });
    const beeble = createBeeble({ apiKey: 'k', fetch });
    expect(await beeble.switchStatus('s:swx_9')).toMatchObject({ status: 'ready', progress: 1, renderUrl: 'https://cdn.beeble.ai/r.mp4', alphaUrl: 'https://cdn.beeble.ai/a.mp4' });
    expect(await beeble.switchStatus('p:pj_1')).toMatchObject({ status: 'rendering', progress: 0.4 });
    expect(await beeble.switchStatus('p:pj_2')).toMatchObject({ status: 'ready', progress: 1, renderUrl: 'https://cdn.beeble.ai/p.mp4', alphaUrl: 'https://cdn.beeble.ai/pa.mp4', creditsCharged: 72 });
    expect(await beeble.switchStatus('p:pj_3')).toMatchObject({ status: 'failed', error: 'Source too long' });
  });

  it('maps provider status words', () => {
    expect(['in_queue', 'pending', 'processing', 'running', 'completed', 'succeeded', 'failed', 'cancelled'].map(normalizeStatus)).toEqual(['queued', 'queued', 'rendering', 'rendering', 'ready', 'ready', 'failed', 'failed']);
  });

  it('falls back to the public field names when a model publishes no schema', () => {
    expect(productInputs(undefined, { sourceUri: 's', prompt: 'p', referenceUris: ['r'], alphaMode: 'fill', resolution: 720 })).toEqual({
      source_uri: 's',
      generation_type: 'video',
      prompt: 'p',
      reference_image_uri: 'r',
      alpha_mode: 'fill',
      max_resolution: 720,
    });
  });
});

describe('The studio server', () => {
  const env = { BEEBLE_API_KEY: 'bk', ANTHROPIC_API_KEY: 'ak', FAL_KEY: 'fk', SHOWTIME_APP_KEY: 'door' };
  const get = (app, path, headers = { 'x-showtime-key': 'door' }) => app(new Request(`https://studio.test${path}`, { headers }));
  const post = (app, path, body, headers = { 'x-showtime-key': 'door' }) =>
    app(new Request(`https://studio.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));

  it('answers health without the access code and everything else only with it', async () => {
    const app = createApp(env, { fetch: fakeFetch(PRODUCT_ROUTES) });
    expect((await get(app, '/v1/health', {})).status).toBe(200);
    const locked = await get(app, '/v1/capabilities', {});
    expect(locked.status).toBe(401);
    expect((await locked.json()).error.code).toBe('BAD_ACCESS_CODE');
    expect((await get(app, '/v1/capabilities')).status).toBe(200);
  });

  it('reports what it can run', async () => {
    const app = createApp(env, { fetch: fakeFetch(PRODUCT_ROUTES) });
    expect(await (await get(app, '/v1/capabilities')).json()).toMatchObject({
      ok: true,
      switch: { provider: 'beeble', mode: 'product', model: 'switchx-3.0', maxFrames: 360, maxRefs: 4 },
      broll: ['h3'],
      director: { model: 'claude-sonnet-5-5' },
      references: false,
      upscale: ['clean', 'detail'],
      locked: true,
    });
  });

  it('routes the same under /api and through the Vercel rewrite', async () => {
    const app = createApp(env, { fetch: fakeFetch(PRODUCT_ROUTES) });
    expect((await get(app, '/api/v1/capabilities')).status).toBe(200);
    expect((await get(app, '/api?__path=/v1/capabilities')).status).toBe(200);
    expect((await get(app, '/v1/nope')).status).toBe(404);
  });

  it('answers CORS preflights', async () => {
    const app = createApp(env, { fetch: fakeFetch({}) });
    const res = await app(new Request('https://studio.test/v1/switch', { method: 'OPTIONS', headers: { origin: 'https://realavenchy2-pixel.github.io' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toContain('x-showtime-key');
  });

  it('says so when a provider is not set up', async () => {
    const app = createApp({}, { fetch: fakeFetch({}) });
    const res = await post(app, '/v1/switch', { sourceUri: 'beeble://x' }, {});
    expect(res.status).toBe(501);
    expect((await res.json()).error.code).toBe('NOT_CONFIGURED');
    expect(await (await get(app, '/v1/capabilities', {})).json()).toMatchObject({ switch: null, broll: [], director: null, locked: false });
  });

  it('hands out upload slots and checks the file type', async () => {
    const fetch = fakeFetch({ 'POST /v1/uploads': { id: 'upload_1', upload_url: 'https://s3.amazonaws.com/put-here', beeble_uri: 'beeble://uploads/upload_1/shot.mp4' } });
    const app = createApp(env, { fetch });
    expect(await (await post(app, '/v1/uploads', { filename: 'shot.mp4' })).json()).toEqual({ id: 'upload_1', uploadUrl: 'https://s3.amazonaws.com/put-here', uri: 'beeble://uploads/upload_1/shot.mp4' });
    expect((await post(app, '/v1/uploads', { filename: 'notes.txt' })).status).toBe(400);
  });

  it('starts a switch and reports its status', async () => {
    const fetch = fakeFetch({
      'GET /v1/product-access': { eligible: false },
      'POST /v1/switchx/generations': { id: 'swx_1', status: 'in_queue' },
      'GET /v1/switchx/generations/swx_1': { id: 'swx_1', status: 'processing', progress: 35 },
    });
    const app = createApp(env, { fetch });
    const started = await (await post(app, '/v1/switch', { sourceUri: 'beeble://uploads/u/s.mp4', prompt: 'Beach at dusk', resolution: 720, idempotencyKey: 'k1' })).json();
    expect(started).toEqual({ id: 's:swx_1', model: 'switchx', status: 'queued' });
    expect(await (await get(app, `/v1/switch/${encodeURIComponent(started.id)}`)).json()).toMatchObject({ status: 'rendering', progress: 0.35 });
  });

  it('only passes through renders from known hosts', async () => {
    const fetch = fakeFetch({ 'GET cdn.beeble.ai': 'video-bytes' });
    const app = createApp(env, { fetch });
    expect((await get(app, `/v1/fetch?url=${encodeURIComponent('https://cdn.beeble.ai/r.mp4')}`)).status).toBe(200);
    expect((await get(app, `/v1/fetch?url=${encodeURIComponent('https://evil.example.com/x')}`)).status).toBe(400);
    expect((await get(app, `/v1/fetch?url=${encodeURIComponent('http://cdn.beeble.ai/r.mp4')}`)).status).toBe(400);
  });

  it('hides a bad provider key behind a 502 so the app does not ask for a new access code', async () => {
    const fetch = fakeFetch({ 'GET /v1/product-access': { __status: 401, body: { detail: 'Invalid API key' } } });
    const app = createApp(env, { fetch });
    const res = await post(app, '/v1/switch', { sourceUri: 'beeble://u/s.mp4', prompt: 'x' });
    expect(res.status).toBe(502);
  });
});

describe('Backgrounds', () => {
  const keys = { BEEBLE_API_KEY: 'bk', OPENAI_API_KEY: 'ok', GEMINI_API_KEY: 'gk', SHOWTIME_APP_KEY: 'door' };
  const post = (app, body) =>
    app(new Request('https://studio.test/v1/references', { method: 'POST', headers: { 'content-type': 'application/json', 'x-showtime-key': 'door' }, body: JSON.stringify(body) }));
  const PNG = btoa('png-bytes');
  const routes = (over = {}) => ({
    'POST api.openai.com/v1/images/generations': { data: [{ b64_json: PNG }] },
    'POST generativelanguage.googleapis.com/v1beta/interactions': { steps: [{ type: 'model_output', content: [{ type: 'image', mime_type: 'image/jpeg', data: btoa('jpg-bytes') }] }] },
    'POST /v1/uploads': { id: 'u1', upload_url: 'https://s3.amazonaws.com/put', beeble_uri: 'beeble://uploads/u1/reference' },
    'PUT s3.amazonaws.com/put': { ok: true },
    ...over,
  });
  const painted = (fetch) => fetch.calls.filter((c) => /images\/generations|interactions/.test(c.url));

  it('paints the first round with Sunburst 2.6 at high quality', async () => {
    const fetch = fakeFetch(routes());
    const res = await post(createApp(keys, { fetch }), { prompt: 'A rooftop at night', aspect: '16:9' });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toEqual({ uri: 'beeble://uploads/u1/reference', dataUrl: `data:image/png;base64,${PNG}` });
    const calls = painted(fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ model: 'gpt-image-2.6-sunburst', quality: 'high', size: '1536x1024' });
    expect(calls[0].body.prompt).toMatch(/no people in frame\. A rooftop at night/);
  });

  it('sends a redo to Nano Banana Pro first', async () => {
    const fetch = fakeFetch(routes());
    const out = await (await post(createApp(keys, { fetch }), { prompt: 'A rooftop at night. Change: make it rain', aspect: '16:9', retry: true })).json();
    const calls = painted(fetch);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('interactions?key=gk');
    expect(calls[0].body).toMatchObject({ model: 'gemini-3-pro-image', response_format: { type: 'image', aspect_ratio: '16:9', image_size: '2K' } });
    expect(out.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    // Stored with the right type for the switch.
    expect(fetch.calls.find((c) => c.url.includes('/v1/uploads'))?.body).toEqual({ filename: 'reference.jpg' });
  });

  it('falls back to the other model when one fails, and works with either key alone', async () => {
    const down = fakeFetch(routes({ 'POST api.openai.com/v1/images/generations': { __status: 500, body: { error: { message: 'OpenAI is overloaded' } } } }));
    const res = await post(createApp(keys, { fetch: down }), { prompt: 'A beach', aspect: '16:9' });
    expect(res.status).toBe(200);
    expect(painted(down).map((c) => (c.url.includes('openai') ? 'default' : 'backup'))).toEqual(['default', 'backup']);

    const googleOnly = fakeFetch(routes());
    const app = createApp({ ...keys, OPENAI_API_KEY: undefined }, { fetch: googleOnly });
    expect((await post(app, { prompt: 'A beach', aspect: '16:9' })).status).toBe(200);
    expect(painted(googleOnly)[0].url).toContain('interactions');
    const caps = await (await app(new Request('https://studio.test/v1/capabilities', { headers: { 'x-showtime-key': 'door' } }))).json();
    expect(caps.references).toBe(true);
  });

  it('never names a model or company in what it tells the app', async () => {
    const both = fakeFetch(
      routes({
        'POST api.openai.com/v1/images/generations': { __status: 429, body: { error: { message: 'OpenAI rate limit for gpt-image-2.6-sunburst' } } },
        'POST generativelanguage.googleapis.com/v1beta/interactions': { __status: 429, body: { error: { message: 'Gemini quota exceeded' } } },
      }),
    );
    const res = await post(createApp(keys, { fetch: both }), { prompt: 'A beach', aspect: '16:9' });
    const { error } = await res.json();
    expect(error.message).not.toMatch(/openai|gpt|sunburst|gemini|google|nano banana/i);
    const none = await (await post(createApp({ SHOWTIME_APP_KEY: 'door' }, { fetch: fakeFetch({}) }), { prompt: 'x' })).json();
    expect(none.error.message).toBe('The switch is not set up on this server yet.');
    expect(plainWords('Beeble says SwitchX 3.0 is busy; Topaz Starlight failed; claude-sonnet-5-5 timed out')).toBe('the switch says the switch is busy; the upscaler failed; the director timed out');
  });
});

describe('The director (Claude)', () => {
  const answer = (input) => ({ content: [{ type: 'tool_use', name: 'direct', id: 't1', input }], stop_reason: 'tool_use' });

  it('asks Claude with a forced tool and returns the reply plus clean commands', async () => {
    const fetch = fakeFetch({
      'POST /v1/messages': answer({
        reply: 'Hooks go to the beach.',
        commands: [{ type: 'setLook', section: 'hook', location: 'beach' }, { type: 'setLook', section: 'hook', location: 'moon' }, { type: 'launchRockets' }, { type: 'redoShot', n: 7 }],
      }),
    });
    const out = await direct({ apiKey: 'ak', fetch }, { project: { title: 'Out the Mud' }, history: [{ from: 'user', text: 'yo' }], text: 'put the hooks on the beach and redo shot 7' });
    expect(out.reply).toBe('Hooks go to the beach.');
    expect(out.commands).toEqual([{ type: 'setLook', section: 'hook', location: 'beach' }, { type: 'redoShot', n: 7 }]);
    const call = fetch.calls[0];
    expect(call.headers).toMatchObject({ 'x-api-key': 'ak', 'anthropic-version': '2023-06-01' });
    expect(call.body.tool_choice).toEqual({ type: 'tool', name: 'direct' });
    expect(call.body.model).toBe('claude-sonnet-5-5');
    expect(call.body.messages[0].content).toContain('Out the Mud');
    expect(call.body.messages[0].content).toContain('put the hooks on the beach');
  });

  it('plans the video from the artist\'s description', async () => {
    const fetch = fakeFetch({
      'POST /v1/messages': answer({
        reply: 'Rooftop first, then the white room.',
        commands: [{ type: 'setLook', section: 'Scene 1', location: 'custom', prompt: 'A rooftop at night over the city.' }, { type: 'setLook', section: 'Scene 2', location: 'whiteVoid' }],
      }),
    });
    const out = await direct({ apiKey: 'ak', fetch }, { project: { title: 'Out the Mud' }, text: 'rooftop at night then a white room', task: 'plan' });
    expect(out.commands).toHaveLength(2);
    const content = fetch.calls[0].body.messages[0].content;
    expect(content).toContain('locking the plan');
    expect(content).toContain('rooftop at night then a white room');
    expect(fetch.calls[0].body.max_tokens).toBe(2048);
  });

  it('surfaces a Claude error', async () => {
    const fetch = fakeFetch({ 'POST /v1/messages': { __status: 429, body: { error: { type: 'rate_limit_error', message: 'Slow down' } } } });
    await expect(direct({ apiKey: 'ak', fetch }, { project: {}, text: 'hi' })).rejects.toThrow('Slow down');
  });

  it('drops malformed commands', () => {
    expect(cleanCommands('nope')).toEqual([]);
    expect(cleanCommands([{ type: 'setLook', section: 'Scene 1', location: 'custom' }, { type: 'setLook', section: 'Scene 2', location: 'custom', prompt: ' A rooftop at dawn. ' }])).toEqual([
      { type: 'setLook', section: 'Scene 2', location: 'custom', prompt: 'A rooftop at dawn.' },
    ]);
    expect(cleanCommands([{ type: 'toggleEffect', effect: 'shake' }, { type: 'addBroll', shot: '  ' }, { type: 'goBack', stage: 'mars' }, { type: 'run', extra: 1 }])).toEqual([{ type: 'toggleEffect', effect: 'shake', on: true }, { type: 'run' }]);
  });

  it('keeps well-formed touch-ups and drops the rest', () => {
    expect(
      cleanCommands([
        { type: 'reshootScene', scene: 2 },
        { type: 'reshootScene', scene: 0 },
        { type: 'newBackground', scene: 1, note: ' make it rain ' },
        { type: 'newBackground', scene: 'one' },
        { type: 'makeFull' },
        { type: 'remakeBroll', n: 'x' },
        { type: 'remakeBroll', n: 3 },
      ]),
    ).toEqual([{ type: 'reshootScene', scene: 2 }, { type: 'newBackground', scene: 1, note: 'make it rain' }, { type: 'makeFull' }, { type: 'remakeBroll', n: 3 }]);
  });

  it('knows the same commands, looks, packs, effects and stages as the app', () => {
    const agent = readFileSync(new URL('../../src/engine/agent.ts', import.meta.url), 'utf8');
    const union = agent.slice(agent.indexOf('export type AgentCommand ='), agent.indexOf('export interface CommandResult'));
    const types = [...union.matchAll(/type: '(\w+)'/g)].map((m) => m[1]);
    expect([...COMMAND_ENUMS.type].sort()).toEqual([...types].sort());
    expect([...COMMAND_ENUMS.location].sort()).toEqual([...LOCATIONS.map((l) => l.id), 'custom'].sort());
    expect([...COMMAND_ENUMS.pack].sort()).toEqual(FX_PACKS.map((p) => p.id).sort());
    expect([...COMMAND_ENUMS.effect].sort()).toEqual(FX_EFFECTS.map((e) => e.id).sort());
    expect([...COMMAND_ENUMS.stage].sort()).toEqual(STAGES.map((s) => s.id).sort());
  });
});

describe('B-roll', () => {
  it('queues H3 on fal and reads the finished clip', async () => {
    const fetch = fakeFetch({
      'POST queue.fal.run/minimax/h3/text-to-video': { request_id: 'r1', status_url: 'https://queue.fal.run/minimax/h3/requests/r1/status', response_url: 'https://queue.fal.run/minimax/h3/requests/r1' },
      'GET /requests/r1/status': { status: 'COMPLETED' },
      'GET /requests/r1': { video: { url: 'https://v3b.fal.media/files/clip.mp4' } },
    });
    const broll = createBroll({ falKey: 'fk', fetch });
    expect(broll.models()).toEqual(['h3']);
    const started = await broll.start({ model: 'omni', prompt: 'Rain on a window', durationSec: 3.4, aspect: '9:16' });
    expect(started).toMatchObject({ status: 'queued', model: 'h3' });
    expect(fetch.calls[0].headers.Authorization).toBe('Key fk');
    expect(fetch.calls[0].body).toEqual({ prompt: 'Rain on a window', duration: 5, resolution: '768P', aspect_ratio: '9:16', prompt_expansion_mode: 'fast' });
    expect(await broll.status(started.id)).toEqual({ id: started.id, status: 'ready', url: 'https://v3b.fal.media/files/clip.mp4' });
  });

  it('offers Omni when a Gemini key is set, and nothing when no key is', () => {
    expect(createBroll({ geminiKey: 'g' }).models()).toEqual(['omni']);
    expect(createBroll({}).models()).toEqual([]);
  });

  it('runs MAGI-2 on Higgsfield first: 1080p, up to 30 seconds, no generated sound', async () => {
    const status = 'https://api.higgsfield.ai/requests/req1/status';
    let state = { status: 'in_progress', request_id: 'req1' };
    const fetch = fakeFetch({
      'POST api.higgsfield.ai/sand/magi-2/text-to-video': { status: 'queued', request_id: 'req1', status_url: status, cancel_url: 'https://api.higgsfield.ai/requests/req1/cancel' },
      'GET /requests/req1/status': () => state,
    });
    const broll = createBroll({ higgsfieldKey: 'kid:secret', falKey: 'fk', geminiKey: 'g', fetch });
    expect(broll.models()).toEqual(['magi', 'h3', 'omni']);
    const started = await broll.start({ model: 'magi', prompt: 'Chrome rims spinning in the rain', durationSec: 42, aspect: '9:16' });
    expect(started).toMatchObject({ status: 'queued', model: 'magi' });
    expect(fetch.calls[0].headers.Authorization).toBe('Key kid:secret');
    expect(fetch.calls[0].body).toEqual({ prompt: 'Chrome rims spinning in the rain', duration: 30, resolution: '1080p', aspect_ratio: '9:16', generate_audio: false });
    expect(await broll.status(started.id)).toMatchObject({ status: 'rendering' });
    state = { status: 'completed', request_id: 'req1', video: { url: 'https://cdn.higgsfield.ai/out/clip.mp4' } };
    expect(await broll.status(started.id)).toEqual({ id: started.id, status: 'ready', url: 'https://cdn.higgsfield.ai/out/clip.mp4' });
    state = { status: 'nsfw', request_id: 'req1' };
    expect(await broll.status(started.id)).toMatchObject({ status: 'failed' });
    // A redo asks for the Google backup, and gets it.
    const google = fakeFetch({ 'POST generativelanguage.googleapis.com/v1beta/interactions': { steps: [{ content: [{ type: 'video', mime_type: 'video/mp4', data: 'AAAA' }] }] } });
    const backup = await createBroll({ higgsfieldKey: 'kid:secret', geminiKey: 'g', fetch: google }).start({ model: 'omni', prompt: 'Rims again', durationSec: 5, aspect: '9:16' });
    expect(backup).toMatchObject({ status: 'ready', model: 'omni' });
  });

  it('takes the Higgsfield key as one value or as an id and secret, and passes its clips through', async () => {
    const app = createApp({ HF_API_KEY_ID: 'kid', HF_API_KEY_SECRET: 'sec', SHOWTIME_APP_KEY: 'door' }, { fetch: fakeFetch({ 'GET cdn.higgsfield.ai': 'video-bytes' }) });
    const caps = await (await app(new Request('https://studio.test/v1/capabilities', { headers: { 'x-showtime-key': 'door' } }))).json();
    expect(caps.broll).toEqual(['magi']);
    const clip = await app(new Request(`https://studio.test/v1/fetch?url=${encodeURIComponent('https://cdn.higgsfield.ai/out/clip.mp4')}`, { headers: { 'x-showtime-key': 'door' } }));
    expect(clip.status).toBe(200);
  });
});

describe('Upscale', () => {
  const queued = (name) => ({
    request_id: name,
    status_url: `https://queue.fal.run/fal-ai/topaz/requests/${name}/status`,
    response_url: `https://queue.fal.run/fal-ai/topaz/requests/${name}`,
  });

  it('hands out a signed upload slot in fal storage', async () => {
    const fetch = fakeFetch({ 'POST /storage/upload/initiate': { upload_url: 'https://v3b.fal.media/upload/abc?sig=1', file_url: 'https://v3b.fal.media/files/abc/video.mp4' } });
    const up = createUpscale({ falKey: 'fk', fetch });
    expect(await up.upload({ filename: 'video.mp4', contentType: 'video/mp4' })).toEqual({ uploadUrl: 'https://v3b.fal.media/upload/abc?sig=1', fileUrl: 'https://v3b.fal.media/files/abc/video.mp4' });
    expect(fetch.calls[0].url).toBe('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3');
    expect(fetch.calls[0].headers.Authorization).toBe('Key fk');
    expect(fetch.calls[0].body).toEqual({ content_type: 'video/mp4', file_name: 'video.mp4' });
    await expect(up.upload({ filename: 'notes.txt' })).rejects.toThrow(/mp4/);
  });

  it('runs Proteus for the clean look and Starlight for max detail, both in H.264', async () => {
    const fetch = fakeFetch({
      'POST queue.fal.run/fal-ai/topaz/upscale/video': queued('c1'),
      'POST queue.fal.run/topaz/upscale/video/generative': queued('d1'),
    });
    const up = createUpscale({ falKey: 'fk', fetch });
    expect(up.looks()).toEqual(['clean', 'detail']);
    const clean = await up.start({ videoUrl: 'https://v3b.fal.media/files/abc/video.mp4', factor: 2 });
    expect(clean).toMatchObject({ status: 'queued', look: 'clean' });
    expect(fetch.calls[0].body).toEqual({ video_url: 'https://v3b.fal.media/files/abc/video.mp4', model: 'Proteus', upscale_factor: 2, H264_output: true });
    const detail = await up.start({ videoUrl: 'https://v3b.fal.media/files/abc/video.mp4', factor: 4 / 3, look: 'detail' });
    expect(detail.look).toBe('detail');
    expect(fetch.calls[1].url).toBe('https://queue.fal.run/topaz/upscale/video/generative');
    expect(fetch.calls[1].body).toEqual({ video_url: 'https://v3b.fal.media/files/abc/video.mp4', upscale_factor: 1.333, H264_output: true });
  });

  it('only upscales files fal holds, by 1 to 4 times', async () => {
    const up = createUpscale({ falKey: 'fk', fetch: fakeFetch({}) });
    await expect(up.start({ videoUrl: 'https://example.com/video.mp4', factor: 2 })).rejects.toThrow(/fal storage/);
    await expect(up.start({ videoUrl: 'https://v3b.fal.media/files/a.mp4', factor: 6 })).rejects.toThrow(/between 1 and 4/);
    await expect(up.status('u:' + btoa(JSON.stringify(['https://evil.test/s', 'https://evil.test/r'])))).rejects.toThrow(/Unexpected/);
    await expect(up.status('nope')).rejects.toThrow(/Unknown/);
  });

  it('reports where the upscale stands and hands back the finished file', async () => {
    let state = 'IN_QUEUE';
    const fetch = fakeFetch({
      'POST queue.fal.run/fal-ai/topaz/upscale/video': queued('c1'),
      'GET /requests/c1/status': () => ({ status: state }),
      'GET /requests/c1': { video: { url: 'https://v3b.fal.media/files/out/upscaled.mp4' } },
    });
    const up = createUpscale({ falKey: 'fk', fetch });
    const { id } = await up.start({ videoUrl: 'https://v3b.fal.media/files/abc/video.mp4', factor: 2 });
    expect((await up.status(id)).status).toBe('queued');
    state = 'IN_PROGRESS';
    expect((await up.status(id)).status).toBe('rendering');
    state = 'COMPLETED';
    expect(await up.status(id)).toEqual({ id, status: 'ready', url: 'https://v3b.fal.media/files/out/upscaled.mp4' });
  });

  it('says so when the upscale fails or fal is not set up', async () => {
    const fetch = fakeFetch({
      'POST queue.fal.run/fal-ai/topaz/upscale/video': queued('c2'),
      'GET /requests/c2/status': { status: 'FAILED', error: 'Video too long' },
    });
    const up = createUpscale({ falKey: 'fk', fetch });
    const { id } = await up.start({ videoUrl: 'https://v3b.fal.media/files/abc/video.mp4', factor: 2 });
    expect(await up.status(id)).toEqual({ id, status: 'failed', error: 'Video too long' });
    const off = createUpscale({});
    expect(off.looks()).toEqual([]);
    await expect(off.upload({ filename: 'video.mp4' })).rejects.toMatchObject({ status: 501 });
  });

  it('serves the upscale under the access code', async () => {
    const fetch = fakeFetch({
      'POST /storage/upload/initiate': { upload_url: 'https://v3b.fal.media/upload/x', file_url: 'https://v3b.fal.media/files/x/video.mp4' },
      'POST queue.fal.run/fal-ai/topaz/upscale/video': queued('c3'),
      'GET /requests/c3/status': { status: 'COMPLETED' },
      'GET /requests/c3': { video: { url: 'https://v3b.fal.media/files/out/c3.mp4' } },
    });
    const app = createApp({ FAL_KEY: 'fk', SHOWTIME_APP_KEY: 'door' }, { fetch });
    const call = (method, path, body) =>
      app(new Request(`https://studio.test${path}`, { method, headers: { 'content-type': 'application/json', 'x-showtime-key': 'door' }, body: body ? JSON.stringify(body) : undefined }));
    const slot = await (await call('POST', '/v1/upscale/upload', { filename: 'video.mp4', contentType: 'video/mp4' })).json();
    expect(slot.fileUrl).toBe('https://v3b.fal.media/files/x/video.mp4');
    const job = await (await call('POST', '/v1/upscale', { videoUrl: slot.fileUrl, factor: 2, look: 'clean' })).json();
    const done = await (await call('GET', `/v1/upscale/${encodeURIComponent(job.id)}`)).json();
    expect(done).toMatchObject({ status: 'ready', url: 'https://v3b.fal.media/files/out/c3.mp4' });
    const locked = await app(new Request('https://studio.test/v1/upscale', { method: 'POST', body: '{}' }));
    expect(locked.status).toBe(401);
    const bare = createApp({}, { fetch: fakeFetch({}) });
    const off = await bare(new Request('https://studio.test/v1/upscale/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'video.mp4' }) }));
    expect(off.status).toBe(501);
  });
});
