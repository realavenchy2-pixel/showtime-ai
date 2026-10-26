# Showtime AI

The AI music video studio. Record your verse to the beat, pick where the video takes place, add effects, and export, with a director in the chat walking you through every stage.

This repo is **Phase 1: a clickable prototype of the whole flow on sample data.** Nothing calls a paid API yet. Every render is simulated with the same limits the real providers have.

## Run it

**On a laptop or Chromebook (Linux):**

```bash
npm install
npm run web
```

Then open http://localhost:8081.

**On your phone with Expo Go:**

```bash
npm install
npm run tunnel
```

Scan the QR code with the Expo Go app on Android, or with the Camera app on iPhone. The live camera and haptics only work on a phone.

## What's in the prototype

- The 11 stages: song, record, rough cut, location, switch, genjutsu (optional), b-roll (optional), VFX, final, resize, export.
- The slate tracker at the top of every project. It claps when a stage finishes, and any finished stage can be reopened.
- The director chat. It says what's next, answers questions about time, cost, skipping and redoing, and files ideas into the right stage.
- The recorder: a count-in on the beat, a lyric prompter and the take plan.
- Three sample projects: *Out the Mud* (mid-switch), *Late Night Freestyle* (recording) and *Windy City* (finished).
- Tutorials, credits, plans and the paywall (purchases are simulated).

## What's simulated

| In the prototype | In Phase 2 |
| --- | --- |
| Takes are saved as data, not video | Real takes uploaded and lined up with the song |
| Track mapping on a timer | Beat and section detection, lyric timing |
| Plates, switch, swaps, b-roll | Beeble SwitchX, GPT Image plates, Higgsfield, Google Omni or H3 |
| Effects, final, resize, export | The render pipeline, Beeble resize, Topaz upscale |
| Credits and plans | Stripe |

The switch already plays by the real rules: shots are cut every 4 bars, each shot is capped at 240 frames at 24 fps, and 5 render at a time.

## Phase 2

API keys never go in the app. Phase 2 adds a small server that holds the keys and runs the jobs. The app keeps its screens: each simulated job in `src/engine/actions.ts` (`advance`) becomes a server job that reports progress through the same transitions.

## Project map

```
src/app/          screens (Expo Router)
src/engine/       stage machine, director, sample data and tests (no UI)
src/components/   slate tracker, chat, recorder and stage screens
src/theme/        colors, type and spacing
src/lib/          helpers shared by screens
```

## Commands

```bash
npm run web          # web preview
npm run tunnel       # phone preview through Expo Go
npm test             # engine tests
npm run typecheck    # TypeScript
npm run export:web   # build the web version into dist/
```
