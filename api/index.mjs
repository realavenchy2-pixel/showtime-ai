// Vercel entry: every /api/* request lands here (see vercel.json) and goes to the studio server.
import { createApp } from '../server/src/app.mjs';

const handle = createApp(process.env);

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const OPTIONS = handle;
