/**
 * 폴링 워커 — 60초 주기로 전원 순회, 상태 머신에 전달
 *
 * - 요청 간 150ms 간격 (버스트 방지)
 * - 429/403 또는 치지직 trafficThrottling 신호 시 지수 백오프 (최대 8배)
 * - 개별 실패는 스킵, 3회 연속 실패만 경고
 * - 1시간마다 채널 정보(프로필·팔로워) 갱신
 * - 현재 라이브 상태를 메모리에 유지 → API가 DB 조회 없이 즉답
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, snapshots, streamers, type Streamer } from '../db/schema.js';
import { fetchChzzkChannel, fetchChzzkLiveStatus, ThrottledError } from '../services/chzzk.js';
import { fetchSoopStation } from '../services/soop.js';
import { backfillActive, backfillStreamer } from './backfill.js';
import { onLive, onOffline, restoreOpenSessions, snapshotDue } from './tracker.js';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_SEC ?? 60) * 1000;
const GAP_MS = 150;
const CHANNEL_REFRESH_MS = 60 * 60 * 1000;

export interface LiveNow {
  title: string;
  category: string | null;
  viewers: number;
  startedAt: string;
}

/** 홈 화면용 실시간 상태 (streamerId → 라이브 정보) */
export const liveNow = new Map<number, LiveNow>();

const failStreaks = new Map<number, number>();
let backoffFactor = 1;
let lastChannelRefresh = 0;
let running = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startPoller(): Promise<void> {
  const restored = await restoreOpenSessions();
  if (restored > 0) console.log(`미종료 세션 ${restored}건 복원`);

  running = true;
  void loop();
  console.log(`폴링 시작 (${POLL_INTERVAL_MS / 1000}초 주기)`);
}

export function stopPoller(): void {
  running = false;
}

async function loop(): Promise<void> {
  while (running) {
    const started = Date.now();
    try {
      await pollAll();
    } catch (e) {
      console.error('폴링 사이클 실패:', e);
    }
    const elapsed = Date.now() - started;
    const wait = Math.max(POLL_INTERVAL_MS * backoffFactor - elapsed, 5_000);
    await sleep(wait);
  }
}

async function pollAll(): Promise<void> {
  const rows = await db.select().from(streamers).where(eq(streamers.active, true));

  let throttled = false;
  for (const s of rows) {
    if (!running) return;
    try {
      await pollOne(s);
      failStreaks.set(s.id, 0);
    } catch (e) {
      if (e instanceof ThrottledError) {
        throttled = true;
        console.warn(`스로틀 감지 (HTTP ${e.status}) — 백오프`);
        break; // 이번 사이클 중단
      }
      const streak = (failStreaks.get(s.id) ?? 0) + 1;
      failStreaks.set(s.id, streak);
      if (streak >= 3) console.warn(`⚠ ${s.name} ${streak}회 연속 폴링 실패`);
    }
    await sleep(GAP_MS);
  }

  backoffFactor = throttled ? Math.min(backoffFactor * 2, 8) : 1;

  if (Date.now() - lastChannelRefresh > CHANNEL_REFRESH_MS) {
    lastChannelRefresh = Date.now();
    void refreshChannels(rows).catch((e) => console.error('채널 갱신 실패:', e));
  }

  // 일일 안전망: 새벽 5시(KST)에 최근 VOD 1페이지만 훑어 폴링이 놓친 방송 복구
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  const today = new Date().toISOString().slice(0, 10);
  if (kstHour === 5 && lastDailyBackfill !== today) {
    lastDailyBackfill = today;
    void dailyBackfill(rows).catch((e) => console.error('일일 백필 실패:', e));
  }
}

let lastDailyBackfill = '';
async function dailyBackfill(rows: Streamer[]): Promise<void> {
  let total = 0;
  for (const s of rows) {
    try {
      total += await backfillStreamer(s, 1);
    } catch {
      /* 개별 실패 무시 */
    }
    await sleep(GAP_MS);
  }
  if (total > 0) console.log(`일일 백필: 놓친 방송 ${total}건 복구`);
}

