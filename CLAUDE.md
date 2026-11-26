@AGENTS.md

# Showtime AI

A music video agent. The artist records with the song playing (or uploads clips) and the director runs eight stages to an exported video: song, plan (stage id `looks`), shoot, cut, switch, b-roll, edit, export. Before recording, the artist locks the plan in three steps (`PlanBrief`): the part of the song (Snippet with a smart pick, or Full song trimmed; `pickPart`), what the song is about and its message, then must-haves and references; the director lays it out in ~20-second scenes. Projects made before the wizard still place the video on the first take (`placeVideo`). Recording, the cut, effects and export are real on the web app. The switch, b-roll and Claude go live through the studio server in `server/`; without one they are simulated in `src/engine`. Read `docs/BUILD_NOTES.md` first and keep its checklist current.

The v3 flow (see BUILD_NOTES): first open shows real before-and-afters (`welcome`, `examples`), every video is paid. New video asks for the path (Let AI direct, optionally approving each step, or Work with my vision). The plan step is "Let's lock in the shoot plan": ideas from the song, the artist's own, or a video link. Locking it makes 2 background options per scene (1 to 4, no artist) that the artist picks, changes by typing and locks, plus a set guide with props for every scene (`production.ts`); the shoot is scene by scene with takes and locks, and the AI editor's best take carries each scene. Camera looks are modeled on cinema cameras (`cameraLooks.ts`, LUTs in `assets/luts`, rebuilt with `node scripts/make-luts.ts`).

## Before you call a task done

```bash
npm test            # engine, media and server tests (vitest)
npm run typecheck
npm run export:web  # when a change touches web-only files or app.json
```

## Engine rules

- `src/engine` has no UI imports. Project state changes only through the pure transitions in `actions.ts`; screens call `useApp().apply(id, fn)` with one of them.
- Every transition that finishes a stage posts a director message, and `withIntro` posts the next stage's intro. Keep the director's voice: plain, confident, one idea per message.
- B-roll is organized before the switch, in `broll.ts`. `arrangeBroll` lays kept cutaways on the cut (gaps covered first, the artist's ideas before the director's, spaced out, about a quarter of the video at most); `buildShots` sends only on-screen performance to SwitchX; `missingShots` switches a spot whose cutaway was dropped or failed. Call `arrangeBroll` after any change to the cut, the range or the ideas.
- Provider limits live in `switchx.ts` and mirror Beeble SwitchX; a live project takes its limits from the server (`connectLive`). Don't change them without checking the provider.
- The director acts only through `AgentCommand` (`agent.ts`). The server's Claude tool mirrors that list; a server test fails if they drift.
- Every export is a version (`versions.ts`); touch-ups (`touchup.ts`) reopen one thing after an export. Nothing paid for is thrown away: `revisit` banks approved switch renders (`saveRenders`) and keeps b-roll clips made, and the switch reuses renders that still fit the same take, scene and look. Keep `lookKey` in step with anything new that changes a render.
- Add or update a test in `src/engine/__tests__` for any engine change.

## Design rules

- Use the tokens in `src/theme/tokens.ts`. Don't add colors.
- Showtime pink (`color.accent`) is only for the one thing to do now. REC red is only for recording.
- Type matches the Figma file "Showtime AI — App Design": Sora for display (`display`, `title`, `label`, `heading`) and Inter for everything you read, both through the `T` component.
- Pressables use `Press`, which scales to 0.97 in 120 ms. Buttons use `Button` (primary, secondary, quiet).
- Copy is sentence case and says what happens: "Start recording", "Approve all 30 shots".

## Platform notes

- Web variants live beside native files as `.web.tsx` (camera, tabs, fonts).
- Import icons only from `@/components/icons`; add new ones there as per-icon imports. Importing `lucide-react-native` directly pulls every icon into the web bundle.
- `app.json` sets `asyncRoutes.web` to false so the web build is one bundle. The hosted preview depends on that.

## Secrets

No API keys in the app or the repo, ever. The studio server holds them; the app holds only the server address and an access code.
