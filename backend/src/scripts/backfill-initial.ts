/**
 * 초기 백필 — 전 스트리머의 VOD 전체를 역산해 과거 이력 구축 (1회 실행)
 * 실행: DB_HOST=<호스트> npx tsx src/scripts/backfill-initial.ts [스트리머이름]
 */
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { streamers } from '../db/schema.js';
import { backfillStreamer } from '../worker/backfill.js';

async function main() {
  const only = process.argv[2];
  const rows = await db.select().from(streamers).where(eq(streamers.active, true));
  const targets = only ? rows.filter((r) => r.name === only) : rows;
  if (targets.length === 0) {
    console.log(`대상 없음: ${only}`);
    return;
  }

  let total = 0;
  for (const s of targets) {
    const started = Date.now();
    const created = await backfillStreamer(s);
    total += created;
    console.log(`${s.name.padEnd(6)} +${created}건 (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  console.log(`완료: 총 ${total}건 생성`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
