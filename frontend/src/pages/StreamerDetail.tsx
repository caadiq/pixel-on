import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useStreamerDetail,
  useStreamerPattern,
  useStreamerSessions,
  useStreamerVods,
} from '../api/hooks';
import {
  FALLBACK_COLOR,
  fmtCompact,
  fmtDurClock,
  fmtDurKo,
  fmtMinOfDay,
  fmtRelDate,
  fmtTime,
} from '../lib/format';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export function StreamerDetail() {
  const id = Number(useParams().id);
  const { data: s, isLoading } = useStreamerDetail(id);

  if (isLoading) return <div className="loading">불러오는 중…</div>;
  if (!s) return <div className="loading">스트리머를 찾을 수 없어요</div>;

  const c = s.color ?? FALLBACK_COLOR;

  return (
    <main style={{ '--c': c } as React.CSSProperties}>
      <div className="dhead">
        <div className="wrap">
          <img src={s.profileImage} alt={s.name} />
          <div>
            <h1 className="jua">
              {s.name}
              {s.live && (
                <span className="lbadge">
                  <i />
                  LIVE
                </span>
              )}
            </h1>
            <div className="meta">
              <span className={`pfbadge ${s.platform}`}>{s.platform === 'soop' ? '숲' : '치지직'}</span>
              <span className="num">팔로워 {fmtCompact(s.followers)}</span>
              {s.live && <span>{s.live.title}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="wrap">
        <div className="dstats">
          <div className="dstat">
            <i>이번 달 방송</i>
            <b className="num">
              {s.stats.monthCount}
              <em>회 · {s.stats.monthHours}시간</em>
            </b>
          </div>
          <div className="dstat">
            <i>평균 시작 시각</i>
            <b className="num">{s.stats.avgStartMin != null ? fmtMinOfDay(s.stats.avgStartMin) : '—'}</b>
          </div>
          <div className="dstat">
            <i>최고 동시 시청</i>
            <b className="num">{s.stats.bestPeak > 0 ? s.stats.bestPeak.toLocaleString('ko-KR') : '—'}</b>
          </div>
          <div className="dstat">
            <i>주로 하는 카테고리</i>
            <b style={{ fontSize: 15 }}>{s.stats.topCategory ?? '—'}</b>
          </div>
        </div>

        <Calendar id={id} color={c} />
        <Pattern id={id} color={c} />
        <Sessions id={id} color={c} live={!!s.live} />
        <Vods id={id} color={c} />
      </div>
    </main>
  );
}

const CAL_DAY_HEADS = ['일', '월', '화', '수', '목', '금', '토'];

function Calendar({ id, color }: { id: number; color: string }) {
  const { data } = useStreamerSessions(id, 730);
  const now = new Date(Date.now() + 9 * 3600_000);
  const [ym, setYm] = useState<[number, number]>([now.getUTCFullYear(), now.getUTCMonth()]);
  if (!data) return null;

  const [year, month] = ym;
  const byDate = new Map(data.daily.map((d) => [d.date, d.hours]));
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadBlanks = first.getUTCDay(); // 일요일 시작
  const todayKey = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  const level = (h: number) => {
    if (h === 0) return 'transparent';
    const a = h < 3 ? 28 : h < 6 ? 52 : h < 9 ? 76 : 100;
    return `color-mix(in srgb, ${color} ${a}%, #fff)`;
  };

  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth();
  const move = (d: number) => {
    const m = new Date(Date.UTC(year, month + d, 1));
    setYm([m.getUTCFullYear(), m.getUTCMonth()]);
  };

  return (
    <section className="sec">
      <div className="panel">
        <h3>
          <span className="mark" style={{ background: color }} />
          방송 캘린더
          <span className="calnav">
            <button onClick={() => move(-1)} aria-label="이전 달">←</button>
            <b className="num">{year}년 {month + 1}월</b>
            <button onClick={() => move(1)} disabled={isCurrentMonth} aria-label="다음 달">→</button>
          </span>
        </h3>
        <div className="mcal">
          {CAL_DAY_HEADS.map((d, i) => (
            <div key={d} className={`mh ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>{d}</div>
          ))}
          {Array.from({ length: leadBlanks }, (_, i) => (
            <div key={`b${i}`} className="mday blank" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hours = byDate.get(key) ?? 0;
            const isFuture = key > todayKey;
            return (
              <div
                key={key}
                className={`mday ${key === todayKey ? 'today' : ''} ${isFuture ? 'future' : ''}`}
                style={{ background: level(hours) }}
                title={hours > 0 ? `${key} · ${hours}시간 방송` : key}
              >
                <span className="dn num">{day}</span>
                {hours > 0 && <span className="dh num">{hours >= 10 ? Math.round(hours) : hours}h</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Pattern({ id, color }: { id: number; color: string }) {
  const { data } = useStreamerPattern(id);
  if (!data) return null;

  const flat = data.grid.flat();
  const max = Math.max(...flat, 1);
  const level = (v: number) =>
    v === 0 ? '#f1f3f6' : `color-mix(in srgb, ${color} ${Math.round(25 + (v / max) * 75)}%, #f1f3f6)`;

  // 힌트: 최다 시간대
  let bd = 0;
  let bh = 0;
  let bv = 0;
  data.grid.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > bv) {
        bv = v;
        bd = d;
        bh = h;
      }
    }),
  );

  return (
    <section className="sec">
      <div className="panel">
        <h3>
          <span className="mark" style={{ background: color }} />
          요일 × 시간 패턴
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--faint)' }}>최근 180일 · 진할수록 자주</span>
        </h3>
        <div className="hm">
          {data.grid.map((row, d) => (
            <FragmentRow key={d} label={DAY_LABELS[d]} row={row} level={level} />
          ))}
        </div>
        {bv > 0 && (
          <div className="hm-hint">
            💡 보통 <b>{DAY_LABELS[bd]}요일 {bh}시</b> 전후에 켜요
          </div>
        )}
      </div>
    </section>
  );
}

function FragmentRow({ label, row, level }: { label: string; row: number[]; level: (v: number) => string }) {
  return (
    <>
      <span className="lab">{label}</span>
      {row.map((v, h) => (
        <i key={h} style={{ background: level(v) }} title={`${label} ${h}시 · ${v}시간`} />
      ))}
    </>
  );
}

function Sessions({ id, color, live }: { id: number; color: string; live: boolean }) {
  const { data } = useStreamerSessions(id);
  if (!data || data.sessions.length === 0) return null;

  return (
    <section className="sec">
      <div className="panel">
        <h3>
          <span className="mark" style={{ background: color }} />
          최근 방송
        </h3>
        {data.sessions.slice(0, 10).map((r) => {
          const ongoing = r.endedAt === null;
          const ms = (ongoing ? Date.now() : new Date(r.endedAt!).getTime()) - new Date(r.startedAt).getTime();
          const approx = r.source === 'backfill' ? '≈ ' : '';
          return (
            <div key={r.id} className="sesrow">
              <span className="d">{fmtRelDate(r.startedAt)}</span>
              <span className="t">{r.title || '(제목 없음)'}</span>
              <span className="dur num">
                {ongoing ? (
                  <span style={{ color: 'var(--live)' }}>방송 중</span>
                ) : (
                  `${approx}${fmtDurKo(ms)}`
                )}
              </span>
              <span className="pk num">
                {r.peakViewers > 0
                  ? `최고 ${r.peakViewers.toLocaleString('ko-KR')}`
                  : r.accumulate
                    ? `누적 ${fmtCompact(r.accumulate)}`
                    : '—'}
              </span>
            </div>
          );
        })}
        <div style={{ marginTop: 10 }} className="srcnote">
          ≈ 표시는 다시보기에서 역산한 근사 기록이에요
        </div>
      </div>
    </section>
  );
}

function Vods({ id, color }: { id: number; color: string }) {
  const { data } = useStreamerVods(id);
  if (!data || data.vods.length === 0) return null;

  return (
    <section className="sec">
      <div className="shead">
        <h2>다시보기</h2>
      </div>
      <div className="vgrid">
        {data.vods.slice(0, 8).map((v) => (
          <a key={v.id} className="vod" href={v.url} target="_blank" rel="noreferrer" style={{ '--c': color } as React.CSSProperties}>
            <div className="th">
              {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
              <span className="dur num">{fmtDurClock(v.duration)}</span>
            </div>
            <div className="bd">
              <b>{v.title}</b>
              <span className="sub">
                <span>{fmtRelDate(v.publishedAt)}</span>
                {v.category && <span>{v.category}</span>}
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
