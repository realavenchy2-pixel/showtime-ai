// The director and editor, played by Claude through the Anthropic Messages API.
// Claude never touches the project directly: it answers with a line for the artist and a list of
// commands. The app checks each command and applies it with the same engine the buttons use.

import { ProviderError } from './beeble.mjs';

/** Mirrors `AgentCommand` in src/engine/agent.ts. A test keeps the two in step. */
export const COMMAND_ENUMS = {
  type: ['setLook', 'setFxPack', 'setFxIntensity', 'toggleEffect', 'redoShot', 'approveShots', 'reshuffle', 'addBroll', 'skipBroll', 'run', 'wrapShoot', 'lockEdit', 'setAutonomy', 'goBack', 'idea'],
  location: ['beach', 'alley', 'whiteVoid', 'darkVoid', 'hangingMic', 'custom'],
  pack: ['drill', 'trapHype', 'melodic', 'boomBap', 'dark'],
  intensity: ['Clean', 'Hype', 'Unhinged'],
  effect: ['punchIn', 'shake', 'flash', 'rgbSplit', 'glitch', 'vhs', 'stutter', 'kineticLyrics', 'textBehind', 'glowOutline'],
  stage: ['song', 'shoot', 'cut', 'looks', 'switch', 'broll', 'edit', 'export'],
  autonomy: ['auto', 'ask'],
};

