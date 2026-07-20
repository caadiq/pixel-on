import {
  mysqlTable,
  int,
  varchar,
  datetime,
  boolean,
  mysqlEnum,
  index,
} from 'drizzle-orm/mysql-core';

/** 소속 스트리머 (계약 종료는 active=false 로 보존) */
export const streamers = mysqlTable('streamers', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  /** 주 플랫폼 — 라이브 폴링 대상 */
  platform: mysqlEnum('platform', ['chzzk', 'soop']).notNull(),
  /** 치지직 채널ID (숲 주력이어도 과거 이력용으로 보유 가능) */
  chzzkId: varchar('chzzk_id', { length: 64 }),
  soopId: varchar('soop_id', { length: 64 }),
  profileImage: varchar('profile_image', { length: 500 }).notNull().default(''),
  followers: int('followers').notNull().default(0),
  /** 수동 지정 대표색 (null이면 autoColor 사용) */
  color: varchar('color', { length: 9 }),
  /** 프로필에서 자동 추출한 대표색 */
  autoColor: varchar('auto_color', { length: 9 }),
  active: boolean('active').notNull().default(true),
  /** 가나다 정렬키 (이름과 동일하되 필요 시 수동 조정) */
  sortName: varchar('sort_name', { length: 50 }).notNull(),
  createdAt: datetime('created_at').notNull(),
  updatedAt: datetime('updated_at').notNull(),
});

/** 방송 1회 = 1행 */
export const sessions = mysqlTable(
  'sessions',
  {
    id: int('id').autoincrement().primaryKey(),
    streamerId: int('streamer_id').notNull(),
    platform: mysqlEnum('platform', ['chzzk', 'soop']).notNull(),
    title: varchar('title', { length: 300 }).notNull().default(''),
    category: varchar('category', { length: 100 }),
    /** API openDate 그대로 (정확값) */
    startedAt: datetime('started_at').notNull(),
    /** API closeDate / null = 방송 중 */
    endedAt: datetime('ended_at'),
    /** 폴링 중 관측한 최대 동시 시청자 */
    peakViewers: int('peak_viewers').notNull().default(0),
    /** 누적 시청자 (치지직 accumulateCount) */
    accumulate: int('accumulate'),
    /** poll=실시간 기록 / backfill=VOD 역산(시각 근사) */
    source: mysqlEnum('source', ['poll', 'backfill']).notNull().default('poll'),
    vodId: varchar('vod_id', { length: 64 }),
    /** 다시보기 썸네일 URL (백필·연결 시 저장) */
    thumbnail: varchar('thumbnail', { length: 500 }),
  },
  (t) => [
    index('idx_sessions_streamer_started').on(t.streamerId, t.startedAt),
    index('idx_sessions_started').on(t.startedAt),
  ],
);

/** 방송 중 시청자 수 추이 (5분 간격) */
export const snapshots = mysqlTable(
  'snapshots',
  {
    id: int('id').autoincrement().primaryKey(),
    sessionId: int('session_id').notNull(),
    at: datetime('at').notNull(),
    viewers: int('viewers').notNull(),
  },
  (t) => [index('idx_snapshots_session').on(t.sessionId)],
);

export type Streamer = typeof streamers.$inferSelect;
export type NewStreamer = typeof streamers.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
