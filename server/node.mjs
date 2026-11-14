// Runs the studio server on plain Node (18 or newer):  node server/node.mjs
// Keys come from the environment; see server/README.md.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

import { createApp } from './src/app.mjs';

const handle = createApp(process.env);
const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host ?? 'localhost'}${req.url}`;
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? Readable.toWeb(req) : undefined,
      duplex: hasBody ? 'half' : undefined,
    });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : 'Server error' } }));
  }
}).listen(port, () => console.log(`Showtime studio server on http://localhost:${port}`));
