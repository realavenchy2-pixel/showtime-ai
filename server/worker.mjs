// Cloudflare Workers entry. Deploy with `npx wrangler deploy`; set the keys as secrets in the dashboard.
import { createApp } from './src/app.mjs';

let handle;

export default {
  fetch(request, env) {
    handle ??= createApp(env);
    return handle(request);
  },
};
