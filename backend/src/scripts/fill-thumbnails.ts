/**
 * 기존 세션 썸네일 일괄 채움 (1회) — VOD 목록을 다시 순회해 vodId 매칭으로 URL 저장
 * 실행: DB_HOST=<호스트> npx tsx src/scripts/fill-thumbnails.ts
 */
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { sessions, streamers } from '../db/schema.js';
import { fetchChzzkVideos } from '../services/chzzk.js';
import { fetchSoopVods } from '../services/soop.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows = await db.select().from(streamers);

  for (const s of rows) {
    // 이 스트리머에서 썸네일이 비어 있는 vodId 목록
    const missing = await db
      .select({ id: sessions.id, vodId: sessions.vodId })
      .from(sessions)
      .where(
        and(eq(sessions.streamerId, s.id), isNull(sessions.thumbnail), isNotNull(sessions.vodId)),
      );
    if (missing.length === 0) {
      console.log(`${s.name.padEnd(6)} 채울 것 없음`);
      continue;
    }

    // VOD 전체 순회로 vodId → thumbnail 맵 구축
    const thumbs = new Map<string, string>();
    if (s.chzzkId) {
      for (let page = 0; ; page++) {
        const res = await fetchChzzkVideos(s.chzzkId, page);
        if (!res) break;
        for (const v of res.videos) if (v.thumbnail) thumbs.set(`chzzk:${v.videoNo}`, v.thumbnail);
        if (!res.hasMore) break;
        await sleep(250);
      }
    }
    if (s.soopId) {
      for (let page = 1; ; page++) {
        const res = await fetchSoopVods(s.soopId, page);
        if (!res) break;
        for (const v of res.vods) if (v.thumbnail) thumbs.set(`soop:${v.titleNo}`, v.thumbnail);
        if (!res.hasMore) break;
        await sleep(250);
      }
    }

    let filled = 0;
    for (const m of missing) {
      const t = m.vodId ? thumbs.get(m.vodId) : undefined;
      if (!t) continue;
      await db.update(sessions).set({ thumbnail: t }).where(eq(sessions.id, m.id));
      filled++;
    }
    console.log(`${s.name.padEnd(6)} ${filled}/${missing.length}건 채움`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
