# Showtime AI

The music video agent. The artist records with the song playing, or uploads clips they already shot. The director takes it from there: sorts the takes, cuts on the beat, moves every shot into a new world with Beeble SwitchX, adds b-roll, edits with effects on the beat, and exports.

**Web app:** https://realavenchy2-pixel.github.io/showtime-ai/ (open it on a phone and add it to the home screen).

## What is real today

| Step | State |
| --- | --- |
| Song import, beat and section mapping | Real, on the device |
| Recording with the song playing, takes lined up by sound | Real (web app) |
| Uploading clips, lining them up, chopping to shot length | Real (web app) |
| Cut on the beat, live player, effects on the beat | Real |
| Export to a video file | Real, rendered on the device (web app) |
| Switch (SwitchX 3.0, or the public SwitchX when a key lacks 3.0) | Built and tested against stand-in providers. Goes live when the studio server has keys |
| B-roll (MiniMax H3, Gemini Omni), Claude as director | Same as the switch |
| Shoot plan ideas, empty locations, 3D set guides, scene-by-scene shoot, AI best-take pick, library | Real flow; location pictures are drawn stand-ins until the studio server has an image key |
| Camera looks (cinema-camera emulations) | Real: live on the web viewfinder, in the player and export, and as .cube LUTs in `assets/luts` |
| Payments, accounts | Simulated (launch plan: Stripe checkout in Safari) |

The phone app (Expo) shares every screen with the web app. Its recorder is written but not yet tested on a device, and the live switch runs from the web app for now.

## Run it

```bash
npm install
npm run web          # http://localhost:8081
npm run tunnel       # phone, through Expo Go
```

## Turn on the AI

Deploy the studio server and give it your keys: see [server/README.md](server/README.md). Keys never go in the app or in this repo.

## Project map

```
src/app/          screens (Expo Router)
src/engine/       stages, the director agent, cut, shots, effects cues, tests (no UI)
src/media/        song analysis, sync, recorder, player, export
src/live/         the connection to the studio server and the live job runner
src/components/   slate tracker, chat, recorder, stage screens
server/           the studio server: Beeble, Claude, fal
docs/BUILD_NOTES.md   decisions, provider facts, what is left
```

## Commands

```bash
npm test             # engine, media and server tests
npm run typecheck
npm run lint
npm run export:web   # web build into dist/
npm run build:pages  # web build for the GitHub Pages link
npm run server       # studio server on Node
npm run server:doctor  # check your keys without spending anything
```
