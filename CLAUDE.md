@AGENTS.md

# Showtime AI

An AI music video studio. The artist records to the beat, and a director in the chat walks them through 11 stages to an exported video. Phase 1 is a prototype on sample data; every provider job is simulated in `src/engine`.

## Before you call a task done

```bash
npm test            # engine tests (vitest)
npm run typecheck
npm run export:web  # when a change touches web-only files or app.json
```

## Engine rules

- `src/engine` has no UI imports. Project state changes only through the pure transitions in `actions.ts`; screens call `useApp().apply(id, fn)` with one of them.
- Every transition that finishes a stage posts a director message, and `withIntro` posts the next stage's intro. Keep the director's voice: plain, confident, one idea per message.
- Provider limits live in `actions.ts` (`FPS`, `MAX_SHOT_FRAMES`, `SWITCH_CONCURRENCY`, `HANDLE_SEC`). They mirror Beeble SwitchX. Don't change them without checking the provider.
- Add or update a test in `src/engine/__tests__` for any engine change.

## Design rules

- Use the tokens in `src/theme/tokens.ts`. Don't add colors.
- Tungsten (`color.tungsten`) is only for the one thing to do now. REC red is only for recording.
- Display type is Big Shoulders Display through the `T` component (`display`, `title`, `label`); body text is the system font.
- Pressables use `Press`, which scales to 0.97 in 120 ms. Buttons use `Button` (primary, secondary, quiet).
- Copy is sentence case and says what happens: "Start recording", "Approve all 30 shots".

## Platform notes

- Web variants live beside native files as `.web.tsx` (camera, tabs, fonts).
- Import icons only from `@/components/icons`; add new ones there as per-icon imports. Importing `lucide-react-native` directly pulls every icon into the web bundle.
- `app.json` sets `asyncRoutes.web` to false so the web build is one bundle. The hosted preview depends on that.

## Secrets

No API keys in the app, ever. Phase 2 adds a server that holds the keys and runs the jobs.
