# 📺 PIXEL ON

픽셀네트워크(MCN) 소속 스트리머 29명의 방송을 추적·기록하는 비공식 팬사이트입니다. 치지직·숲(SOOP) 라이브 현황, 방송 이력 타임라인, 방송 기록 달력, 다시보기까지 한곳에서 볼 수 있습니다.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite)
![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle)
![MySQL](https://img.shields.io/badge/MariaDB-MySQL2-003545?logo=mariadb)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker)

---

## ✨ 주요 기능

- 🔴 **지금 방송 중** - 라이브 썸네일·시청자수·업타임, 30초 갱신, 카드 클릭 시 방송으로 이동
- 👥 **소속 스트리머** - 대표색 그라데이션 카드 그리드 (프로필 색 자동 추출 + 수동 지정)
- 📊 **방송 이력** - 날짜별 24시간 간트 타임라인 (스트리머당 한 트랙, 자정 넘김·이어보기 링크)
- 📅 **방송 기록 달력** - 스트리머 상세의 달력 아코디언, 날짜 클릭 시 그날 방송·다시보기 펼침
- ⏰ **방송 패턴** - 시간대·요일 히스토그램 (최근 180일), 평균 시작 시각·최다 카테고리 통계
- 🎬 **다시보기** - PC 페이지네이션 / 모바일 무한 스크롤(창 가상화) + 플로팅 스트리머 필터
- 🛰️ **자동 수집 워커** - 치지직·숲 비공식 API 60초 폴링, 10분 내 재시작 병합, VOD 백필, 직전 방송 리커버리
- 🛠️ **관리자** - JWT 로그인(bcrypt), 스트리머 추가/삭제·플랫폼 전환·대표색 관리·백필 트리거
- 📱 **반응형** - PC / 태블릿 / 모바일 레이아웃 분기 (모바일은 치지직 앱 스타일 리스트)

---

## 📁 프로젝트 구조

```
pixel/
├── frontend/                 # React 19 + TypeScript + Vite
│   └── src/
│       ├── pages/            # Home · History · StreamerDetail · Vods · Admin
│       ├── components/       # Layout · BroadcastRecord(달력 아코디언) · StreamerPicker
│       ├── api/              # React Query 훅 · 타입
│       ├── lib/              # format · avatar(CDN 리사이즈) · useDismiss · useTitle
│       └── styles/           # 순수 CSS (Jua + Pretendard)
│
├── backend/                  # Hono + Drizzle + TypeScript (tsx 런타임, 빌드 없음)
│   └── src/
│       ├── routes/           # streamers · streamerDetail · stats · admin(JWT)
│       ├── services/         # chzzk · soop 비공식 API 어댑터 · palette(색 추출)
│       ├── worker/           # poller(60초 폴링) · tracker(세션 기록) · backfill(VOD)
│       ├── db/               # Drizzle 스키마 (streamers · sessions · snapshots · admin_users)
│       ├── scripts/          # seed · set-admin · backfill-initial 등 일회성 도구
│       └── lib/              # time(KST) · color
│
├── PLAN.md                   # 설계·비공식 API 실측 기록
└── docker-compose.yml        # backend + frontend(dev watch) + frontend-prod(nginx)
```

---

## 🛠️ 기술 스택

### Frontend

| 기술 | 설명 |
|------|------|
| **React 19 + TypeScript** | UI |
| **Vite 7** | 빌드 도구 / 개발 서버 |
| **순수 CSS** | 단일 컴포넌트 시트, 화이트 테마 고정 |
| **TanStack React Query 5** | 서버 상태 / 폴링 갱신 |
| **TanStack React Virtual** | 모바일 다시보기 창 가상화 |
| **React Router 7** | 라우팅 |
| **react-colorful** | 관리자 대표색 픽커 |

### Backend

| 기술 | 설명 |
|------|------|
| **Hono 4** | 웹 프레임워크 (@hono/node-server) |
| **tsx** | TypeScript 직접 실행 (빌드 단계 없음) |
| **Drizzle ORM** | MariaDB(MySQL2) — 공유 DB의 `pixel` 스키마 |
| **hono/jwt + bcryptjs** | 관리자 인증 (HS256, 7일 만료) |
| **치지직·숲 비공식 API** | 어댑터로 격리 (`services/chzzk.ts` · `soop.ts`) — 깨지면 여기만 수정 |

---

## 🚀 개발 & 실행

### Docker (운영)

```bash
docker compose up -d --build                     # 전체 빌드 및 시작
docker compose up -d --build pixel-frontend-prod # 프론트만 재배포
docker compose logs -f pixel-backend             # 워커/API 로그
```

> `caddy`, `app`, `db` 외부 네트워크와 `backend/.env` 설정이 필요합니다.

### 환경 변수 (`backend/.env`)

```env
DB_HOST=mariadb
DB_USER=pixel
DB_PASSWORD=...
DB_NAME=pixel
JWT_SECRET=...        # 관리자 토큰 서명
```

관리자 계정은 스크립트로 생성합니다 (평문 저장 없음):

```bash
docker exec pixel-backend npx tsx src/scripts/set-admin.ts <아이디> <비밀번호>
```

### DB 스키마 변경

```bash
cd backend && npx drizzle-kit generate   # SQL 생성 후 docker exec로 적용
```

---

## 📝 데이터 수집 규칙

- **세션 기록**: 시작·종료는 API 정확값 사용, 10분 내 재시작은 한 세션으로 병합
- **방송일 귀속**: 시작일 기준 (자정을 넘겨도 시작한 날의 방송)
- **백필**: VOD 기반 과거 기록 보충 (`source='backfill'` ≈ 근사값), 폴링 공백은 직전 방송 리커버리로 복구
- **숲 카테고리**: 번호로만 내려오는 값을 카테고리 사전(6시간 캐시)으로 이름 변환

---

## 🌐 접속

- **운영**: https://pixel.caadiq.co.kr
- **개발**: https://dev.pixel.caadiq.co.kr (Vite watch)
- **관리자**: `/admin`

---

## 📄 라이선스

MIT — 비공식 팬 제작 사이트로 픽셀네트워크 및 소속 스트리머와 무관합니다.
