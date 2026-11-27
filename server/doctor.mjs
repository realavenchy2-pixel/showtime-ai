// Checks the keys this server would run with and prints what each one can do.
//   BEEBLE_API_KEY=... ANTHROPIC_API_KEY=... node server/doctor.mjs
// Nothing here starts a paid job.
import { createBeeble } from './src/beeble.mjs';
import { createBroll } from './src/broll.mjs';

const env = process.env;
const line = (ok, text) => console.log(`${ok ? 'ok  ' : 'MISS'} ${text}`);

if (!env.BEEBLE_API_KEY) {
  line(false, 'BEEBLE_API_KEY is not set. The switch cannot run.');
} else {
  const beeble = createBeeble({ apiKey: env.BEEBLE_API_KEY, prefer: env.SWITCHX_VERSION || undefined });
  try {
    const account = await beeble.account();
    line(true, `Beeble key works (${account.billing_type ?? 'account'} billing).`);
    const caps = await beeble.capabilities(true);
    line(true, `SwitchX: ${caps.model} through the ${caps.mode === 'product' ? 'Product API' : 'public API'}, up to ${caps.maxFrames} frames a shot, ${caps.maxRefs} reference image(s), ${caps.resolutions.join('/')}.`);
    if (caps.why) console.log(`     note: ${caps.why}`);
    if (caps.inputSchema) console.log(`     ${caps.model} inputs: ${Object.keys(caps.inputSchema.properties ?? {}).join(', ')}`);
  } catch (err) {
    line(false, `Beeble: ${err instanceof Error ? err.message : err}`);
  }
}

if (!env.ANTHROPIC_API_KEY) {
  line(false, 'ANTHROPIC_API_KEY is not set. The director falls back to its built-in replies.');
} else {
  const res = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } });
  const want = env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  if (!res.ok) line(false, `Claude key was refused (${res.status}).`);
  else {
    const ids = ((await res.json()).data ?? []).map((m) => m.id);
    line(ids.includes(want), ids.includes(want) ? `Claude key works; the director runs on ${want}.` : `Claude key works, but ${want} is not in its model list. Set CLAUDE_MODEL to one of: ${ids.slice(0, 6).join(', ')}`);
  }
}

const models = createBroll({ falKey: env.FAL_KEY, geminiKey: env.GEMINI_API_KEY, falOmniModel: env.FAL_OMNI_MODEL }).models();
line(models.length > 0, models.length ? `B-roll models: ${models.join(', ')}.` : 'No b-roll key (FAL_KEY or GEMINI_API_KEY). B-roll stays simulated.');
line(!!env.FAL_KEY, env.FAL_KEY ? 'Topaz upscale on fal: 1440p and 4K exports are sharpened, not just stretched.' : 'No FAL_KEY: 1440p and 4K exports are off.');
line(!!env.OPENAI_API_KEY, env.OPENAI_API_KEY ? 'OpenAI key set: reference frames can be generated.' : 'OPENAI_API_KEY is not set. Looks run from the prompt and your own reference images.');
line(!!env.SHOWTIME_APP_KEY, env.SHOWTIME_APP_KEY ? 'Access code is set.' : 'SHOWTIME_APP_KEY is not set: anyone with the server address can spend your credits.');
