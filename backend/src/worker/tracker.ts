/**
 * 방송 상태 머신 — 폴링 결과를 sessions 기록으로 변환
 *
 * 전환 규칙:
 *  CLOSE→OPEN  세션 시작 (10분 내 재시작이면 직전 세션 재개 = 끊김 병합)
 *  OPEN→OPEN   peak/제목/카테고리 갱신
 *  OPEN→CLOSE  세션 종료 (치지직은 closeDate 정확값, 숲은 폴링 감지 시각)
 *
 * 서버 재시작 대비:
 *  - 기동 시 endedAt IS NULL 세션을 읽어 메모리 상태 복원
 *  - 같은 openDate(±60초)의 세션이 이미 있으면 새로 만들지 않고 이어받음
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { sessions, type Session } from '../db/schema.js';

/** 이 간격 이내 재시작은 같은 방송으로 병합 (인터넷 끊김 대응) */
const MERGE_WINDOW_MS = 10 * 60 * 1000;
/** openDate가 이 오차 이내면 같은 방송으로 판단 */
const SAME_OPEN_TOLERANCE_MS = 60 * 1000;
/** 시청자 스냅샷 간격 */
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export interface LiveInfo {
  title: string;
  category: string | null;
  viewers: number;
  accumulate: number | null;
  /** 플랫폼이 주는 정확한 시작 시각 */
  startedAt: Date;
  /** 플랫폼이 주는 정확한 종료 시각 (숲은 없음 → null) */
  endedAt: Date | null;
}

interface TrackerState {
  /** 현재 진행 중인 세션 id (없으면 오프라인) */
  sessionId: number | null;
  lastSnapshotAt: number;
}

const states = new Map<number, TrackerState>();

function state(streamerId: number): TrackerState {
  let s = states.get(streamerId);
  if (!s) {
    s = { sessionId: null, lastSnapshotAt: 0 };
    states.set(streamerId, s);
  }
  return s;
}

/** 기동 시 미종료 세션 복원 */
export async function restoreOpenSessions(): Promise<number> {
  const open = await db.select().from(sessions).where(isNull(sessions.endedAt));
  for (const s of open) {
    states.set(s.streamerId, { sessionId: s.id, lastSnapshotAt: 0 });
  }
  return open.length;
}

/** 방송 중 신호 처리 */
export async function onLive(
  streamerId: number,
  platform: 'chzzk' | 'soop',
  live: LiveInfo,
): Promise<void> {
  const st = state(streamerId);

  if (st.sessionId === null) {
    const resumed = await findResumable(streamerId, live.startedAt);
    if (resumed) {
      // 직전 세션 병합(끊김 재시작) 또는 재시작 전 세션 이어받기
      await db
        .update(sessions)
        .set({ endedAt: null, title: live.title || undefined })
        .where(eq(sessions.id, resumed.id));
      st.sessionId = resumed.id;
    } else {
      const [row] = await db
        .insert(sessions)
        .values({
          streamerId,
          platform,
          title: live.title,
          category: live.category,
          startedAt: live.startedAt,
          peakViewers: live.viewers,
          accumulate: live.accumulate,
          source: 'poll',
        })
        .$returningId();
      st.sessionId = row.id;
      console.log(`▶ 방송 시작 감지 #${streamerId} "${live.title}"`);
    }
  }

  // OPEN→OPEN: peak·제목·누적 갱신
  const current = await db
    .select({ peak: sessions.peakViewers, title: sessions.title, category: sessions.category })
    .from(sessions)
    .where(eq(sessions.id, st.sessionId));
  if (current.length === 0) {
    // 세션이 외부에서 삭제된 경우 — 상태 리셋 후 다음 폴링에서 재생성
    st.sessionId = null;
    return;
  }
  const cur = current[0];
  const patch: Partial<typeof sessions.$inferInsert> = {};
  if (live.viewers > cur.peak) patch.peakViewers = live.viewers;
  if (live.title && live.title !== cur.title) patch.title = live.title;
  if (live.category && live.category !== cur.category) patch.category = live.category;
  if (live.accumulate != null) patch.accumulate = live.accumulate;
  if (Object.keys(patch).length > 0) {
    await db.update(sessions).set(patch).where(eq(sessions.id, st.sessionId));
  }
}

/** 오프라인 신호 처리 — endedAt이 정확값(치지직 closeDate)이면 그걸, 아니면 지금 시각 */
export async function onOffline(streamerId: number, exactEndedAt: Date | null): Promise<void> {
  const st = state(streamerId);
  if (st.sessionId === null) return;

  await db
    .update(sessions)
    .set({ endedAt: exactEndedAt ?? new Date() })
    .where(and(eq(sessions.id, st.sessionId), isNull(sessions.endedAt)));
  console.log(`■ 방송 종료 기록 #${streamerId}`);
  st.sessionId = null;
}

/** 스냅샷을 기록해야 할 세션 id 반환 (간격 미달이면 null) */
export function snapshotDue(streamerId: number): number | null {
  const st = state(streamerId);
  if (st.sessionId === null) return null;
  const now = Date.now();
  if (now - st.lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return null;
  st.lastSnapshotAt = now;
  return st.sessionId;
}

/**
 * 이어받을 세션 탐색:
 *  1) openDate가 같은(±60초) 세션 — 방송 중 서버 재시작 케이스
 *  2) 종료 후 10분 이내 세션 — 인터넷 끊김 재시작 케이스
 */
async function findResumable(streamerId: number, startedAt: Date): Promise<Session | null> {
  const [last] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.streamerId, streamerId))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  if (!last) return null;

  if (Math.abs(last.startedAt.getTime() - startedAt.getTime()) <= SAME_OPEN_TOLERANCE_MS) {
    return last;
  }
  if (
    last.endedAt &&
    startedAt.getTime() - last.endedAt.getTime() <= MERGE_WINDOW_MS &&
    startedAt.getTime() > last.endedAt.getTime()
  ) {
    return last;
  }
  return null;
}
