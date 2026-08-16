import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { avatar } from '../lib/avatar';
import { canHover } from '../lib/device';
import { useTitle } from '../lib/useTitle';
import { useDaySessions, useStreamers, useWeeklyStats } from '../api/hooks';
import type { Streamer } from '../api/types';
import { FALLBACK_COLOR, fmtCompact, fmtDurKo } from '../lib/format';

export function Home() {
  useTitle();
  const { data: streamers, isLoading, dataUpdatedAt } = useStreamers();

  // 로딩 문구가 잠깐 떴다 사라지면 깜빡이는 느낌 — 빈 화면 뒤 진입 애니메이션으로 자연스럽게
  if (isLoading || !streamers) return <main />;

  const live = streamers
    .filter((s) => s.live)
    .sort((a, b) => (b.live?.viewers ?? 0) - (a.live?.viewers ?? 0));
  const totalViewers = live.reduce((a, s) => a + (s.live?.viewers ?? 0), 0);

  return (
    <main>
      <section className="hero">
        <div className="wrap">
          <h1>
            {live.length > 0 ? (
              <>
                지금 <mark>{live.length}명</mark>이 방송 중이에요
              </>
            ) : (
              <>지금은 모두 쉬는 중이에요</>
            )}
          </h1>
          <p>픽셀네트워크 스트리머 {streamers.length}명, 누가 언제 켰는지 한눈에.</p>
          <div className="chips">
            <span className="pill hot">
              <span className="pdot" />
              방송 중 <b>{live.length}</b>
            </span>
            <span className="pill">
              전체 <b>{streamers.length}</b>
            </span>
            {totalViewers > 0 && (
              <span className="pill">
                지금 보는 사람 <b className="num">{totalViewers.toLocaleString('ko-KR')}</b>
              </span>
            )}
            <WeeklyChip />
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className="sec">
          <div className="wrap">
            <div className="shead">
              <h2>
                <span className="pdot" />
                지금 방송 중
              </h2>
              <span className="sub">30초마다 갱신</span>
            </div>
            <div className="lives">
              {live.map((s, i) => (
                <LiveCard key={s.id} s={s} index={i} stamp={dataUpdatedAt} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="sec">
        <div className="wrap">
          <div className="shead">
            <h2>소속 스트리머</h2>
            <span className="sub">{streamers.length}명 · 가나다순</span>
          </div>
          <div className="sgrid">
            {streamers.map((s, i) => (
              <StreamerCard key={s.id} s={s} index={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="shead">
            <h2>방송 이력</h2>
            <span className="sub">오늘 켠 사람들</span>
            <Link to="/history" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: 'var(--soft)' }}>
              전체보기 →
            </Link>
          </div>
          <div className="two">
            <TodayPanel />
            <WeekPanel />
          </div>
        </div>
      </section>
    </main>
  );
}

function WeeklyChip() {
  const { data } = useWeeklyStats();
  if (!data) return null;
  return (
    <span className="pill">
      이번 주 <b className="num">{data.totalHours}시간</b>
    </span>
  );
}

const POP_W = 480;

/** 호버 미리보기 — 카드 옆 플로팅 팝업에서 hls.js 재생 (치지직만, 720p) */
function LivePreview({ s, anchor }: { s: Streamer; anchor: DOMRect }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let hls: { destroy(): void } | null = null;
    let alive = true;
    void (async () => {
      const res = await fetch(`/api/streamers/${s.id}/preview`);
      const { url } = (await res.json()) as { url: string | null };
      const video = videoRef.current;
      if (!alive || !url || !video) return;
      const { default: Hls } = await import('hls.js');
      if (!alive) return;
      if (Hls.isSupported()) {
        const h = new Hls({ maxBufferLength: 12 });
        hls = h;
        h.on(Hls.Events.MANIFEST_PARSED, () => {
          // 720p 고정 (없으면 최고 화질) — levels는 낮은 화질부터 정렬
          const idx = h.levels.findIndex((l) => l.height >= 720);
          h.currentLevel = idx >= 0 ? idx : h.levels.length - 1;
        });
        h.loadSource(url);
        h.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url; // Safari 네이티브 HLS
      } else {
        return;
      }
      void video.play().catch(() => {});
    })();
    return () => {
      alive = false;
      hls?.destroy();
    };
  }, [s.id]);

  // 카드 오른쪽에, 공간 없으면 왼쪽에. 세로는 카드 중앙 정렬 후 화면 안으로 클램프
  const total = (POP_W * 9) / 16 + 88;
  let left = anchor.right + 14;
  if (left + POP_W > window.innerWidth - 8) left = anchor.left - POP_W - 14;
  const top = Math.min(Math.max(anchor.top + anchor.height / 2 - total / 2, 8), window.innerHeight - total - 8);

  return createPortal(
    <div className="lpop" style={{ left, top, width: POP_W, '--c': s.color ?? FALLBACK_COLOR } as React.CSSProperties}>
      <div className="lpop-vid">
        {s.live?.thumbnail && <img src={s.live.thumbnail} alt="" />}
        <video ref={videoRef} className={playing ? 'on' : ''} muted playsInline onPlaying={() => setPlaying(true)} />
        <span className="lpop-live">● LIVE</span>
        <span className="lpop-vw num">{s.live!.viewers.toLocaleString('ko-KR')}명 시청 중</span>
      </div>
      <div className="lpop-info">
        <b>{s.live!.title}</b>
        <div className="lpop-row">
          <span className="nm">{s.name}</span>
          <span className="up num">{fmtDurKo(Date.now() - new Date(s.live!.startedAt).getTime())}</span>
          {s.live!.category && <span className="ct">{s.live!.category}</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 라이브 썸네일 — 새 스냅샷을 미리 로드한 뒤 이전 장면 위로 크로스페이드 */
function LiveThumb({ src }: { src: string }) {
  const [curr, setCurr] = useState(src);
  const [prev, setPrev] = useState<string | null>(null);
  useEffect(() => {
    if (src === curr) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      setPrev(curr);
      setCurr(src);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, curr]);
  return (
    <>
      {prev && <img className="thumbimg" src={prev} alt="" />}
      <img
        key={curr}
        className={`thumbimg ${prev ? 'xfade' : ''}`}
        src={curr}
        alt=""
        decoding="async"
        onAnimationEnd={() => setPrev(null)}
      />
    </>
  );
}


function LiveCard({ s, index, stamp }: { s: Streamer; index: number; stamp: number }) {
  const c = s.color ?? FALLBACK_COLOR;
  // 방송 중 썸네일 URL은 고정이라 캐시버스터를 붙여야 30초 갱신 때 새 스냅샷이 옴
  const raw = s.live?.thumbnail ?? null;
  const thumb = raw ? `${raw}${raw.includes('?') ? '&' : '?'}t=${stamp}` : null;

  // 호버 0.5초 유지 시 라이브 미리보기 (치지직만 — 숲은 재생 토큰 체계가 달라 미지원)
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const enter = (e: React.MouseEvent) => {
    if (!canHover() || s.platform !== 'chzzk') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimer.current = window.setTimeout(() => setAnchor(rect), 500);
  };
  const leave = () => {
    window.clearTimeout(hoverTimer.current);
    setAnchor(null);
  };
  // 스크롤하면 위치가 어긋나므로 닫기
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [anchor]);

  return (
    <a
      href={s.live!.url}
      target="_blank"
      rel="noreferrer"
      className="lvc"
      style={{ '--c': c, animationDelay: `${index * 0.06}s` } as React.CSSProperties}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div className="thumb">
        {thumb ? (
          <LiveThumb src={thumb} />
        ) : (
          <div className="thumbfallback" />
        )}
        {anchor && <LivePreview s={s} anchor={anchor} />}
        <span className="lbdg">
          <span className="onair">
            <i />
            LIVE
          </span>
          <span className="vw num">
            <i className="vdot" />
            {s.live!.viewers.toLocaleString('ko-KR')}명
          </span>
        </span>
        <span className="uptime num">{fmtDurKo(Date.now() - new Date(s.live!.startedAt).getTime())} 방송 중</span>
      </div>
      <div className="bd">
        <div className="who">
          <img className="wpf" src={avatar(s.profileImage)} alt="" loading="lazy" decoding="async" />
          <b>{s.name}</b>
        </div>
        <p>{s.live!.title}</p>
        {s.live!.category && <span className="cat">{s.live!.category}</span>}
      </div>
    </a>
  );
}

function StreamerCard({ s, index }: { s: Streamer; index: number }) {
  const c = s.color ?? FALLBACK_COLOR;
  return (
    <Link
      to={`/streamer/${s.id}`}
      className={`scard ${s.live ? 'on' : ''}`}
      style={{ '--c': c, animationDelay: `${Math.min(index * 0.035, 0.5)}s` } as React.CSSProperties}
    >
      {s.live && (
        <span className="onair">
          <i />
          LIVE
        </span>
      )}
      {/* lazy면 3줄째부터 등장 애니메이션 중에 디코딩돼 프레임 드랍 — 즉시 로드 + 비동기 디코딩 */}
      <img className="av" src={avatar(s.profileImage, 240)} alt="" decoding="async" />
      <b>{s.name}</b>
      <span className="vw num">❤ {fmtCompact(s.followers)}</span>
    </Link>
  );
}

function TodayPanel() {
  const { data } = useDaySessions();
  // 오늘 시작한 방송만 (전날 시작해 이어진 방송은 제외 — 시작 위치가 음수가 됨)
  const dayStart0 = data ? new Date(`${data.date}T00:00:00+09:00`).getTime() : 0;
  const rows = (data?.sessions ?? [])
    .filter((r) => new Date(r.startedAt).getTime() >= dayStart0)
    .slice(0, 8);
  return (
    <div className="panel">
      <h3>
        <span className="mark" />
        오늘의 방송 시간대
      </h3>
      {rows.length === 0 && <div className="empty">아직 오늘 방송한 사람이 없어요</div>}
      {rows.map((r) => {
        const dayStart = new Date(`${data!.date}T00:00:00+09:00`).getTime();
        const st = (new Date(r.startedAt).getTime() - dayStart) / 86400_000;
        const endMs = r.endedAt ? new Date(r.endedAt).getTime() : Date.now();
        const rawEn = (endMs - dayStart) / 86400_000;
        const en = Math.min(1, rawEn);
        const ms = endMs - new Date(r.startedAt).getTime();
        return (
          <div key={r.id} className="trow" style={{ '--c': r.color ?? FALLBACK_COLOR } as React.CSSProperties}>
            <span className="nm">{r.name}</span>
            <span className="track">
              <span
                className={rawEn > 1 ? 'over' : ''}
                style={{ left: `${st * 100}%`, width: `${Math.max(1, (en - st) * 100)}%` }}
              />
            </span>
            <span className="hrs num">{(ms / 3600_000).toFixed(1)}h</span>
          </div>
        );
      })}
      {rows.length > 0 && (
        <div className="axis">
          <span>00시</span>
          <span>06시</span>
          <span>12시</span>
          <span>18시</span>
          <span>24시</span>
        </div>
      )}
    </div>
  );
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function WeekPanel() {
  const { data } = useWeeklyStats();
  if (!data) return <div className="panel loading">…</div>;

  // 이번 주 월요일부터 일요일까지 고정 (아직 오지 않은 날은 빈 칸)
  const byDate = new Map(data.daily.map((d) => [d.date, d.hours]));
  const todayKey = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const monday = new Date(`${data.weekStart}T00:00:00+09:00`);
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = new Date(monday.getTime() + i * 86400_000 + 9 * 3600_000).toISOString().slice(0, 10);
    return { label: DAY_LABELS[i], hours: byDate.get(key) ?? 0, future: key > todayKey };
  });
  const max = Math.max(...days.map((d) => d.hours), 1);
  const level = (h: number) =>
    h === 0 ? '#f1f3f6' : h < max * 0.34 ? '#d3f5e9' : h < max * 0.67 ? '#96e6c9' : 'var(--mint)';

  return (
    <div className="panel">
      <h3>
        <span className="mark" style={{ background: 'var(--accent)' }} />
        이번 주 활동
      </h3>
      <div className="wcal">
        {days.map((d, i) => (
          <div key={i} className="dh">
            {d.label}
          </div>
        ))}
        {days.map((d, i) => (
          <div
            key={`c${i}`}
            className={`d ${d.future ? 'future' : ''}`}
            data-tip={d.future ? '아직 오지 않은 날' : `${d.hours}시간`}
            style={{ background: level(d.hours) }}
          />
        ))}
      </div>
      <dl className="kv">
        <dt>총 방송 시간</dt>
        <dd className="num">{data.totalHours}시간</dd>
        {data.longest && (
          <>
            <dt>가장 길게</dt>
            <dd>
              <span className="kwho">{data.longest.name}</span>
              {fmtDurKo(data.longest.hours * 3600_000)}
            </dd>
          </>
        )}
        {data.bestPeak && data.bestPeak.peak > 0 && (
          <>
            <dt>최다 시청</dt>
            <dd className="num">
              <span className="kwho">{data.bestPeak.name}</span>
              {data.bestPeak.peak.toLocaleString('ko-KR')}명
            </dd>
          </>
        )}
        {data.topWeekday && (
          <>
            <dt>가장 많이 켠 요일</dt>
            <dd>
              {/* 위 항목들과 동일하게 왼쪽이 칩(대상), 오른쪽이 값 */}
              <span className="kwho">{DAY_LABELS[data.topWeekday.weekday]}요일</span>
              {data.topWeekday.count}회
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
