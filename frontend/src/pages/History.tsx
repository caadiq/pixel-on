import { useEffect, useState } from 'react';
import { useDaySessions } from '../api/hooks';
import type { DaySession } from '../api/types';
import { FALLBACK_COLOR, fmtDateFull, fmtDurKo, fmtTime } from '../lib/format';
import { useTitle } from '../lib/useTitle';

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function linkOf(r: DaySession): string | null {
  if (r.liveUrl) return r.liveUrl;
  if (!r.vodId) return null;
  const [platform, no] = r.vodId.split(':');
  return platform === 'soop'
    ? `https://vod.sooplive.co.kr/player/${no}`
    : `https://chzzk.naver.com/video/${no}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return new Date(d.getTime() + days * 86400_000 + 9 * 3600_000).toISOString().slice(0, 10);
}

interface Tip {
  x: number;
  y: number;
  s: DaySession;
}

const DP_HEADS = ['일', '월', '화', '수', '목', '금', '토'];

/** 커스텀 데이트픽커 — 날짜 버튼 클릭 시 미니 달력 */
function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const [open, setOpen] = useState(false);
  const [ym, setYm] = useState<[number, number]>(() => [
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
  ]);

  // 화살표 등으로 날짜가 바뀌면 보이는 달도 따라감
  useEffect(() => {
    setYm([Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1]);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const [year, month] = ym;
  const todayKey = kstToday();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadBlanks = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const isCurrentMonth = todayKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`);

  const move = (d: number) => {
    const m = new Date(Date.UTC(year, month + d, 1));
    setYm([m.getUTCFullYear(), m.getUTCMonth()]);
  };

  return (
    <span className="dpwrap">
      <button className="db num" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {fmtDateFull(value)}
      </button>
      {open && (
        <>
          <span className="pickscrim" onClick={() => setOpen(false)} />
          <div className="dpick">
            <div className="dp-head">
              <button onClick={() => move(-1)} aria-label="이전 달">←</button>
              <b className="num">{year}년 {month + 1}월</b>
              <button onClick={() => move(1)} disabled={isCurrentMonth} aria-label="다음 달">→</button>
            </div>
            <div className="dp-grid">
              {DP_HEADS.map((d, i) => (
                <span key={d} className={`dp-h ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>{d}</span>
              ))}
              {Array.from({ length: leadBlanks }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                return (
                  <button
                    key={key}
                    className={`dp-d num ${key === value ? 'sel' : ''} ${key === todayKey ? 'today' : ''}`}
                    disabled={key > todayKey}
                    onClick={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </span>
  );
}

export function History() {
  useTitle('방송 이력');
  const [date, setDate] = useState(kstToday());
  const { data, isLoading } = useDaySessions(date);
  const [tip, setTip] = useState<Tip | null>(null);
  const isToday = date === kstToday();

  useEffect(() => setTip(null), [date]);

  const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
  const all = data?.sessions ?? [];
  /** 그날 시작한 방송 (귀속 기준) */
  const started = all.filter((r) => new Date(r.startedAt).getTime() >= dayStart);
  /** 전날 시작해 자정을 넘겨 이어진 방송 — 00시부터 이어짐 막대로 표시 */
  const carried = all.filter((r) => new Date(r.startedAt).getTime() < dayStart);
  const fullMs = (r: DaySession) =>
    (r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - new Date(r.startedAt).getTime();
  const totalMs = started.reduce((a, r) => a + fullMs(r), 0);

  const showTip = (s: DaySession) => (e: React.MouseEvent) => {
    setTip({ x: e.clientX, y: e.clientY, s });
  };

  return (
    <main className="wrap">
      <section className="sec">
        <div className="datebar">
          <button className="arr" onClick={() => setDate(shiftDate(date, -1))} aria-label="이전 날">
            ←
          </button>
          <DatePicker value={date} onChange={setDate} />
          <button className="arr" onClick={() => setDate(shiftDate(date, 1))} disabled={isToday} aria-label="다음 날">
            →
          </button>
        </div>
      </section>

      <section className="sec">
        {isLoading ? (
          <div className="loading">불러오는 중…</div>
        ) : all.length === 0 ? (
          <div className="empty">이 날은 방송 기록이 없어요</div>
        ) : (
          <>
            {/* PC: 간트 */}
            <div className="panel pc-only">
              <Summary count={started.length} totalMs={totalMs} />
              {carried.map((r) => {
                const en = Math.min(
                  1,
                  ((r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - dayStart) / 86400_000,
                );
                return (
                  <div key={r.id} className="grow" style={{ '--c': r.color ?? FALLBACK_COLOR } as React.CSSProperties}>
                    <span className="nm">
                      <img src={r.profileImage} alt="" loading="lazy" />
                      {r.name}
                    </span>
                    <span className="gt">
                      <span
                        className={`cont ${linkOf(r) ? 'linked' : ''}`}
                        style={{ left: 0, width: `${Math.max(0.5, en * 100)}%` }}
                        onMouseMove={showTip(r)}
                        onMouseLeave={() => setTip(null)}
                        onClick={() => {
                          const url = linkOf(r);
                          if (url) window.open(url, '_blank', 'noopener');
                        }}
                      />
                    </span>
                    <span className="hrs num">{(fullMs(r) / 3600_000).toFixed(1)}h</span>
                  </div>
                );
              })}
              {started.map((r) => {
                const st = (new Date(r.startedAt).getTime() - dayStart) / 86400_000;
                const rawEn = ((r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - dayStart) / 86400_000;
                const overflow = rawEn > 1;
                const en = Math.min(1, rawEn);
                return (
                  <div key={r.id} className="grow" style={{ '--c': r.color ?? FALLBACK_COLOR } as React.CSSProperties}>
                    <span className="nm">
                      <img src={r.profileImage} alt="" loading="lazy" />
                      {r.name}
                    </span>
                    <span className="gt">
                      <span
                        className={`${overflow ? 'over' : ''} ${linkOf(r) ? 'linked' : ''}`}
                        style={{ left: `${st * 100}%`, width: `${Math.max(0.5, (en - st) * 100)}%` }}
                        onMouseMove={showTip(r)}
                        onMouseLeave={() => setTip(null)}
                        onClick={() => {
                          const url = linkOf(r);
                          if (url) window.open(url, '_blank', 'noopener');
                        }}
                      />
                    </span>
                    <span className="hrs num">{(fullMs(r) / 3600_000).toFixed(1)}h</span>
                  </div>
                );
              })}
              <div className="gaxis num">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} style={{ left: `${(i / 8) * 100}%` }}>
                    {String(i * 3).padStart(2, '0')}
                  </span>
                ))}
              </div>
            </div>

            {/* 모바일: 리스트 + 24시간 미니 트랙 */}
            <div className="panel mb-only">
              <Summary count={started.length} totalMs={totalMs} />
              <div className="maxis num">
                <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span>
              </div>
              {started.map((r) => {
                const crossed = r.endedAt !== null && new Date(r.endedAt).getTime() >= dayStart + 86400_000;
                const st = (new Date(r.startedAt).getTime() - dayStart) / 86400_000;
                const rawEn = ((r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - dayStart) / 86400_000;
                const en = Math.min(1, rawEn);
                const url = linkOf(r);
                return (
                  <div key={r.id} className="mrow">
                    <img src={r.profileImage} alt="" loading="lazy" />
                    <span>
                      <span className="who">{r.name}</span>
                      <div className="rng num">
                        {fmtTime(r.startedAt)} → {r.endedAt ? `${crossed ? '익일 ' : ''}${fmtTime(r.endedAt)}` : '방송 중'}
                      </div>
                    </span>
                    <span className="hrs num">{fmtDurKo(fullMs(r))}</span>
                    <span
                      className="mtrack"
                      style={{ '--c': r.color ?? FALLBACK_COLOR } as React.CSSProperties}
                      onClick={() => url && window.open(url, '_blank', 'noopener')}
                      role={url ? 'link' : undefined}
                    >
                      <span
                        className={rawEn > 1 ? 'over' : ''}
                        style={{ left: `${Math.max(0, st) * 100}%`, width: `${Math.max(1.2, (en - Math.max(0, st)) * 100)}%` }}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {tip && <GanttTip tip={tip} dayStart={dayStart} />}

      <style>{`
        .mb-only { display: none; }
        @media (max-width: 720px) {
          .pc-only { display: none; }
          .mb-only { display: block; }
        }
      `}</style>
    </main>
  );
}

function Summary({ count, totalMs }: { count: number; totalMs: number }) {
  if (count === 0) return null;
  return (
    <div className="psum num">
      방송 <b>{count}</b>건 · 총 <b>{Math.round(totalMs / 3600_000)}</b>시간
    </div>
  );
}

/** hex 색의 밝기에 따라 대비되는 글자색 */
function contrastText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#16181d' : '#ffffff';
}

/** 커서를 따라다니는 커스텀 툴팁 */
function GanttTip({ tip, dayStart }: { tip: Tip; dayStart: number }) {
  const { s } = tip;
  const startMs = new Date(s.startedAt).getTime();
  const endMs = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
  const carried = startMs < dayStart;
  const crossed = s.endedAt !== null && endMs >= dayStart + 86400_000;
  const color = s.color ?? FALLBACK_COLOR;

  // 화면 밖으로 나가지 않게 위치 보정
  const x = Math.min(tip.x + 14, window.innerWidth - 280);
  const y = Math.max(tip.y - 12, 12);

  return (
    <div className="gtip" style={{ left: x, top: y }}>
      <div className="gtip-head">
        <img src={s.profileImage} alt="" />
        <b>{s.name}</b>
        {s.endedAt === null && <span className="live">LIVE</span>}
      </div>
      <div className="gtip-title">{s.title || '(제목 없음)'}</div>
      <div className="gtip-time num">
        {carried ? '전날 ' : ''}
        {fmtTime(s.startedAt)}
        <span className="ar">→</span>
        {s.endedAt ? `${crossed ? '익일 ' : ''}${fmtTime(s.endedAt)}` : '방송 중'}
        <span className="dur" style={{ background: color, color: contrastText(color) }}>
          {fmtDurKo(endMs - startMs)}
        </span>
      </div>
    </div>
  );
}
