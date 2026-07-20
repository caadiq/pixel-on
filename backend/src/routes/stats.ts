/** 홈·이력 페이지용 집계 라우트 */
import { Hono } from 'hono';
import { and, desc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, streamers } from '../db/schema.js';
import { kstDateStr, kstDayRange, kstParts } from '../lib/time.js';

export const statsRoute = new Hono();

const durMs = (s: { startedAt: Date; endedAt: Date | null }) =>
  (s.endedAt ?? new Date()).getTime() - s.startedAt.getTime();

/**
 * 특정 KST 날짜와 겹치는 세션 (간트용). ?date=YYYY-MM-DD (기본 오늘)
 * 방송일 귀속은 시작일 기준이지만, 전날 시작해 자정을 넘긴 방송도 함께 내려
 * 프론트가 "이어짐" 막대로 그릴 수 있게 한다 (started_at < 그날 0시로 구분).
 */
statsRoute.get('/sessions/day', async (c) => {
  const date = c.req.query('date') ?? kstDateStr(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'bad date' }, 400);
  const { start, end } = kstDayRange(date);
  // 전날 시작분 포함을 위한 하한 (48시간보다 긴 방송은 없다)
  const floor = new Date(start.getTime() - 48 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: sessions.id,
      streamerId: sessions.streamerId,
      title: sessions.title,
      category: sessions.category,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      peakViewers: sessions.peakViewers,
      source: sessions.source,
      vodId: sessions.vodId,
      name: streamers.name,
      color: streamers.color,
      autoColor: streamers.autoColor,
      profileImage: streamers.profileImage,
    })
    .from(sessions)
    .innerJoin(streamers, eq(streamers.id, sessions.streamerId))
    .where(and(gte(sessions.startedAt, floor), lt(sessions.startedAt, end), eq(streamers.active, true)));

  // 그날과 겹치는 것만 (전날 시작분은 그날로 이어진 경우에만)
  const overlapping = rows.filter(
    (r) => r.startedAt.getTime() >= start.getTime() || r.endedAt === null || r.endedAt.getTime() > start.getTime(),
  );
  overlapping.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  rows.length = 0;
  rows.push(...overlapping);

  return c.json({
    date,
    sessions: rows.map((r) => ({
      id: r.id,
      streamerId: r.streamerId,
      name: r.name,
      color: r.color ?? r.autoColor ?? null,
      profileImage: r.profileImage,
      title: r.title,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      peakViewers: r.peakViewers,
      source: r.source,
      vodId: r.vodId,
    })),
  });
});

/**
 * 다시보기 목록 — DB 기반 (vodId·썸네일 있는 세션만).
 * 총 개수를 함께 반환해 페이지 번호를 처음부터 전부 표시할 수 있다.
 * ?page=0&streamerId=&size=24
 */
statsRoute.get('/vods', async (c) => {
  const page = Math.max(0, Number(c.req.query('page') ?? 0));
  const size = Math.min(Math.max(1, Number(c.req.query('size') ?? 24)), 48);
  const sid = Number(c.req.query('streamerId') ?? 0);

  const conds = [
    isNotNull(sessions.vodId),
    isNotNull(sessions.thumbnail),
    eq(streamers.active, true),
    ...(sid ? [eq(sessions.streamerId, sid)] : []),
  ];
  const where = and(...conds);

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(sessions)
    .innerJoin(streamers, eq(streamers.id, sessions.streamerId))
    .where(where);

  const rows = await db
    .select({
      id: sessions.id,
      streamerId: sessions.streamerId,
      title: sessions.title,
      category: sessions.category,
      thumbnail: sessions.thumbnail,
      vodId: sessions.vodId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .innerJoin(streamers, eq(streamers.id, sessions.streamerId))
    .where(where)
    .orderBy(desc(sessions.startedAt))
    .limit(size)
    .offset(page * size);

  return c.json({
    total,
    vods: rows.map((r) => {
      const [platform, no] = (r.vodId ?? ':').split(':');
      return {
        id: r.id,
        streamerId: r.streamerId,
        title: r.title,
        category: r.category,
        thumbnail: r.thumbnail,
        startedAt: r.startedAt.toISOString(),
        duration: Math.round(((r.endedAt ?? new Date()).getTime() - r.startedAt.getTime()) / 1000),
        url:
          platform === 'soop'
            ? `https://vod.sooplive.co.kr/player/${no}`
            : `https://chzzk.naver.com/video/${no}`,
      };
    }),
  });
});

/** 주간 집계 (최근 7일) — 홈 우측 패널 */
statsRoute.get('/stats/weekly', async (c) => {
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      streamerId: sessions.streamerId,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      peakViewers: sessions.peakViewers,
      name: streamers.name,
    })
    .from(sessions)
    .innerJoin(streamers, eq(streamers.id, sessions.streamerId))
    .where(and(gte(sessions.startedAt, from), eq(streamers.active, true)));

  let totalMs = 0;
  let longest: { name: string; ms: number } | null = null;
  let best: { name: string; peak: number } | null = null;
  const startMins: number[] = [];
  /** KST 날짜별 활동 시간 (홈 주간 캘린더) */
  const daily = new Map<string, number>();

  for (const r of rows) {
    const ms = durMs(r);
    totalMs += ms;
    if (!longest || ms > longest.ms) longest = { name: r.name, ms };
    if (!best || r.peakViewers > best.peak) best = { name: r.name, peak: r.peakViewers };
    const p = kstParts(r.startedAt);
    startMins.push(p.hour * 60 + p.minute);
    const key = kstDateStr(r.startedAt);
    daily.set(key, (daily.get(key) ?? 0) + ms / 3_600_000);
  }

  const avgMin = startMins.length
    ? Math.round(startMins.reduce((a, b) => a + b, 0) / startMins.length)
    : null;

  return c.json({
    totalHours: Math.round(totalMs / 3_600_000),
    longest: longest ? { name: longest.name, hours: Math.round((longest.ms / 3_600_000) * 10) / 10 } : null,
    bestPeak: best,
    avgStartMin: avgMin,
    daily: [...daily.entries()].map(([date, hours]) => ({ date, hours: Math.round(hours * 10) / 10 })),
  });
});
