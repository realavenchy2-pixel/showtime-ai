@AGENTS.md

# Showtime AI

A music video agent. The artist records with the song playing (or uploads clips) and the director runs eight stages to an exported video: song, plan (stage id `looks`), shoot, cut, switch, b-roll, edit, export. Before recording, the artist locks the plan: describes the video in their words and picks Snippet or Full video; the director lays it out in ~20-second scenes. Where the video starts is picked in the recorder right before the first take, and that take places the video (`placeVideo`). Recording, the cut, effects and export are real on the web app. The switch, b-roll and Claude go live through the studio server in `server/`; without one they are simulated in `src/engine`. Read `docs/BUILD_NOTES.md` first and keep its checklist current.

## Before you call a task done

```bash
npm test            # engine, media and server tests (vitest)
npm run typecheck
npm run export:web  # when a change touches web-only files or app.json
```

## Engine rules

- `src/engine` has no UI imports. Project state changes only through the pure transitions in `actions.ts`; screens call `useApp().apply(id, fn)` with one of them.
- Every transition that finishes a stage posts a director message, and `withIntro` posts the next stage's intro. Keep the director's voice: plain, confident, one idea per message.
- Provider limits live in `switchx.ts` and mirror Beeble SwitchX; a live project takes its limits from the server (`connectLive`). Don't change them without checking the provider.
- The director acts only through `AgentCommand` (`agent.ts`). The server's Claude tool mirrors that list; a server test fails if they drift.
- Add or update a test in `src/engine/__tests__` for any engine change.

## Design rules

- Use the tokens in `src/theme/tokens.ts`. Don't add colors.
- Showtime pink (`color.accent`) is only for the one thing to do now. REC red is only for recording.
- Display type is Big Shoulders Display through the `T` component (`display`, `title`, `label`); body text is the system font.
- Pressables use `Press`, which scales to 0.97 in 120 ms. Buttons use `Button` (primary, secondary, quiet).
- Copy is sentence case and says what happens: "Start recording", "Approve all 30 shots".

## Platform notes

- Web variants live beside native files as `.web.tsx` (camera, tabs, fonts).
- Import icons only from `@/components/icons`; add new ones there as per-icon imports. Importing `lucide-react-native` directly pulls every icon into the web bundle.
- `app.json` sets `asyncRoutes.web` to false so the web build is one bundle. The hosted preview depends on that.

## Secrets

No API keys in the app or the repo, ever. The studio server holds them; the app holds only the server address and an access code.
