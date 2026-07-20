/**
 * 대표색 일괄 추출 — autoColor가 비어 있는 활성 스트리머 대상 (멱등)
 * 실행: DB_HOST=<호스트> npx tsx src/scripts/extract-colors.ts [--force]
 */
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { streamers } from '../db/schema.js';
import { extractColorFromUrl } from '../services/palette.js';

async function main() {
  const force = process.argv.includes('--force');
  const rows = await db.select().from(streamers).where(eq(streamers.active, true));

  for (const s of rows) {
    if (s.autoColor && !force) {
      console.log(`${s.name.padEnd(6)} 유지 ${s.autoColor}`);
      continue;
    }
    const color = await extractColorFromUrl(s.profileImage);
    if (color) {
      await db.update(streamers).set({ autoColor: color, updatedAt: new Date() }).where(eq(streamers.id, s.id));
      console.log(`${s.name.padEnd(6)} → ${color}`);
    } else {
      console.log(`${s.name.padEnd(6)} ✗ 추출 실패 (프로필: ${s.profileImage ? '있음' : '없음'})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
