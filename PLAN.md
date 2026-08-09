# PIXEL — 픽셀네트워크 비공식 팬사이트 계획서

> 픽셀네트워크 소속 스트리머 29명의 방송 상태를 실시간으로 보여주고,
> 언제 켜고 껐는지 전부 기록하는 개인용 팬사이트.
> 도메인: `pixel.caadiq.co.kr` · GitHub: `git@github.com:caadiq/pixel-on.git` (private)

## 1. 확정 사항

| 항목 | 결정 | 비고 |
|---|---|---|
| 용도 | 개인용 (혼자 사용) | SEO 불필요 → SPA |
| 디자인 | 시안 B 화이트 버전 | 파스텔 그리드, Jua+Pretendard |
| 대표색 | 프로필에서 자동 추출 + 관리자 수동 오버라이드 | fromis_9 theme.js 로직 이식 |
| 일정(예고) | 안 함 | 네이버 카페 robots.txt 존중, 방송 이력 추적으로 대체 |
| 앱 | 웹만 | Flutter 앱 없음 |

## 2. 기술 스택

| | 스택 | 선택 이유 |
|---|---|---|
| Frontend | Vite + React 19 + **TypeScript** | SPA로 충분, 기존 패턴 |
| Backend | **Hono + Drizzle ORM + TypeScript** (Node) | TS 네이티브 조합. Express/Sequelize 대비 타입 자동 추론 |
| DB | 공유 MariaDB, `pixel` DB (전용 계정, 자기 DB만 접근) | 기존 인프라 재사용 |
| 폴링 워커 | 백엔드 프로세스 내 setInterval | 별도 컨테이너 불필요 |
| 배포 | 컨테이너 2개 (pixel-frontend, pixel-backend), 네트워크 [app, db] | Caddy 리버스 프록시 |

- 백엔드 실행: `tsx` (개발 `tsx watch`, 프로덕션도 tsx — 빌드 단계 생략)
- 색 추출: `sharp` (fromis_9와 동일)

## 3. 데이터 소스 (2026-07 조사 · 전부 실측 검증됨)

### 치지직 (26명) — 비공식 API, 인증 불필요, 서버사이드 필수(CORS 차단)
| 용도 | 엔드포인트 |
|---|---|
| 라이브 상태 | `GET api.chzzk.naver.com/polling/v2/channels/{id}/live-status` → `status(OPEN/CLOSE)`, **`openDate`/`closeDate`(정확값)**, `concurrentUserCount`, `accumulateCount`, `liveTitle`, 카테고리 |
| 채널 정보 | `GET api.chzzk.naver.com/service/v1/channels/{id}` → 이름, 프로필, 팔로워 |
| 다시보기 | `GET api.chzzk.naver.com/service/v1/channels/{id}/videos` → `publishDate`, `duration` (과거 이력 역산용) |
| 이름 검색 | `GET api.chzzk.naver.com/service/v1/search/channels?keyword=` (관리자 스트리머 추가 시) |

- `live-status`의 `openDate/closeDate`는 종료 후에도 직전 방송 1건이 남음 → 폴링이 감지만 하면 시각은 API 정확값 사용
- 서버 권장 폴링 주기: 응답의 `callPeriodMilliSecond`(현재 10초) — 우리는 30초면 충분
- ⚠️ 비공식 API는 예고 없이 변경됨 (v1 live-detail 폐지 전례) → **호출부를 `services/chzzk.ts` 한 파일로 격리**

### 숲/SOOP (3명: 감블러·망개·윤이샘) — 비공식 API
| 용도 | 엔드포인트 |
|---|---|
| 채널+라이브 | `GET chapi.sooplive.co.kr/api/{id}/station` → `broad` 키 존재=방송중, `broad_title`, `current_sum_viewer`, `broad_start` |
| 다시보기 | `GET chapi.sooplive.co.kr/api/{id}/vods/all?page=1&per_page=N` |
| 썸네일 | `liveimg.sooplive.com/m/{broad_no}` |

