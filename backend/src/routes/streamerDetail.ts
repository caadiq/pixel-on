/** 스트리머 상세 관련 조회 라우트 (:id 하위) */
import { Hono } from 'hono';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, streamers } from '../db/schema.js';
import { kstDateStr, kstParts } from '../lib/time.js';
import { fetchChzzkLiveHls, fetchChzzkVideos } from '../services/chzzk.js';
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

  /**
   * 마지막 방송 — 가장 최근 세션의 시작·종료.
   * 기간 제한 없이 조회해 한 달 이상 쉰 경우도 표시된다.
   */
  const [lastRow] = await db
    .select({ startedAt: sessions.startedAt, endedAt: sessions.endedAt })
    .from(sessions)
    .where(eq(sessions.streamerId, id))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  const lastSession = lastRow
    ? {
        startedAt: lastRow.startedAt.toISOString(),
        endedAt: lastRow.endedAt?.toISOString() ?? null,
        durationMs: (lastRow.endedAt ?? new Date()).getTime() - lastRow.startedAt.getTime(),
      }
    : null;
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
    live: liveNow.has(s.id)
      ? {
          ...liveNow.get(s.id)!,
          url:
            s.platform === 'soop'
              ? `https://play.sooplive.co.kr/${s.soopId}`
              : `https://chzzk.naver.com/live/${s.chzzkId}`,
        }
      : null,
    stats: {
      monthCount: recent.length,
      monthHours: Math.round(totalMs / 3_600_000),
      lastSession,
      topCategory,
      bestPeak: peakRow?.peak ?? 0,
    },
  });
});

/**
 * 방송 이력 + 일별 집계.
 * ?month=YYYY-MM (KST 월 단위 — 달력용, 그 달 세션 전체 반환)
 * ?days=182 (최근 N일 — 목록용, limit 적용)
 */
streamerDetailRoute.get('/sessions', async (c) => {
  const id = Number(c.req.param('id'));
  const s = await getStreamer(id);
  if (!s) return c.json({ error: 'not found' }, 404);

  const month = c.req.query('month');
  let from: Date;
  let to: Date | null = null;
  let limit: number;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    from = new Date(`${month}-01T00:00:00+09:00`);
    to = new Date(`${next}-01T00:00:00+09:00`);
    limit = 200; // 한 달 세션은 전부 (하루 2방송이어도 ~60건)
  } else {
    const days = Math.min(Number(c.req.query('days') ?? 182), 730);
    from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    limit = Math.min(Number(c.req.query('limit') ?? 30), 100);
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.streamerId, id),
        gte(sessions.startedAt, from),
        ...(to ? [lt(sessions.startedAt, to)] : []),
      ),
    )
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
      thumbnail: r.thumbnail,
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

/** 호버 미리보기용 HLS URL (치지직만, 30초 캐시 — 토큰이 만료되므로 짧게) */
const previewCache = new Map<number, { at: number; url: string | null }>();
const PREVIEW_CACHE_MS = 30_000;

streamerDetailRoute.get('/preview', async (c) => {
  const id = Number(c.req.param('id'));
  const s = await getStreamer(id);
  if (!s) return c.json({ error: 'not found' }, 404);
  if (s.platform !== 'chzzk' || !s.chzzkId) return c.json({ url: null });

  const hit = previewCache.get(id);
  if (hit && Date.now() - hit.at < PREVIEW_CACHE_MS) return c.json({ url: hit.url });

  const url = await fetchChzzkLiveHls(s.chzzkId).catch(() => null);
  previewCache.set(id, { at: Date.now(), url });
  return c.json({ url });
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
        thumbnail: v.thumbnail,
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
        thumbnail: v.thumbnail,
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
