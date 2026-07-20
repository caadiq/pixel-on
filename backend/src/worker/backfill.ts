/**
 * VOD 백필 — 다시보기에서 과거 방송 이력을 역산해 채운다
 *
 * 시작 ≈ publishDate - duration, 종료 ≈ publishDate (근사값 → source='backfill')
 * - 기존 세션과 구간이 겹치면 스킵 (±30분 여유)
 *   · 겹친 세션에 vodId가 비어 있으면 연결만 해줌
 * - 인접 VOD 간격이 10분 미만이면 같은 방송의 분할 업로드로 보고 병합
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, type Streamer } from '../db/schema.js';
import { fetchChzzkVideos } from '../services/chzzk.js';
import { fetchSoopVods } from '../services/soop.js';

const OVERLAP_MARGIN_MS = 30 * 60 * 1000;
const SPLIT_MERGE_MS = 10 * 60 * 1000;
const GAP_MS = 300;
/** 이보다 긴 VOD는 통합본/몰아보기로 간주하고 스킵 (98시간짜리 실측됨) */
const MAX_PLAUSIBLE_MS = 40 * 60 * 60 * 1000;

/** 백필 진행 중 여부 — 리커버리가 레이스로 중복 생성하지 않도록 노출 */
export let backfillActive = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface VodSpan {
  vodId: string;
  title: string;
  category: string | null;
  startedAt: Date;
  endedAt: Date;
  accumulate: number | null;
  thumbnail: string | null;
}

/** 한 스트리머의 전체(또는 maxPages까지) VOD를 백필. 생성된 세션 수 반환 */
export async function backfillStreamer(s: Streamer, maxPages = Infinity): Promise<number> {
  backfillActive = true;
  try {
    return await backfillStreamerInner(s, maxPages);
  } finally {
    backfillActive = false;
  }
}

async function backfillStreamerInner(s: Streamer, maxPages: number): Promise<number> {
  let spans: VodSpan[] = [];

  if (s.chzzkId) {
    // 망개처럼 과거 치지직 이력이 있는 숲 스트리머도 치지직 VOD를 함께 수집
    spans.push(...(await collectChzzk(s.chzzkId, maxPages)));
  }
  if (s.soopId) {
    spans.push(...(await collectSoop(s.soopId, maxPages)));
  }
  // 통합본/몰아보기 제외
  spans = spans.filter((v) => v.endedAt.getTime() - v.startedAt.getTime() <= MAX_PLAUSIBLE_MS);
  if (spans.length === 0) return 0;

  // 시간순 정렬 후 분할 업로드 병합
  spans.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const merged: VodSpan[] = [];
  for (const v of spans) {
    const last = merged[merged.length - 1];
    if (last && v.startedAt.getTime() - last.endedAt.getTime() < SPLIT_MERGE_MS) {
      last.endedAt = v.endedAt;
      last.accumulate = maxNullable(last.accumulate, v.accumulate);
      last.thumbnail = last.thumbnail ?? v.thumbnail;
    } else {
      merged.push({ ...v });
    }
  }

  let created = 0;
  for (const v of merged) {
    if (await linkOrSkipOverlap(s.id, v)) continue;
    await db.insert(sessions).values({
      streamerId: s.id,
      platform: s.platform,
      title: v.title,
      category: v.category,
      startedAt: v.startedAt,
      endedAt: v.endedAt,
      accumulate: v.accumulate,
      source: 'backfill',
      vodId: v.vodId,
      thumbnail: v.thumbnail,
    });
    created++;
  }
  return created;
}

async function collectChzzk(chzzkId: string, maxPages: number): Promise<VodSpan[]> {
  const out: VodSpan[] = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchChzzkVideos(chzzkId, page);
    if (!res) break;
    for (const v of res.videos) {
      if (v.duration <= 0) continue;
      out.push({
        vodId: `chzzk:${v.videoNo}`,
        title: v.title,
        category: v.category,
        startedAt: new Date(v.publishDate.getTime() - v.duration * 1000),
        endedAt: v.publishDate,
        accumulate: v.livePv,
        thumbnail: v.thumbnail,
      });
    }
    if (!res.hasMore) break;
    await sleep(GAP_MS);
  }
  return out;
}

async function collectSoop(soopId: string, maxPages: number): Promise<VodSpan[]> {
  const out: VodSpan[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchSoopVods(soopId, page);
    if (!res) break;
    for (const v of res.vods) {
      if (v.duration <= 0) continue;
      out.push({
        vodId: `soop:${v.titleNo}`,
        title: v.title,
        category: v.category,
        startedAt: new Date(v.regDate.getTime() - v.duration * 1000),
        endedAt: v.regDate,
        accumulate: null,
        thumbnail: v.thumbnail,
      });
    }
    if (!res.hasMore) break;
    await sleep(GAP_MS);
  }
  return out;
}

/** 겹치는 기존 세션이 있으면 true (vodId 미연결이면 연결) */
async function linkOrSkipOverlap(streamerId: number, v: VodSpan): Promise<boolean> {
  const lo = new Date(v.startedAt.getTime() - OVERLAP_MARGIN_MS);
  const hi = new Date(v.endedAt.getTime() + OVERLAP_MARGIN_MS);
  // 구간 겹침: started_at <= hi AND (ended_at IS NULL OR ended_at >= lo)
  // 하한: 48시간 전 시작 세션까지만 보면 충분 (그보다 긴 방송은 없다)
  const floor = new Date(lo.getTime() - 48 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: sessions.id, vodId: sessions.vodId, endedAt: sessions.endedAt, thumbnail: sessions.thumbnail })
    .from(sessions)
    .where(
      and(
        eq(sessions.streamerId, streamerId),
        lte(sessions.startedAt, hi),
        gte(sessions.startedAt, floor),
      ),
    );
  const hit = rows.find((r) => r.endedAt === null || r.endedAt.getTime() >= lo.getTime());
  if (!hit) return false;
  if (!hit.vodId || !hit.thumbnail) {
    await db
      .update(sessions)
      .set({ vodId: hit.vodId ?? v.vodId, thumbnail: hit.thumbnail ?? v.thumbnail })
      .where(eq(sessions.id, hit.id));
  }
  return true;
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
