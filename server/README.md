# Studio server

Holds the provider keys and runs the AI steps for the app. The app only ever knows this server's address and an access code.

## Put it online with Vercel

1. Go to vercel.com and sign in with GitHub.
2. Add New, Project, then import `showtime-ai`.
3. Open Environment Variables and add the keys below.
4. Deploy. The address Vercel gives you is the web app with the AI turned on; the server answers under `/api`.

| Name | What it is | Needed |
| --- | --- | --- |
| `BEEBLE_API_KEY` | Beeble key. Runs the switch. | Yes |
| `SHOWTIME_APP_KEY` | An access code you make up. People type it under Account to use your server. | Yes |
| `ANTHROPIC_API_KEY` | Claude key. Claude answers in the chat. | For the director |
| `FAL_KEY` | fal key. B-roll on MiniMax H3, and the Topaz upscale for 1440p and 4K exports. | For b-roll and 1440p/4K |
| `GEMINI_API_KEY` | Google key. B-roll on Gemini Omni. | Optional |
| `SWITCHX_VERSION` | Force a version: `switchx-3.0`, `switchx-2.0` or `public`. | Optional |
| `CLAUDE_MODEL` | Defaults to `claude-sonnet-5-5`. | Optional |
| `FAL_UPSCALE_MODEL` | The clean upscale. Defaults to `fal-ai/topaz/upscale/video` (Topaz Proteus). | Optional |
| `FAL_UPSCALE_DETAIL_MODEL` | The max-detail upscale. Defaults to `topaz/upscale/video/generative` (Topaz Starlight). | Optional |

Never paste a key into chat or commit one. They live only in the host's settings.

## Which SwitchX runs

The server asks Beeble what the key can do. If the account has SwitchX 3.0 on the Product API, shots are up to 360 frames (15 seconds at 24 fps) with up to four reference images. If not, it uses the public SwitchX API: 240 frames (10 seconds) and one reference. The app cuts its shots to whichever limit the server reports.

## 1440p and 4K

The app renders the video on the device at up to 1080p, then sends the file straight to fal storage (a signed upload, so big files never pass through this server). The server asks Topaz on fal to upscale it, and the app downloads the result and keeps the original audio. Two looks: Proteus (clean, true to the footage) and Starlight (rebuilds fine detail, costs more on fal). Without `FAL_KEY`, 1440p and 4K can't be picked in the app.

## Check your keys

```bash
BEEBLE_API_KEY=... ANTHROPIC_API_KEY=... FAL_KEY=... npm run server:doctor
```

It starts no paid job. It prints which SwitchX the key can run and, for 3.0, the input fields Beeble lists for it.

## Other hosts

- Node: `npm run server` (port 8787, or `PORT`).
- Cloudflare Workers: `npx wrangler deploy` with `wrangler.jsonc`, keys as secrets.

Then type the server's address and access code into the app under Account, Studio server.

## Not checked against a live key yet

The request shapes follow Beeble's, fal's and Anthropic's published API docs and pass tests against stand-in providers, including a full browser run. The first run with real keys is the real check, most of all the SwitchX 3.0 input fields, which Beeble only shows to keys that have 3.0. `npm run server:doctor` prints them.
