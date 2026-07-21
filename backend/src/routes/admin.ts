/** 관리자 라우트 — 로그인 시 발급되는 JWT를 Authorization: Bearer 로 검증 */
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { sign, verify } from 'hono/jwt';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { adminUsers, sessions, snapshots, streamers } from '../db/schema.js';
import { fetchChzzkChannel, searchChzzkChannels } from '../services/chzzk.js';
import { extractColorFromUrl } from '../services/palette.js';
import { fetchSoopStation, searchSoopChannels } from '../services/soop.js';
import { backfillStreamer } from '../worker/backfill.js';

export const adminRoute = new Hono();

const TOKEN_TTL = 60 * 60 * 24 * 7; // 7일

/** 로그인 — DB의 bcrypt 해시와 대조 후 JWT 발급. 인증 미들웨어 이전(공개) */
adminRoute.post('/login', async (c) => {
  const { user, password } = await c.req.json<{ user?: string; password?: string }>();
  if (!user || !password) return c.json({ error: '아이디와 비밀번호를 입력하세요' }, 400);

  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.username, user));
  const ok = row ? await bcrypt.compare(password, row.passwordHash) : false;
  if (!ok) return c.json({ error: '아이디 또는 비밀번호가 올바르지 않아요' }, 401);

  const token = await sign(
    { sub: row!.username, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL },
    config.jwtSecret,
    'HS256',
  );
  return c.json({ token });
});

adminRoute.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  if (!token || !config.jwtSecret) return c.json({ error: 'unauthorized' }, 401);
  try {
    await verify(token, config.jwtSecret, "HS256");
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

/** 인증 확인용 */
adminRoute.get('/ping', (c) => c.json({ ok: true }));

/** 전체 목록 (비활성 포함) */
adminRoute.get('/streamers', async (c) => {
  const rows = await db.select().from(streamers).orderBy(asc(streamers.sortName));
  return c.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      platform: s.platform,
      chzzkId: s.chzzkId,
      soopId: s.soopId,
      profileImage: s.profileImage,
      followers: s.followers,
      color: s.color,
      autoColor: s.autoColor,
      active: s.active,
    })),
  );
});

/** 채널 검색 (치지직 + 숲 동시) */
adminRoute.get('/search', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ chzzk: [], soop: [] });
  const [chzzk, soop] = await Promise.all([
    searchChzzkChannels(q).catch(() => []),
    searchSoopChannels(q).catch(() => []),
  ]);
  return c.json({ chzzk, soop });
});

/** 추가 — 채널 정보·색 자동 채움 */
adminRoute.post('/streamers', async (c) => {
  const body = await c.req.json<{ platform: 'chzzk' | 'soop'; chzzkId?: string; soopId?: string }>();

  let name = '';
  let profileImage = '';
  let followers = 0;

  if (body.platform === 'chzzk') {
    if (!body.chzzkId) return c.json({ error: 'chzzkId 필요' }, 400);
    const ch = await fetchChzzkChannel(body.chzzkId);
    if (!ch) return c.json({ error: '치지직 채널을 찾을 수 없어요' }, 404);
    name = ch.name;
    profileImage = ch.profileImage;
    followers = ch.followers;
  } else {
    if (!body.soopId) return c.json({ error: 'soopId 필요' }, 400);
    const st = await fetchSoopStation(body.soopId);
    if (!st) return c.json({ error: '숲 채널을 찾을 수 없어요' }, 404);
    name = st.nickname;
    profileImage = st.profileImage;
    followers = st.followers;
  }

  const now = new Date();
  const [row] = await db
    .insert(streamers)
    .values({
      name,
      platform: body.platform,
      chzzkId: body.chzzkId ?? null,
      soopId: body.soopId ?? null,
      profileImage,
      followers,
      sortName: name,
      autoColor: await extractColorFromUrl(profileImage),
      createdAt: now,
      updatedAt: now,
    })
    .$returningId();

  return c.json({ id: row.id, name }, 201);
});

/** 수정 — 대표색, 활성, 이름, 플랫폼 전환(chzzk/soop + 각 ID) */
adminRoute.patch('/streamers/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    color?: string | null;
    active?: boolean;
    name?: string;
    sortName?: string;
    platform?: 'chzzk' | 'soop';
    chzzkId?: string | null;
    soopId?: string | null;
  }>();

  const patch: Partial<typeof streamers.$inferInsert> = { updatedAt: new Date() };
  if ('color' in body) {
    if (body.color !== null && !/^#[0-9a-fA-F]{6}$/.test(body.color!)) {
      return c.json({ error: '색은 #RRGGBB 형식' }, 400);
    }
    patch.color = body.color;
  }
  if (body.active !== undefined) patch.active = body.active;
  if (body.name) patch.name = body.name;
  if (body.sortName) patch.sortName = body.sortName;
  if (body.platform) patch.platform = body.platform;
  if ('chzzkId' in body) patch.chzzkId = body.chzzkId || null;
  if ('soopId' in body) patch.soopId = body.soopId || null;

  // 주 플랫폼으로 전환 시 해당 플랫폼 채널 정보로 프로필·팔로워 갱신
  if (body.platform) {
    const chId = body.chzzkId ?? undefined;
    const spId = body.soopId ?? undefined;
    const fresh =
      body.platform === 'chzzk'
        ? chId
          ? await fetchChzzkChannel(chId).catch(() => null)
          : null
        : spId
          ? await fetchSoopStation(spId).catch(() => null)
          : null;
    if (fresh) {
      patch.profileImage = fresh.profileImage;
      patch.followers = fresh.followers;
    }
  }

  await db.update(streamers).set(patch).where(eq(streamers.id, id));
  return c.json({ ok: true });
});

/** 삭제 — 스트리머와 그 방송 기록·스냅샷 완전 제거 */
adminRoute.delete('/streamers/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const sess = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.streamerId, id));
  for (const s of sess) {
    await db.delete(snapshots).where(eq(snapshots.sessionId, s.id));
  }
  await db.delete(sessions).where(eq(sessions.streamerId, id));
  await db.delete(streamers).where(eq(streamers.id, id));
  return c.json({ ok: true });
});

/** 백필 수동 트리거 (비동기 실행) */
adminRoute.post('/streamers/:id/backfill', async (c) => {
  const id = Number(c.req.param('id'));
  const [s] = await db.select().from(streamers).where(eq(streamers.id, id));
  if (!s) return c.json({ error: 'not found' }, 404);

  void backfillStreamer(s)
    .then((n) => console.log(`관리자 백필 ${s.name}: +${n}건`))
    .catch((e) => console.error(`관리자 백필 실패 ${s.name}:`, e));
  return c.json({ started: true });
});
