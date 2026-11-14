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

## Status

See the checklist at the bottom of this file. Keep it current.

## Checklist

- [x] Demo beats with real audio
- [ ] Engine v2 passing tests
- [ ] Song import and beat mapping (web)
- [ ] Recorder with the song playing, takes saved and synced (web)
- [ ] Clip upload, sync and chop
- [ ] Player: multicam cut with effects on the beat
- [ ] Export on device (web)
- [ ] Studio, plan card, Switch screen modeled on SwitchX
- [ ] Server and live wiring
- [ ] Deployed to gh-pages, pushed to main
