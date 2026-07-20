/**
 * 초기 스트리머 시드 — seed-roster.json(치지직 검색 수집분) + 숲 3명
 * 실행: DB_HOST=<접근가능호스트> npx tsx src/scripts/seed.ts
 * 멱등: 이미 streamers 행이 있으면 아무것도 하지 않음
 */
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { streamers, type NewStreamer } from '../db/schema.js';
import { fetchSoopStation } from '../services/soop.js';

interface RosterEntry {
  name: string;
  found: boolean;
  channelId?: string;
  followers?: number;
  img?: string;
}

/** 주 플랫폼이 숲인 멤버 (2026-07 기준) */
const SOOP_IDS: Record<string, string> = {
  감블러: '9ambler',
  망개: 'mmange2',
  윤이샘: 'yoonesaem',
};

async function main() {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(streamers);
  if (count > 0) {
    console.log(`이미 ${count}명 존재 — 시드 생략`);
    return;
  }

  const roster: RosterEntry[] = JSON.parse(
    readFileSync(new URL('../../seed-roster.json', import.meta.url), 'utf8'),
  );

  const now = new Date();
  const rows: NewStreamer[] = [];

  for (const r of roster) {
    const soopId = SOOP_IDS[r.name];
    const row: NewStreamer = {
      name: r.name,
      platform: soopId ? 'soop' : 'chzzk',
      chzzkId: r.channelId ?? null,
      soopId: soopId ?? null,
      profileImage: r.img ?? '',
      followers: r.followers ?? 0,
      sortName: r.name,
      createdAt: now,
      updatedAt: now,
    };

    // 숲 주력은 숲 기준 프로필·애청자 수로 교체
    if (soopId) {
      const st = await fetchSoopStation(soopId);
      if (st) {
        row.profileImage = st.profileImage;
        row.followers = st.followers;
      } else {
        console.warn(`⚠ 숲 조회 실패: ${r.name}(${soopId}) — 치지직 값 유지`);
      }
    }
    rows.push(row);
  }

  await db.insert(streamers).values(rows);
  console.log(`시드 완료: ${rows.length}명 (숲 ${rows.filter((r) => r.platform === 'soop').length}명)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
