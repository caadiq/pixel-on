/**
 * 관리자 계정 생성/변경 — bcrypt 해시로 저장 (평문 미저장)
 * 실행: DB_HOST=<host> npx tsx src/scripts/set-admin.ts <username> <password>
 */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { adminUsers } from '../db/schema.js';

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error('사용법: set-admin.ts <username> <password>');
    process.exitCode = 1;
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
  if (existing) {
    await db.update(adminUsers).set({ passwordHash: hash }).where(eq(adminUsers.id, existing.id));
    console.log(`비밀번호 변경: ${username}`);
  } else {
    await db.insert(adminUsers).values({ username, passwordHash: hash, createdAt: new Date() });
    console.log(`계정 생성: ${username}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
