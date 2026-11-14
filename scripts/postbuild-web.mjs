// Finishes a web export so it installs like an app and survives a reload on a static host.
// Usage: node scripts/postbuild-web.mjs <dist> [base path, e.g. /showtime-ai]
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const base = (process.argv[3] ?? '').replace(/\/$/, '');

const manifest = {
  name: 'Showtime AI',
  short_name: 'Showtime',
  description: 'Record your verse with the song playing. Your director cuts, switches the world around you and builds the video.',
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  background_color: '#000000',
  theme_color: '#000000',
  icons: [
    { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const head = `
    <meta name="theme-color" content="#000000" />
    <meta name="color-scheme" content="dark" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Showtime" />
    <meta name="description" content="${manifest.description}" />
    <link rel="manifest" href="${base}/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="${base}/icons/icon-180.png" />
    <style>
      html, body { background: #000; color-scheme: dark; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
      #boot { position: fixed; inset: 0; display: grid; place-items: center; }
      #boot img { width: min(64vw, 280px); height: auto; animation: boot 1.1s ease-in-out infinite alternate; }
      @keyframes boot { from { opacity: 0.55; } to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { #boot img { animation: none; } }
      #root:not(:empty) + #boot { display: none; }
    </style>`;

const file = join(dist, 'index.html');
let html = readFileSync(file, 'utf8');
html = html.replace('content="width=device-width, initial-scale=1, shrink-to-fit=no"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"');
html = html.replace('</head>', `${head}\n  </head>`);
html = html.replace(/(<div id="root"><\/div>)/, `$1\n    <div id="boot" role="status"><img src="${base}/icons/logo.png" alt="Showtime AI is loading" width="1100" height="330" /></div>`);
writeFileSync(file, html);

// A static host answers unknown paths with 404.html; serving the app there lets deep links and reloads work.
copyFileSync(file, join(dist, '404.html'));
writeFileSync(join(dist, '.nojekyll'), '');
console.log(`Web build finished for ${base || '/'}`);
