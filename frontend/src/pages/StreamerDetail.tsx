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

function Calendar({ id, color }: { id: number; color: string }) {
  const { data } = useStreamerSessions(id);
  if (!data) return null;

  const byDate = new Map(data.daily.map((d) => [d.date, d.hours]));
  const cells: { date: string; hours: number }[] = [];
  for (let i = 181; i >= 0; i--) {
    const key = new Date(Date.now() + 9 * 3600_000 - i * 86400_000).toISOString().slice(0, 10);
    cells.push({ date: key, hours: byDate.get(key) ?? 0 });
  }
  const level = (h: number) => {
    if (h === 0) return '#f1f3f6';
    const a = h < 3 ? 0.3 : h < 6 ? 0.55 : h < 9 ? 0.8 : 1;
    return `color-mix(in srgb, ${color} ${a * 100}%, #f1f3f6)`;
  };

  return (
    <section className="sec">
      <div className="panel">
        <h3>
          <span className="mark" style={{ background: color }} />
          방송 캘린더
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--faint)' }}>최근 26주</span>
        </h3>
        <div className="grass">
          {cells.map((d) => (
            <i key={d.date} style={{ background: level(d.hours) }} title={`${d.date} · ${d.hours}시간`} />
          ))}
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