async function pollOne(s: Streamer): Promise<void> {
  if (s.platform === 'chzzk') {
    if (!s.chzzkId) return;
    const st = await fetchChzzkLiveStatus(s.chzzkId);
    if (!st) throw new Error('fetch fail');
    if (st.trafficThrottling > 0) throw new ThrottledError(0);

    if (st.status === 'OPEN') {
      await handleLive(s, {
        title: st.title,
        category: st.category,
        viewers: st.viewers,
        accumulate: st.accumulate,
        startedAt: st.openDate,
        endedAt: null,
      });
    } else {
      // 치지직은 종료 후에도 closeDate 정확값이 남는다
      liveNow.delete(s.id);
      await onOffline(s.id, st.closeDate);
      // 직전 방송 리커버리: 다운타임 중 놓친 방송을 잔존값으로 복구
      // (다시보기 없는 스트리머(지누 등)를 위한 유일한 보험 — 추가 요청 0건)
      if (st.closeDate) {
        await recoverLastBroadcast(s, {
          title: st.title,
          category: st.category,
          startedAt: st.openDate,
          endedAt: st.closeDate,
          accumulate: st.accumulate,
        });
      }
    }
  } else {
    if (!s.soopId) return;
    const st = await fetchSoopStation(s.soopId);
    if (!st) throw new Error('fetch fail');

    if (st.live) {
      await handleLive(s, {
        title: st.live.title,
        category: st.live.category,
        viewers: st.live.viewers,
        accumulate: null,
        startedAt: st.live.startedAt,
        endedAt: null,
      });
    } else {
      // 숲은 종료 시각을 주지 않음 → 감지 시각 사용 (±폴링 주기 오차)
      liveNow.delete(s.id);
      await onOffline(s.id, null);
    }
  }
}

async function handleLive(
  s: Streamer,
  live: { title: string; category: string | null; viewers: number; accumulate: number | null; startedAt: Date; endedAt: null },
): Promise<void> {
  await onLive(s.id, s.platform, live);
  liveNow.set(s.id, {
    title: live.title,
    category: live.category,
    viewers: live.viewers,
    startedAt: live.startedAt.toISOString(),
  });

  const sessionId = snapshotDue(s.id);
  if (sessionId !== null) {
    await db.insert(snapshots).values({ sessionId, at: new Date(), viewers: live.viewers });
  }
}

/** 이미 기록된 직전 방송인지 확인 후 없으면 backfill 세션 생성 (시각은 정확값) */
const recoveredOnce = new Set<number>();
async function recoverLastBroadcast(
  s: Streamer,
  b: { title: string; category: string | null; startedAt: Date; endedAt: Date; accumulate: number },
): Promise<void> {
  // 백필 패스 진행 중엔 미룸 (동시 삽입 레이스 방지) — 다음 폴링에서 재시도
  if (backfillActive) return;
  // 같은 잔존값을 폴링마다 재검사하지 않도록 스트리머당 1회만
  if (recoveredOnce.has(s.id)) return;
  recoveredOnce.add(s.id);

  // 구간 겹침 검사 (±30분 여유) — VOD 역산 시각과 수 분 어긋나도 같은 방송으로 인식
  const margin = 30 * 60 * 1000;
  const lo = new Date(b.startedAt.getTime() - margin);
  const hi = new Date(b.endedAt.getTime() + margin);
  const floor = new Date(lo.getTime() - 48 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: sessions.id, endedAt: sessions.endedAt })
    .from(sessions)
    .where(
      and(eq(sessions.streamerId, s.id), lte(sessions.startedAt, hi), gte(sessions.startedAt, floor)),
    );
  const overlap = rows.some((r) => r.endedAt === null || r.endedAt.getTime() >= lo.getTime());
  if (overlap) return;

  await db.insert(sessions).values({
    streamerId: s.id,
    platform: 'chzzk',
    title: b.title,
    category: b.category,
    startedAt: b.startedAt,
    endedAt: b.endedAt,
    accumulate: b.accumulate,
    source: 'backfill',
  });
  console.log(`↺ 직전 방송 리커버리 ${s.name}: ${b.startedAt.toISOString()} ~ ${b.endedAt.toISOString()}`);
}

/** 프로필 이미지·팔로워 갱신 (1시간 주기) */
async function refreshChannels(rows: Streamer[]): Promise<void> {
  for (const s of rows) {
    try {
      if (s.platform === 'chzzk' && s.chzzkId) {
        const ch = await fetchChzzkChannel(s.chzzkId);
        if (ch) {
          await db
            .update(streamers)
            .set({ profileImage: ch.profileImage, followers: ch.followers, updatedAt: new Date() })
            .where(eq(streamers.id, s.id));
        }
      } else if (s.platform === 'soop' && s.soopId) {
        const st = await fetchSoopStation(s.soopId);
        if (st) {
          await db
            .update(streamers)
            .set({ profileImage: st.profileImage, followers: st.followers, updatedAt: new Date() })
            .where(eq(streamers.id, s.id));
        }
      }
    } catch {
      /* 갱신 실패는 다음 주기에 재시도 */
    }
    await sleep(GAP_MS);
  }
  console.log('채널 정보 갱신 완료');
}
