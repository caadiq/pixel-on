import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/index.js';

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`pixel-backend listening on :${info.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
