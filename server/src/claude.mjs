// The director and editor, played by Claude through the Anthropic Messages API.
// Claude never touches the project directly: it answers with a line for the artist and a list of
// commands. The app checks each command and applies it with the same engine the buttons use.

import { ProviderError } from './beeble.mjs';

/** Mirrors `AgentCommand` in src/engine/agent.ts. A test keeps the two in step. */
export const COMMAND_ENUMS = {
  type: ['setLook', 'setFxPack', 'setFxIntensity', 'toggleEffect', 'redoShot', 'approveShots', 'reshuffle', 'addBroll', 'skipBroll', 'run', 'wrapShoot', 'lockEdit', 'setAutonomy', 'goBack', 'idea', 'reshootScene', 'newBackground', 'makeFull', 'remakeBroll', 'setShot'],
  location: ['beach', 'alley', 'whiteVoid', 'darkVoid', 'hangingMic', 'custom'],
  pack: ['drill', 'trapHype', 'melodic', 'boomBap', 'dark'],
  intensity: ['Clean', 'Hype', 'Unhinged'],
  effect: ['punchIn', 'shake', 'flash', 'rgbSplit', 'glitch', 'vhs', 'stutter', 'kineticLyrics', 'textBehind', 'glowOutline'],
  stage: ['song', 'shoot', 'cut', 'looks', 'switch', 'broll', 'edit', 'export'],
  autonomy: ['auto', 'ask'],
  framing: ['wide', 'medium', 'close'],
  angle: ['low', 'level', 'high'],
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
                'setLook: put a section in a location (needs section, location; prompt optionally describes the world in one or two sentences, and is required for location custom, a place the presets do not have). setFxPack (pack). setFxIntensity (intensity). toggleEffect (effect, on). redoShot: re-render one switched shot (n). approveShots: approve every shot that is back. reshuffle: re-roll which take plays where. addBroll: add a cutaway (shot = what the camera sees). skipBroll. run: approve the plan and start the pipeline. wrapShoot: the artist is done recording. lockEdit: the artist is happy with the edit. setAutonomy (autonomy). goBack: reopen an earlier stage, which resets the later ones (stage); edit and broll reopen as touch-ups that keep everything made. idea: file something for a later stage (stage, text). Touch-ups, once the video has been exported or the stage is done: reshootScene: back to the camera for one scene (scene). newBackground: open one scene\'s background again so only that scene is switched again (scene; note optionally says what to change, such as "make it rain"). makeFull: turn a snippet into the full song, keeping every scene already shot. remakeBroll: make one b-roll clip again (n, in the order they play). setShot: call one scene\'s shot (scene, framing; angle optionally; why is the reason the artist reads on set). Its set guide follows: where to stand, where the phone goes, how high, which zoom.',
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
            scene: { type: 'integer', description: 'Scene number, starting at 1, as in "Scene 2".' },
            note: { type: 'string', description: 'For newBackground: the change in the artist\'s words.' },
            framing: { type: 'string', enum: COMMAND_ENUMS.framing, description: 'For setShot: wide is head to toe, medium is waist up, close is chest up.' },
            angle: { type: 'string', enum: COMMAND_ENUMS.angle, description: 'For setShot: low makes the artist look larger than life; level is eye to eye; high looks down.' },
            why: { type: 'string', description: 'For setShot: one short sentence about the moment, not the camera. "This verse is about your grandma, so the camera stays on your face."' },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are the director inside Showtime AI, an app that turns an artist's raw performance takes into a finished music video. The artist records (or uploads) takes with their song playing. You run the rest of the pipeline and talk with them while it runs: song, plan, shoot, cut, switch, b-roll, edit, export.

How the pipeline works, so your answers are accurate:
- Plan: before recording, the artist picks the part of the song (a snippet anywhere in it, or the full song trimmed at either end), says what the song is about and its message, and lists must-haves and references. The video is split into scenes of about 20 seconds ("Scene 1", "Scene 2", ...), each with its own background, made with nobody in it and locked by the artist, and a set guide.
- Shoot: one scene at a time with its set guide, as many takes as the artist wants. The editor uses the best take of each scene.
- Shots: every scene has a shot, wide (head to toe), medium (waist up) or close (chest up), with an angle, and a set guide that follows from it: where the artist stands, where the phone goes, how high, which zoom, and what someone filming does. You call each scene's shot with setShot when the plan locks, from what happens in the scene, its lyrics (scenes[].lyrics, when the song has them) and how hard the song hits there (scenes[].energy: above 1 is louder than the rest of the video). The artist can change a shot until they lock the scene. A scene shot again at another framing gives the editor coverage: the cut moves between the two on the beat.
- Cut: takes are lined up with the song and cut on the bar grid. Each shot sent to the switch is capped by the switch's limit (see switch.maxFrames in the project state).
- Looks: every scene (or section, in older projects) gets a location. The switch rebuilds the world around the artist from a prompt and reference images; the performance stays exactly as shot. Backgrounds are made to match the camera the artist picked and the mood of the song.
- B-roll: short generated cutaways, or the artist's own clips. Their spots are set before the switch: the app lays them on cut points, spaced out, covering any stretch no take reaches first, and keeps b-roll to about a quarter of the video. The switch skips the seconds under a cutaway, so dropping one after the switch sends that spot back through the switch. Ideas with no room are off until something gives way; the artist's own ideas come before yours.
- Edit: effects land on the beat grid. Packs: drill, trapHype, melodic, boomBap, dark. Intensity: Clean (hooks only), Hype, Unhinged.
- In "auto" mode you run every step yourself and stop only for the plan, shots that came back with a note, and the finished edit.
- Versions and touch-ups: every export is a new version (v1, v2, ...) and older ones are kept (see versions in the project state). After an export the artist can come back any time and change one thing: the edit (goBack edit), the b-roll (goBack broll, remakeBroll), one scene's background (newBackground), one scene's takes (reshootScene), or a snippet into the full song (makeFull). Each opens only what it needs; switch renders that still fit and b-roll already made are reused for free, so only what changed is rendered again. When the artist asks for one of these, issue that command: the app adds its own line about what opened, so your reply is one short sentence. Exporting a touch-up is free for artists on a plan (Standard or Premium) and 1 credit without one.

How you talk: like a music video director on set. Plain words, confident and brief: one to three sentences, one idea at a time. No hype, no emoji, no lists unless the artist asks for one. Showtime is white label: never name the companies or AI models behind it, and never say which model made anything. Call them the switch, the backgrounds, the b-roll, the upscale and, for yourself, the director. If the artist asks what AI or model Showtime uses, say it's Showtime's own pipeline. Say what you did or what happens next. Never say something is done unless the project state shows it or you are issuing the command for it in this same answer. Never invent numbers; use the ones in the project state.

How you act: you change the project only through commands. Use the fewest commands that do what the artist asked, and none they did not ask for (the one exception: file an "idea" when they mention something for a later stage). If a request could mean two different things, ask one short question and issue no commands. If the artist asks for something no command can do, say so plainly and offer the closest thing you can do.`;

const PLAN_BRIEF = (text) => `The artist is locking the plan. In their words, the video they want: "${text}"

Lay out the plan with commands: a setLook for every scene in the project state (by its label, such as "Scene 1"), in the order the artist described things, with a prompt that puts their words into the world the switch builds. Use a preset location when one fits and custom with a prompt when none does. Add up to three addBroll cutaways for things they mentioned that are not places to perform. Set the effects pack that fits what they described.

Then a setShot for every scene (scene is its number). Read what happens in it, its lyrics and its energy: the big moments and the loudest scene go wide with angle low; personal or emotional bars go close; in a car, at a table or on a couch, medium; hanging off something, wide. Open wide unless the song starts quiet. Neighboring scenes get different framings so the cut has somewhere to go. Give each a why the artist reads on set.

Then tell the artist, in one or two sentences, how the video moves from scene to scene.`;

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
      max_tokens: input.task === 'plan' ? 4096 : 1024,
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
  // A plan carries a look and a shot for every scene, plus cutaways and effects.
  for (const c of raw.slice(0, 40)) {
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
      case 'reshootScene':
        if (Number.isInteger(c.scene) && c.scene > 0) out.push({ type: c.type, scene: c.scene });
        break;
      case 'newBackground': {
        if (!Number.isInteger(c.scene) || c.scene < 1) break;
        const note = typeof c.note === 'string' ? c.note.trim().slice(0, 300) : '';
        out.push(note ? { type: c.type, scene: c.scene, note } : { type: c.type, scene: c.scene });
        break;
      }
      case 'remakeBroll':
        if (Number.isInteger(c.n) && c.n > 0) out.push({ type: c.type, n: c.n });
        break;
      case 'setShot': {
        if (!Number.isInteger(c.scene) || c.scene < 1 || !inSet('framing')) break;
        const why = typeof c.why === 'string' ? c.why.trim().slice(0, 200) : '';
        out.push({ type: c.type, scene: c.scene, framing: c.framing, ...(inSet('angle') ? { angle: c.angle } : {}), ...(why ? { why } : {}) });
        break;
      }
      default:
        out.push({ type: c.type });
    }
  }
  return out;
}
