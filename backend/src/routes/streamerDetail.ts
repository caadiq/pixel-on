/** 스트리머 상세 관련 조회 라우트 (:id 하위) */
import { Hono } from 'hono';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, streamers } from '../db/schema.js';
import { kstDateStr, kstParts } from '../lib/time.js';
import { fetchChzzkVideos } from '../services/chzzk.js';
import { fetchSoopVods } from '../services/soop.js';
import { liveNow } from '../worker/poller.js';

export const streamerDetailRoute = new Hono();

async function getStreamer(id: number) {
  const [s] = await db.select().from(streamers).where(eq(streamers.id, id));
  return s && s.active ? s : null;
}

const durMs = (s: { startedAt: Date; endedAt: Date | null }) =>
  (s.endedAt ?? new Date()).getTime() - s.startedAt.getTime();

/** 상세 헤더: 채널 정보 + 통계 요약 */
streamerDetailRoute.get('/', async (c) => {
  const id = Number(c.req.param('id'));
  const s = await getStreamer(id);
  if (!s) return c.json({ error: 'not found' }, 404);

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.streamerId, id), gte(sessions.startedAt, monthAgo)));

  const totalMs = recent.reduce((a, r) => a + durMs(r), 0);
  // 평균 시작 시각 (KST 분 단위 평균)
  const mins = recent.map((r) => {
    const p = kstParts(r.startedAt);
    return p.hour * 60 + p.minute;
  });
  const avgMin = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
  // 최다 카테고리
  const catCount = new Map<string, number>();
  for (const r of recent) if (r.category) catCount.set(r.category, (catCount.get(r.category) ?? 0) + 1);
  const topCategory = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  // 역대 최고 동접 (poll 기록만 의미 있음)
  const [peakRow] = await db
    .select({ peak: sessions.peakViewers, title: sessions.title })
    .from(sessions)
    .where(eq(sessions.streamerId, id))
    .orderBy(desc(sessions.peakViewers))
    .limit(1);

  return c.json({
    id: s.id,
    name: s.name,
    platform: s.platform,
    profileImage: s.profileImage,
    followers: s.followers,
    color: s.color ?? s.autoColor ?? null,
    live: liveNow.get(s.id) ?? null,
    stats: {
      monthCount: recent.length,
      monthHours: Math.round(totalMs / 3_600_000),
      avgStartMin: avgMin,
      topCategory,
      bestPeak: peakRow?.peak ?? 0,
    },
  });
});

/** 방송 이력 + 잔디용 일별 집계. ?days=182 */
streamerDetailRoute.get('/sessions', async (c) => {
  const id = Number(c.req.param('id'));
  const s = await getStreamer(id);
  if (!s) return c.json({ error: 'not found' }, 404);

  const days = Math.min(Number(c.req.query('days') ?? 182), 730);
  const limit = Math.min(Number(c.req.query('limit') ?? 30), 100);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.streamerId, id), gte(sessions.startedAt, from)))
    .orderBy(desc(sessions.startedAt));

  // 잔디: KST 날짜별 방송 시간(시간 단위, 시작일 귀속)
  const daily = new Map<string, number>();
  for (const r of rows) {
    const key = kstDateStr(r.startedAt);
    daily.set(key, (daily.get(key) ?? 0) + durMs(r) / 3_600_000);
  }

  return c.json({
    sessions: rows.slice(0, limit).map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      peakViewers: r.peakViewers,
      accumulate: r.accumulate,
      source: r.source,
      vodId: r.vodId,
    })),
    daily: [...daily.entries()].map(([date, hours]) => ({ date, hours: Math.round(hours * 10) / 10 })),
  });
});

/** 요일×시간 패턴 (최근 180일, 각 셀 = 그 시간대에 방송한 시간 합) */
streamerDetailRoute.get('/pattern', async (c) => {
  const id = Number(c.req.param('id'));
  const s = await getStreamer(id);
  if (!s) return c.json({ error: 'not found' }, 404);

  const from = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt })
    .from(sessions)
    .where(and(eq(sessions.streamerId, id), gte(sessions.startedAt, from)));

  // 7×24 격자에 시간 단위로 분배
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) {
    let t = r.startedAt.getTime();
    const end = (r.endedAt ?? new Date()).getTime();
    while (t < end) {
      const next = Math.min(end, Math.ceil((t + 1) / 3_600_000) * 3_600_000);
      const p = kstParts(new Date(t));
      grid[p.weekday][p.hour] += (next - t) / 3_600_000;
      t = next;
    }
  }
  return c.json({ grid: grid.map((row) => row.map((v) => Math.round(v * 10) / 10)) });
});

/** 다시보기 목록 (플랫폼 프록시 + 10분 캐시) */
const vodCache = new Map<string, { at: number; data: unknown }>();
const VOD_CACHE_MS = 10 * 60 * 1000;

streamerDetailRoute.get('/vods', async (c) => {
  const id = Number(c.req.param('id'));
  const s = await getStreamer(id);
  if (!s) return c.json({ error: 'not found' }, 404);

  const page = Number(c.req.query('page') ?? 0);
  const key = `${id}:${page}`;
  const hit = vodCache.get(key);
  if (hit && Date.now() - hit.at < VOD_CACHE_MS) return c.json(hit.data as object);

  let data: object;
  if (s.platform === 'chzzk' && s.chzzkId) {
    const res = await fetchChzzkVideos(s.chzzkId, page);
    data = {
      vods: (res?.videos ?? []).map((v) => ({
        id: `chzzk:${v.videoNo}`,
        title: v.title,
        category: v.category,
        publishedAt: v.publishDate.toISOString(),
        duration: v.duration,
        url: `https://chzzk.naver.com/video/${v.videoNo}`,
      })),
      hasMore: res?.hasMore ?? false,
    };
  } else if (s.soopId) {
    const res = await fetchSoopVods(s.soopId, page + 1); // 숲은 1부터
    data = {
      vods: (res?.vods ?? []).map((v) => ({
        id: `soop:${v.titleNo}`,
        title: v.title,
        category: v.category,
        publishedAt: v.regDate.toISOString(),
        duration: v.duration,
        url: `https://vod.sooplive.co.kr/player/${v.titleNo}`,
      })),
      hasMore: res?.hasMore ?? false,
    };
  } else {
    data = { vods: [], hasMore: false };
  }
  vodCache.set(key, { at: Date.now(), data });
  return c.json(data);
});
