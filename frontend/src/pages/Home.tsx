import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { avatar } from '../lib/avatar';
import { useTitle } from '../lib/useTitle';
import { useDaySessions, useStreamers, useWeeklyStats } from '../api/hooks';
import type { Streamer } from '../api/types';
import { FALLBACK_COLOR, fmtCompact, fmtDurKo, fmtMinOfDay } from '../lib/format';

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

/** 라이브 썸네일 — 새 스냅샷을 백그라운드에서 미리 로드한 뒤 교체 (깜빡임 없음) */
function LiveThumb({ src }: { src: string }) {
  const [shown, setShown] = useState(src);
  useEffect(() => {
    if (src === shown) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) setShown(src);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, shown]);
  return <img className="thumbimg" src={shown} alt="" decoding="async" />;
}

function LiveCard({ s, index, stamp }: { s: Streamer; index: number; stamp: number }) {
  const c = s.color ?? FALLBACK_COLOR;
  // 방송 중 썸네일 URL은 고정이라 캐시버스터를 붙여야 30초 갱신 때 새 스냅샷이 옴
  const raw = s.live?.thumbnail ?? null;
  const thumb = raw ? `${raw}${raw.includes('?') ? '&' : '?'}t=${stamp}` : null;
  return (
    <a
      href={s.live!.url}
      target="_blank"
      rel="noreferrer"
      className="lvc"
      style={{ '--c': c, animationDelay: `${index * 0.06}s` } as React.CSSProperties}
    >
      <div className="thumb">
        {thumb ? (
          <LiveThumb src={thumb} />
        ) : (
          <div className="thumbfallback" />
        )}
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

  // 최근 7일을 월~일 순서로
  const byDate = new Map(data.daily.map((d) => [d.date, d.hours]));
  const days: { label: string; hours: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const weekday = (new Date(d.getTime() + 9 * 3600_000).getUTCDay() + 6) % 7;
    days.push({ label: DAY_LABELS[weekday], hours: byDate.get(key) ?? 0 });
  }
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
          <div key={`c${i}`} className="d" data-tip={`${d.hours}시간`} style={{ background: level(d.hours) }} />
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
        {data.avgStartMin != null && (
          <>
            <dt>평균 시작 시각</dt>
            <dd className="num">{fmtMinOfDay(data.avgStartMin)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
