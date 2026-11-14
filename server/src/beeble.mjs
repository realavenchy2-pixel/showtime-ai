// Beeble client: uploads and SwitchX.
//
// SwitchX 3.0 lives on Beeble's Product API (`/v1/products/{product}/jobs`, billed in credits) and is
// only open to keys whose account has it. Every key can use the public SwitchX API
// (`/v1/switchx/generations`, billed in dollars). This client asks Beeble what the key can run, uses
// 3.0 when it is there, and otherwise falls back to the newest version that is.
//
// Field names follow https://api.beeble.ai/developer-api-docs/openapi.json (read 2026-11-13).

export const SWITCH_LIMITS = {
  'switchx-3.0': { maxFrames: 360, maxRefs: 4, resolutions: [720, 1080, 2160] },
  'switchx-2.0': { maxFrames: 240, maxRefs: 1, resolutions: [720, 1080] },
  public: { maxFrames: 240, maxRefs: 1, resolutions: [720, 1080] },
};

export class ProviderError extends Error {
  /** @param {string} message @param {number} status @param {string} [code] */
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Reads whatever error shape the API sent back. */
function errorText(body, fallback) {
  if (!body) return fallback;
  if (typeof body === 'string') return body.slice(0, 300);
  const d = body.detail ?? body.error ?? body.message;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') return d.message ?? d.code ?? JSON.stringify(d).slice(0, 300);
  return fallback;
}

function list(body, ...keys) {
  if (Array.isArray(body)) return body;
  for (const k of keys) if (Array.isArray(body?.[k])) return body[k];
  return [];
}

/** Maps any provider status word onto the four the app knows. */
export function normalizeStatus(status) {
  const s = String(status ?? '').toLowerCase();
  if (/fail|error|cancel|reject|expired/.test(s)) return 'failed';
  if (/complete|succe|done|finished/.test(s)) return 'ready';
  if (/queue|pending|created|waiting|scheduled/.test(s)) return 'queued';
  return 'rendering';
}

function firstUrl(outputs, keys, pattern) {
  if (!outputs || typeof outputs !== 'object') return undefined;
  for (const k of keys) {
    const v = outputs[k];
    if (typeof v === 'string' && v.startsWith('http')) return v;
    if (v && typeof v === 'object' && typeof v.url === 'string') return v.url;
  }
  for (const [k, v] of Object.entries(outputs)) {
    if (typeof v === 'string' && v.startsWith('http') && pattern.test(k)) return v;
  }
  return undefined;
}

/**
 * Builds the `inputs` object for a product job from the model's own input schema, so the request
 * uses whatever field names that model publishes.
 */
export function productInputs(schema, job) {
  const props = schema?.properties ?? {};
  const known = Object.keys(props).length > 0;
  const has = (k) => !known || k in props;
  const pick = (...names) => names.find((n) => n in props) ?? names[0];
  const inputs = {};

  inputs[pick('source_uri', 'source', 'source_video_uri', 'video_uri', 'input_uri')] = job.sourceUri;
  if (has('generation_type')) inputs.generation_type = 'video';
  if (job.prompt && has('prompt')) inputs.prompt = job.prompt.slice(0, 2000);

  const refs = job.referenceUris ?? [];
  if (refs.length) {
    const many = ['reference_image_uris', 'reference_images', 'reference_uris', 'references'].find((n) => n in props);
    if (many) inputs[many] = refs;
    else if (has('reference_image_uri')) inputs.reference_image_uri = refs[0];
  }

  if (has('alpha_mode')) inputs.alpha_mode = job.alphaMode ?? 'auto';
  if (job.alphaUri && has('alpha_uri')) inputs.alpha_uri = job.alphaUri;

  const resKey = ['max_resolution', 'resolution', 'output_resolution', 'target_resolution'].find((n) => n in props) ?? (known ? undefined : 'max_resolution');
  if (resKey) {
    const def = props[resKey] ?? {};
    const options = def.enum ?? def.anyOf?.flatMap((x) => x.enum ?? []) ?? [];
    const asText = def.type === 'string' || options.some((o) => typeof o === 'string');
    inputs[resKey] = asText ? (options.find((o) => String(o).startsWith(String(job.resolution))) ?? `${job.resolution}p`) : job.resolution;
  }
  if (job.seed != null && has('seed')) inputs.seed = job.seed;
  return inputs;
}

/**
 * @param {{ apiKey: string, fetch?: typeof fetch, base?: string, now?: () => number, prefer?: string }} opts
 * `prefer` forces a SwitchX version: `switchx-3.0`, `switchx-2.0` or `public`.
 */
export function createBeeble(opts) {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const base = (opts.base ?? 'https://api.beeble.ai').replace(/\/$/, '');
  const now = opts.now ?? Date.now;
  let cached;

  async function call(method, path, body) {
    const res = await doFetch(base + path, {
      method,
      headers: { 'x-api-key': opts.apiKey, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const code = typeof data?.detail === 'object' ? data.detail.code : data?.code;
      throw new ProviderError(errorText(data, `Beeble answered ${res.status}`), res.status, code);
    }
    return data;
  }

  /** Works out which SwitchX this key can run. The answer is kept for ten minutes. */
  async function capabilities(force = false) {
    if (!force && cached && now() - cached.at < 10 * 60 * 1000) return cached.value;
    const value = await discover();
    cached = { at: now(), value };
    return value;
  }

  async function discover() {
    const publicApi = { mode: 'public', model: 'switchx', ...SWITCH_LIMITS.public, why: undefined };
    if (opts.prefer === 'public') return { ...publicApi, why: 'Set to the public SwitchX API.' };
    try {
      const access = await call('GET', '/v1/product-access');
      if (access && access.eligible === false) {
        return { ...publicApi, why: `Product API is not open for this key (${access.blocked_reason ?? 'not eligible'}).` };
      }
      const products = list(await call('GET', '/v1/products'), 'products', 'data', 'items');
      const product = products.find((p) => /switchx/i.test(p.id) && !/finish/i.test(p.id));
      if (!product) return { ...publicApi, why: 'SwitchX is not among this key\'s products.' };
      const models = list(await call('GET', `/v1/products/${encodeURIComponent(product.id)}/models`), 'models', 'data', 'items');
      const want = opts.prefer && opts.prefer !== 'public' ? [opts.prefer] : ['switchx-3.0', 'switchx-2.0'];
      const model = want.map((id) => models.find((m) => m.id === id)).find(Boolean);
      if (!model) return { ...publicApi, why: `No SwitchX model listed for this key (saw: ${models.map((m) => m.id).join(', ') || 'none'}).` };
      const limits = SWITCH_LIMITS[model.id] ?? SWITCH_LIMITS['switchx-2.0'];
      const finish = products.find((p) => /finish/i.test(p.id));
      return { mode: 'product', product: product.id, finishProduct: finish?.id, model: model.id, inputSchema: model.input_schema, ...limits, why: undefined };
    } catch (err) {
      // 401 means the key itself is bad; anything else just means the Product API is not for this key.
      if (err instanceof ProviderError && err.status === 401) throw err;
      return { ...publicApi, why: `Product API unavailable: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return {
    capabilities,

    account: () => call('GET', '/v1/account/info'),

    /** A one-hour upload slot. PUT the file to `uploadUrl`, then use `uri` as a source or reference. */
    async createUpload(filename) {
      const up = await call('POST', '/v1/uploads', { filename });
      return { id: up.id, uploadUrl: up.upload_url, uri: up.beeble_uri };
    },

    /**
     * Starts one switch.
     * @param {{ sourceUri: string, prompt?: string, referenceUris?: string[], alphaMode?: string, alphaUri?: string, resolution?: number, seed?: number, idempotencyKey: string }} job
     */
    async startSwitch(job) {
      const caps = await capabilities();
      const resolution = Math.min(job.resolution ?? 720, Math.max(...caps.resolutions));
      const refs = (job.referenceUris ?? []).slice(0, caps.maxRefs);
      if (!job.prompt && refs.length === 0) throw new ProviderError('A switch needs a prompt or a reference image.', 400, 'NO_DIRECTION');

      if (caps.mode === 'product') {
        const created = await call('POST', `/v1/products/${encodeURIComponent(caps.product)}/jobs`, {
          model_id: caps.model,
          inputs: productInputs(caps.inputSchema, { ...job, referenceUris: refs, resolution }),
          billing_unit: 'credits',
          idempotency_key: job.idempotencyKey,
        });
        return { id: `p:${created.id}`, model: caps.model, status: normalizeStatus(created.status) };
      }

      const created = await call('POST', '/v1/switchx/generations', {
        generation_type: 'video',
        source_uri: job.sourceUri,
        prompt: job.prompt ? job.prompt.slice(0, 2000) : undefined,
        reference_image_uri: refs[0],
        alpha_mode: job.alphaMode ?? 'auto',
        alpha_uri: job.alphaUri,
        max_resolution: resolution,
        seed: job.seed,
        idempotency_key: job.idempotencyKey,
      });
      return { id: `s:${created.id}`, model: 'switchx', status: normalizeStatus(created.status) };
    },

    /** Where a switch stands. `renderUrl` and `alphaUrl` are signed links that expire after 72 hours. */
    async switchStatus(id) {
      const [kind, raw] = [id.slice(0, 1), id.slice(2)];
      if (kind === 'p') {
        const j = await call('GET', `/v1/product-jobs/${encodeURIComponent(raw)}`);
        const p = typeof j.progress === 'number' ? (j.progress > 1 ? j.progress / 100 : j.progress) : undefined;
        return {
          id,
          status: normalizeStatus(j.status),
          progress: p,
          renderUrl: firstUrl(j.outputs, ['render', 'video', 'output', 'render_url', 'video_url', 'url'], /render|video|output/i),
          alphaUrl: firstUrl(j.outputs, ['alpha', 'alpha_url', 'matte'], /alpha|matte/i),
          error: j.error ? errorText(j.error, 'The switch failed.') : undefined,
          creditsCharged: j.credits_charged ?? undefined,
        };
      }
      const j = await call('GET', `/v1/switchx/generations/${encodeURIComponent(raw)}`);
      return {
        id,
        status: normalizeStatus(j.status),
        progress: typeof j.progress === 'number' ? j.progress / 100 : undefined,
        renderUrl: j.output?.render ?? undefined,
        alphaUrl: j.output?.alpha ?? undefined,
        error: j.error ?? undefined,
      };
    },
  };
}
