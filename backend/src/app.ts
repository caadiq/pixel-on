import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { statsRoute } from './routes/stats.js';
import { streamerDetailRoute } from './routes/streamerDetail.js';
import { streamersRoute } from './routes/streamers.js';

export const app = new Hono();

app.use('*', logger());

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/streamers', streamersRoute);
app.route('/api/streamers/:id', streamerDetailRoute);
app.route('/api', statsRoute);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal error' }, 500);
});
