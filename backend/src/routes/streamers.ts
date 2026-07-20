import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { streamers } from '../db/schema.js';

export const streamersRoute = new Hono();

/** 전체 목록 (홈 화면) — 활성만, 가나다순 */
streamersRoute.get('/', async (c) => {
  const rows = await db
    .select()
    .from(streamers)
    .where(eq(streamers.active, true))
    .orderBy(asc(streamers.sortName));

  return c.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      platform: s.platform,
      profileImage: s.profileImage,
      followers: s.followers,
      /** 수동 지정 우선, 없으면 자동 추출값 */
      color: s.color ?? s.autoColor ?? null,
    })),
  );
});
