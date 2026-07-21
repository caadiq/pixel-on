/**
 * 숫자로 저장된 숲 카테고리(예: '40019')를 이름('리그 오브 레전드')으로 일괄 변환.
 * 실행: docker exec pixel-backend npx tsx src/scripts/fix-soop-categories.ts
 */
import { like } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { soopCategoryName } from '../services/soop.js';

async function main() {
  const rows = await db
    .select({ category: sessions.category })
    .from(sessions)
    .where(sql`${sessions.category} REGEXP '^[0-9]+$'`)
    .groupBy(sessions.category);

  console.log(`숫자 카테고리 ${rows.length}종 발견`);
  for (const r of rows) {
    const no = Number(r.category);
    const name = await soopCategoryName(no);
    if (!name) {
      console.log(`  ${r.category} → 사전에 없음, 유지`);
      continue;
    }
    const res = await db
      .update(sessions)
      .set({ category: name })
      .where(like(sessions.category, r.category!));
    console.log(`  ${r.category} → ${name}`);
    void res;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