const TOOL = {
  name: 'direct',
  description: 'Answer the artist and, when they asked for a change, issue the commands that make it.',
  input_schema: {
    type: 'object',
    required: ['reply', 'commands'],
    properties: {
      reply: { type: 'string', description: 'What you say to the artist. One to three short sentences.' },
      commands: {
        type: 'array',
        description: 'Changes to make now. Empty when the artist only asked a question.',
        items: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: COMMAND_ENUMS.type,
              description:
                'setLook: put a section in a location (needs section, location; prompt optionally describes the world in one or two sentences, and is required for location custom, a place the presets do not have). setFxPack (pack). setFxIntensity (intensity). toggleEffect (effect, on). redoShot: re-render one switched shot (n). approveShots: approve every shot that is back. reshuffle: re-roll which take plays where. addBroll: add a cutaway (shot = what the camera sees). skipBroll. run: approve the plan and start the pipeline. wrapShoot: the artist is done recording. lockEdit: the artist is happy with the edit. setAutonomy (autonomy). goBack: reopen an earlier stage, which resets the later ones (stage). idea: file something for a later stage (stage, text).',
            },
            section: { type: 'string', description: 'A section id, a section label such as "Verse 1", a kind such as "hook" or "verses", or "all".' },
            location: { type: 'string', enum: COMMAND_ENUMS.location },
            prompt: { type: 'string', description: 'For setLook: the world SwitchX builds around the artist, in plain words. Where it is, the light, what moves.' },
            pack: { type: 'string', enum: COMMAND_ENUMS.pack },
            intensity: { type: 'string', enum: COMMAND_ENUMS.intensity },
            effect: { type: 'string', enum: COMMAND_ENUMS.effect },
            on: { type: 'boolean' },
            n: { type: 'integer', description: 'Shot number, starting at 1.' },
            shot: { type: 'string', description: 'For addBroll: one sentence describing what the camera sees and how it moves.' },
            autonomy: { type: 'string', enum: COMMAND_ENUMS.autonomy },
            stage: { type: 'string', enum: COMMAND_ENUMS.stage },
            text: { type: 'string' },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are the director inside Showtime AI, an app that turns an artist's raw performance takes into a finished music video. The artist records (or uploads) takes with their song playing. You run the rest of the pipeline and talk with them while it runs: song, plan, shoot, cut, switch, b-roll, edit, export.

How the pipeline works, so your answers are accurate:
- Plan: before recording, the artist describes the video and picks a snippet (about 30 seconds) or the full song. The video is split into scenes of about 20 seconds ("Scene 1", "Scene 2", ...), each with its own look. The artist picks where the video starts right before the first take; the plan moves with it.
- Cut: takes are lined up with the song and cut on the bar grid. Each shot sent to the switch is capped by the SwitchX version in use (see switch.maxFrames in the project state).
- Looks: every scene (or section, in older projects) gets a location. SwitchX rebuilds the world around the artist from a prompt and reference images; the performance stays exactly as shot.
- B-roll: short generated cutaways placed in the verses. Hooks stay on the performance.
- Edit: effects land on the beat grid. Packs: drill, trapHype, melodic, boomBap, dark. Intensity: Clean (hooks only), Hype, Unhinged.
- In "auto" mode you run every step yourself and stop only for the plan, shots that came back with a note, and the finished edit.

How you talk: like a music video director on set. Plain words, confident and brief: one to three sentences, one idea at a time. No hype, no emoji, no lists unless the artist asks for one. Say what you did or what happens next. Never say something is done unless the project state shows it or you are issuing the command for it in this same answer. Never invent numbers; use the ones in the project state.

How you act: you change the project only through commands. Use the fewest commands that do what the artist asked, and none they did not ask for (the one exception: file an "idea" when they mention something for a later stage). If a request could mean two different things, ask one short question and issue no commands. If the artist asks for something no command can do, say so plainly and offer the closest thing you can do.`;

const PLAN_BRIEF = (text) => `The artist is locking the plan. In their words, the video they want: "${text}"

Lay out the plan with commands: a setLook for every scene in the project state (by its label, such as "Scene 1"), in the order the artist described things, with a prompt that puts their words into the world SwitchX builds. Use a preset location when one fits and custom with a prompt when none does. Add up to three addBroll cutaways for things they mentioned that are not places to perform. Set the effects pack that fits what they described. Then tell the artist, in one or two sentences, how the video moves from scene to scene.`;

const EDIT_BRIEF = `The artist has not asked anything. Review the edit plan against the song's vibe, tempo and sections, and set the effects pack, intensity and individual effects you would cut this video with. Add at most two b-roll ideas if the verses need them. Then tell the artist, in two sentences, what you chose and why.`;

/**
 * @param {{ apiKey: string, model?: string, fetch?: typeof fetch, base?: string }} cfg
 * @param {{ project: object, history?: { from: string, text: string }[], text?: string, task?: 'chat' | 'edit' | 'plan' }} input
 * @returns {Promise<{ reply: string, commands: object[], model: string }>}
 */
export async function direct(cfg, input) {
  const doFetch = cfg.fetch ?? globalThis.fetch;
  const model = cfg.model || 'claude-sonnet-5-5';
  const history = (input.history ?? [])
    .slice(-12)
    .map((m) => `${m.from === 'user' ? 'Artist' : 'Director'}: ${m.text}`)
    .join('\n');
  const said = String(input.text ?? '').slice(0, 2000);
  const ask = input.task === 'edit' ? EDIT_BRIEF : input.task === 'plan' ? PLAN_BRIEF(said) : `The artist says: ${said}`;
  const content = [
    `<project>\n${JSON.stringify(input.project)}\n</project>`,
    history ? `<conversation>\n${history}\n</conversation>` : '',
    ask,
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await doFetch(`${(cfg.base ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: input.task === 'plan' ? 2048 : 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'direct' },
    }),
  });
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ProviderError(data?.error?.message ?? `Claude answered ${res.status}`, res.status, data?.error?.type);

  const use = (data?.content ?? []).find((b) => b.type === 'tool_use' && b.name === 'direct');
  if (!use) {
    const text = (data?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    return { reply: text || 'Say that again?', commands: [], model };
  }
  return { reply: String(use.input?.reply ?? '').trim(), commands: cleanCommands(use.input?.commands), model };
}

/** Drops anything that is not a well-formed command, so a bad answer can't reach the engine. */
export function cleanCommands(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw.slice(0, 12)) {
    if (!c || typeof c !== 'object' || !COMMAND_ENUMS.type.includes(c.type)) continue;
    const inSet = (key) => COMMAND_ENUMS[key].includes(c[key]);
    switch (c.type) {
      case 'setLook': {
        const prompt = typeof c.prompt === 'string' ? c.prompt.trim().slice(0, 600) : '';
        if (typeof c.section !== 'string' || !inSet('location') || (c.location === 'custom' && !prompt)) break;
        out.push(prompt ? { type: c.type, section: c.section, location: c.location, prompt } : { type: c.type, section: c.section, location: c.location });
        break;
      }
      case 'setFxPack':
        if (inSet('pack')) out.push({ type: c.type, pack: c.pack });
        break;
      case 'setFxIntensity':
        if (inSet('intensity')) out.push({ type: c.type, intensity: c.intensity });
        break;
      case 'toggleEffect':
        if (inSet('effect')) out.push({ type: c.type, effect: c.effect, on: c.on !== false });
        break;
      case 'redoShot':
        if (Number.isInteger(c.n) && c.n > 0) out.push({ type: c.type, n: c.n });
        break;
      case 'addBroll':
        if (typeof c.shot === 'string' && c.shot.trim()) out.push({ type: c.type, shot: c.shot.trim().slice(0, 300) });
        break;
      case 'setAutonomy':
        if (inSet('autonomy')) out.push({ type: c.type, autonomy: c.autonomy });
        break;
      case 'goBack':
        if (inSet('stage')) out.push({ type: c.type, stage: c.stage });
        break;
      case 'idea':
        if (inSet('stage') && typeof c.text === 'string' && c.text.trim()) out.push({ type: c.type, stage: c.stage, text: c.text.trim().slice(0, 300) });
        break;
      default:
        out.push({ type: c.type });
    }
  }
  return out;
}