- ⚠️ **브라우저 User-Agent 필수** (아니면 404 — 없는 채널로 오인 주의)
- ⚠️ 구 도메인 예제(bjapi.afreecatv.com) 사용 금지 — 현행은 `chapi.sooplive.co.kr`
- 종료 시각: station API에 종료 후 잔존 여부 미확인 → 구현 시 확인, 안 남으면 폴링 감지 시각 사용(±30초 오차 허용)
- 망개는 치지직 채널(과거)도 있음 → 주 소스는 숲, 치지직은 과거 다시보기 백필에만 사용

### 채널 ID 시드
`backend/seed-roster.json` — 치지직 검색으로 수집한 29명 channelId (2026-07-20).
숲 3명의 SOOP ID는 구현 시 수동 확인 필요. 윤이샘은 치지직 채널이 빈 껍데기(팔로워 0)이므로 숲 전용.

## 4. 데이터 모델 (Drizzle 스키마)

```
streamers
  id            PK auto
  name          varchar   -- 표시 이름
  platform      enum('chzzk','soop')  -- 주 플랫폼
  chzzkId       varchar?  -- 치지직 채널ID (숲 주력이어도 과거용으로 보유 가능)
  soopId        varchar?
  profileImage  varchar   -- 최신 프로필 URL (폴링 시 갱신)
  followers     int
  color         varchar?  -- 수동 지정 대표색 (null이면 자동 추출값 사용)
  autoColor     varchar?  -- 프로필에서 추출한 대표색 (sharp)
  active        bool      -- 계약종료 시 false (soft delete, 이력 보존)
  sortName      varchar   -- 가나다 정렬키
  createdAt / updatedAt

sessions                  -- 방송 1회 = 1행
  id            PK auto
  streamerId    FK
  platform      enum
  title         varchar
  category      varchar?
  startedAt     datetime  -- API openDate (정확값)
  endedAt       datetime? -- API closeDate / null=방송중
  peakViewers   int       -- 폴링 중 최대 concurrentUserCount
  accumulate    int?      -- 누적 시청자 (치지직 제공)
  source        enum('poll','backfill')  -- 실시간 기록 vs VOD 역산
  vodId         varchar?  -- 연결된 다시보기

snapshots                 -- 시청자 수 추이 (상세 페이지 그래프용)
  id, sessionId FK, at datetime, viewers int
  -- 5분 간격으로만 기록 (30초 폴링마다 넣으면 과함)
```

### 세션 기록 규칙
- CLOSE→OPEN 전환 감지 → 세션 생성 (startedAt = API openDate)
- OPEN→CLOSE 전환 감지 → 세션 종료 (endedAt = API closeDate)
- **10분 미만 간격 재시작은 같은 세션으로 병합** (인터넷 끊김 대응): 직전 세션 endedAt과 새 openDate 차이 < 10분이면 endedAt만 갱신
- 백필: VOD `publishDate - duration` ≈ startedAt (근사값, source='backfill'로 구분)
- 백필-폴링 중복 방지: 같은 스트리머의 startedAt ±30분 내 기존 세션 있으면 스킵

## 5. API 설계 (Hono)

```
GET  /api/streamers                # 전체 목록 + 현재 라이브 상태 (홈 화면 한 방)
GET  /api/streamers/:id            # 상세 (채널 정보 + 통계 요약)
GET  /api/streamers/:id/sessions   # 방송 이력 (페이징, ?from=&to=)
GET  /api/streamers/:id/vods       # 다시보기 (플랫폼 API 프록시 + 캐시)
GET  /api/streamers/:id/pattern    # 요일×시간대 히트맵 (통계)
GET  /api/sessions/today           # 오늘의 방송 이력 (홈 하단)
GET  /api/stats/weekly             # 주간 집계 (총시간·최장·최다시청)
GET  /api/health                   # 헬스체크

# 관리자 (X-Admin-Key 헤더, .env의 ADMIN_KEY)
POST   /api/admin/streamers        # 추가 (치지직 검색 or ID 직접 입력 → 자동 채움)
PATCH  /api/admin/streamers/:id    # 수정 (color 오버라이드, active 토글 등)
DELETE /api/admin/streamers/:id    # active=false (soft)
POST   /api/admin/streamers/:id/backfill  # VOD 백필 수동 트리거
GET    /api/admin/search?q=        # 치지직 채널 검색 프록시
```

