/** 홈·이력 페이지용 집계 라우트 */
import { Hono } from 'hono';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, streamers } from '../db/schema.js';
import { kstDateStr, kstDayRange, kstParts } from '../lib/time.js';

export const statsRoute = new Hono();

const durMs = (s: { startedAt: Date; endedAt: Date | null }) =>
  (s.endedAt ?? new Date()).getTime() - s.startedAt.getTime();

/**
 * 특정 KST 날짜에 "시작한" 세션 (간트용). ?date=YYYY-MM-DD (기본 오늘)
 * 방송일 = 시작일 귀속 — 어제 밤에 켜서 오늘 새벽에 끈 방송은 어제 것
 */
statsRoute.get('/sessions/day', async (c) => {
  const date = c.req.query('date') ?? kstDateStr(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'bad date' }, 400);
  const { start, end } = kstDayRange(date);

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
      name: streamers.name,
      color: streamers.color,
      autoColor: streamers.autoColor,
      profileImage: streamers.profileImage,
    })
    .from(sessions)
    .innerJoin(streamers, eq(streamers.id, sessions.streamerId))
    .where(and(gte(sessions.startedAt, start), lt(sessions.startedAt, end), eq(streamers.active, true)));

  rows.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

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
    })),
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
