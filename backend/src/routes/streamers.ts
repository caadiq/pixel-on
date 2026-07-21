import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { streamers } from '../db/schema.js';
import { liveNow } from '../worker/poller.js';

export const streamersRoute = new Hono();

/** 전체 목록 (홈 화면) — 활성만, 가나다순, 현재 라이브 상태 포함 */
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
      /** 폴링 워커의 메모리 상태 — DB 조회 없음. url = 라이브 페이지 링크 */
      live: liveNow.has(s.id)
        ? {
            ...liveNow.get(s.id)!,
            url:
              s.platform === 'soop'
                ? `https://play.sooplive.co.kr/${s.soopId}`
                : `https://chzzk.naver.com/live/${s.chzzkId}`,
          }
        : null,
    })),
  );
});
