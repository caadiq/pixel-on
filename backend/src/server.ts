import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/index.js';
import { startPoller, stopPoller } from './worker/poller.js';

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`pixel-backend listening on :${info.port}`);
});

startPoller().catch((e) => {
  console.error('폴러 기동 실패:', e);
  process.exit(1);
});

async function shutdown() {
  stopPoller();
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
