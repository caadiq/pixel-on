/** 관리자 라우트 — X-Admin-Key 헤더 필수 */
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { streamers } from '../db/schema.js';
import { fetchChzzkChannel, searchChzzkChannels } from '../services/chzzk.js';
import { extractColorFromUrl } from '../services/palette.js';
import { fetchSoopStation, searchSoopChannels } from '../services/soop.js';
import { backfillStreamer } from '../worker/backfill.js';

export const adminRoute = new Hono();

adminRoute.use('*', async (c, next) => {
  if (!config.adminKey || c.req.header('X-Admin-Key') !== config.adminKey) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

/** 인증 확인용 */
adminRoute.get('/ping', (c) => c.json({ ok: true }));

/** 전체 목록 (비활성 포함) */
adminRoute.get('/streamers', async (c) => {
  const rows = await db.select().from(streamers).orderBy(asc(streamers.sortName));
  return c.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      platform: s.platform,
      chzzkId: s.chzzkId,
      soopId: s.soopId,
      profileImage: s.profileImage,
      followers: s.followers,
      color: s.color,
      autoColor: s.autoColor,
      active: s.active,
    })),
  );
});

/** 채널 검색 (치지직 + 숲 동시) */
adminRoute.get('/search', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ chzzk: [], soop: [] });
  const [chzzk, soop] = await Promise.all([
    searchChzzkChannels(q).catch(() => []),
    searchSoopChannels(q).catch(() => []),
  ]);
  return c.json({ chzzk, soop });
});

/** 추가 — 채널 정보·색 자동 채움 */
adminRoute.post('/streamers', async (c) => {
  const body = await c.req.json<{ platform: 'chzzk' | 'soop'; chzzkId?: string; soopId?: string }>();

  let name = '';
  let profileImage = '';
  let followers = 0;

  if (body.platform === 'chzzk') {
    if (!body.chzzkId) return c.json({ error: 'chzzkId 필요' }, 400);
    const ch = await fetchChzzkChannel(body.chzzkId);
    if (!ch) return c.json({ error: '치지직 채널을 찾을 수 없어요' }, 404);
    name = ch.name;
    profileImage = ch.profileImage;
    followers = ch.followers;
  } else {
    if (!body.soopId) return c.json({ error: 'soopId 필요' }, 400);
    const st = await fetchSoopStation(body.soopId);
    if (!st) return c.json({ error: '숲 채널을 찾을 수 없어요' }, 404);
    name = st.nickname;
    profileImage = st.profileImage;
    followers = st.followers;
  }

  const now = new Date();
  const [row] = await db
    .insert(streamers)
    .values({
      name,
      platform: body.platform,
      chzzkId: body.chzzkId ?? null,
      soopId: body.soopId ?? null,
      profileImage,
      followers,
      sortName: name,
      autoColor: await extractColorFromUrl(profileImage),
      createdAt: now,
      updatedAt: now,
    })
    .$returningId();

  return c.json({ id: row.id, name }, 201);
});

/** 수정 — 대표색 오버라이드(null이면 자동값 사용), 활성 토글, 이름 */
adminRoute.patch('/streamers/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ color?: string | null; active?: boolean; name?: string; sortName?: string }>();

  const patch: Partial<typeof streamers.$inferInsert> = { updatedAt: new Date() };
  if ('color' in body) {
    if (body.color !== null && !/^#[0-9a-fA-F]{6}$/.test(body.color!)) {
      return c.json({ error: '색은 #RRGGBB 형식' }, 400);
    }
    patch.color = body.color;
  }
  if (body.active !== undefined) patch.active = body.active;
  if (body.name) patch.name = body.name;
  if (body.sortName) patch.sortName = body.sortName;

  await db.update(streamers).set(patch).where(eq(streamers.id, id));
  return c.json({ ok: true });
});

/** 백필 수동 트리거 (비동기 실행) */
adminRoute.post('/streamers/:id/backfill', async (c) => {
  const id = Number(c.req.param('id'));
  const [s] = await db.select().from(streamers).where(eq(streamers.id, id));
  if (!s) return c.json({ error: 'not found' }, 404);

  void backfillStreamer(s)
    .then((n) => console.log(`관리자 백필 ${s.name}: +${n}건`))
    .catch((e) => console.error(`관리자 백필 실패 ${s.name}:`, e));
  return c.json({ started: true });
});