- 라이브 상태는 폴링 워커가 메모리에 유지 → `/api/streamers`는 DB 조회 없이 즉답
- 프론트는 30초 간격 refetch (React Query)

## 6. 폴링 워커

```
매 30초:
  치지직 26명: live-status 순차 호출 (요청 간 150ms 간격, 총 ~4초)
  숲 3명: station 호출 (브라우저 UA)
  → 상태 전환 감지 시 sessions 기록
  → 5분마다 방송중인 세션에 snapshot 추가
매 1시간:
  채널 정보 갱신 (프로필 이미지·팔로워) → 프로필 변경 시 autoColor 재추출
매일 새벽 5시:
  전날 VOD 목록 확인 → 놓친 세션 백필 (서버 다운타임 보험)
```

- 에러 처리: 개별 채널 실패는 스킵하고 다음 폴링에 재시도, 3회 연속 실패 시 로그
- 간헐적 커넥션 리셋 실측됨 → fetch 타임아웃 10초 + 1회 재시도

## 7. 페이지 구성 (전부 PC + 모바일 반응형)

| 경로 | 페이지 | 내용 |
|---|---|---|
| `/` | 홈 | 히어로 칩(방송중 N명), 라이브 카드, 29명 그리드, 오늘의 방송 시간대, 주간 활동 |
| `/streamer/:id` | 스트리머 상세 | 프로필 헤더(대표색 테마), 현재 방송, 방송 캘린더(잔디), 요일×시간 패턴 히트맵, 최근 방송 목록, 다시보기 |
| `/history` | 방송 이력 | 날짜 선택 → 그날 전체 간트 차트, 스트리머 필터 |
| `/vods` | 다시보기 | 전체 스트리머 최신 VOD 그리드, 스트리머 필터 |
| `/admin` | 관리자 | 스트리머 CRUD, 대표색 피커(자동값 미리보기+오버라이드), 백필 트리거 |

- 모바일: 그리드 7열→3열, 라이브 카드 가로 스크롤, 간트는 세로 리스트로 변형
- 라이트 테마 고정 (시안 B 화이트). 다크는 후순위

## 8. 구현 단계

1. **백엔드 골격** — Hono 앱, Drizzle 스키마·마이그레이션, seed-roster 임포트
   → 검증: `/api/streamers`가 29명 반환
2. **플랫폼 어댑터 + 폴링 워커** — chzzk.ts/soop.ts, 상태 전환 기록
   → 검증: 실제 방송 켜짐/꺼짐이 sessions에 정확한 시각으로 남는지
3. **백필** — VOD 역산, 중복 방지
   → 검증: 오픈 시점에 과거 이력 존재
4. **색 추출** — fromis_9 theme.js 이식(sharp), autoColor 채움
5. **프론트 홈** — 시안 B 구현, React Query 30초 갱신
6. **프론트 나머지** — 상세/이력/다시보기/관리자
7. **배포** — Dockerfile×2, compose, Caddyfile `pixel.caadiq.co.kr`, git push

각 단계마다 커밋. (작은 단위 커밋 원칙)

## 9. 리스크·주의

- **비공식 API 의존**: 치지직·숲 모두 언제든 바뀔 수 있음 → 어댑터 파일 격리, 실패 시 로그·알림
- **레이트리밋**: 실측상 없었으나 29명×30초는 초당 1req 수준이라 여유. 429 시 지수 백오프
- **비공식 팬사이트 고지**: 푸터에 "픽셀네트워크 및 소속 스트리머와 무관" 명시
- **스트리머 변동**: 영입·계약종료는 관리자에서 추가/soft delete. 나간 사람 이력은 보존
- MariaDB `pixel` 계정은 `pixel` DB만 접근 가능 (검증 완료, 2026-07-20)
