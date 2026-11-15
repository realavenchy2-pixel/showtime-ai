# Build notes: v2, the music video agent

Working notes for whoever picks this build up next (including a later Claude session). Update as work lands.

## What v2 is

The artist brings the song and the raw clips. The director (agent) does the rest and stops only where it needs the artist.

Pipeline, 8 stages: `song → shoot → cut → looks → switch → broll → edit → export`.

- **Shoot** is Triller-style: the song plays while the camera records. Clips can also be uploaded; they are lined up with the song and chopped into shots the switch accepts.
- **Switch** is Beeble SwitchX. 3.0 takes 360 frames a shot (15 s at 24 fps) and up to 4 reference images. If a key does not have 3.0, the server falls back to the public SwitchX API (240 frames, 1 reference).
- **B-roll** is Gemini Omni or MiniMax H3. **Director and edit** are Claude.
- In `auto` mode the director runs every step it owns. The artist approves the plan ("Run it"), fixes flagged shots, watches the edit, and exports.

## Where things live

- `src/engine/` pure project model and transitions (no UI). `agent.ts` is the autopilot and the command vocabulary the chat (and later Claude) uses. `fx.ts` builds effect cues on the beat grid. `switchx.ts` holds provider limits and costs.
- `src/media/` real media: song analysis, take sync, recorder, player (WebGL compositor), export. Web first; native files are best-effort.
- `server/` the key-holding API (Beeble, Claude, optional fal/OpenAI/Google). Not deployed yet.
- `scripts/make-demo-beats.py` synthesizes the three original demo beats in `assets/audio/`.

## Facts checked on 2026-11-13

- SwitchX 3.0 app limits: 360 frames per generation, up to 60 fps source, MP4/MOV, 720/1080/2160, 4 references, output keeps source fps and aspect. Credits per started 30 frames: 6 (720p), 20 (1080p), 80 (2160p).
- Public SwitchX API (`POST https://api.beeble.ai/v1/switchx/generations`, header `x-api-key`): max 240 frames, 720 or 1080, alpha modes auto/fill/select/custom, uploads via `POST /v1/uploads` then PUT. $0.10 (720p) or $0.30 (1080p) per 30 frames. Returns `output.render` and `output.alpha`.
- Beeble Product API (`/v1/products/{product}/jobs`, credits) exposes `switchx-3.0`; the input schema is only visible with a key (`GET /v1/products/{product}/models`).
- The web app is live from the `gh-pages` branch: https://realavenchy2-pixel.github.io/showtime-ai/

## How to test and deploy

- `npm test`, `npm run typecheck`, `npm run lint`.
- Browser run with a fake camera: `python3 <scratchpad>/tools/e2e.py` (Playwright, starts its own server on `dist`).
- Deploy the web app: `npm run build:pages`, copy `dist/` into the `gh-pages` worktree (`/home/claude/showtime-pages`), commit, push.
- Work happens on the `v2` branch. `main` still holds the first prototype until v2 is merged.

## Status

Keep the checklist current. A session can end without warning.

## Checklist

- [x] Demo beats with real audio
- [x] Engine v2 passing tests
- [x] Song import and beat mapping (web)
- [x] Recorder with the song playing, takes saved and synced (web)
- [x] Clip upload, sync and chop
- [x] Player: multicam cut with effects on the beat
- [x] Export on device (web)
- [x] Studio, plan card, Switch screen modeled on SwitchX
- [x] Deployed to gh-pages (first v2 build)
- [x] Phone fix: song starts after the count-in and during export (primed inside the tap)
- [x] Export verified with a real file check (headless run drops frames at 1080p; an offline frame-by-frame export is the fix)
- [x] Server (`server/`) and live wiring (`src/live/`): SwitchX 3.0 through the Product API, public API fallback, Claude director, fal H3 b-roll. Verified end to end against stand-in providers (`tools/e2e_live.py` + `tools/mock_studio.mjs` in the scratchpad), not yet against real keys
- [x] Brand: the artist's pink S logo, accent `#FD1B55` (icons are upscaled from a 300 px crop; ask for the vector)
- [x] Artist-first front half: no genre pick (effects pack defaults by tempo), the stage checklist scrolls
- [x] No verse or hook: the director lays the video out in ~20-second scenes on whole bars (`scenesFor`, `Section.scene`)
- [x] Plan box before the shoot: "Describe what you want to shoot" plus Snippet (about 30 seconds) or Full video. `lockPlan` reads the words into scenes, cutaways and a pack (`planFromBrief`); with the studio server, Claude plans it (`task: 'plan'`, `setLook` with `custom` and a prompt)
- [x] Start point right before recording: slide along the song while it plays and let go, or hit Start here. The first take places the video (`placeVideo`); later takes stay inside it
- [ ] First run with real keys: `npm run server:doctor`, then one short switch
- [ ] Offline export (every frame, any device speed), generated reference frames, Select/custom mattes, native live switch
- [ ] v2 merged to main
