import { useEffect, useState } from 'react';
import { avatar } from '../lib/avatar';
import { useTouchMode } from '../lib/device';
import { useDismiss } from '../lib/useDismiss';
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
  const { closing, dismiss } = useDismiss(() => setOpen(false), 130);
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
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
      <button className="db num" onClick={() => (open ? dismiss() : setOpen(true))} aria-expanded={open}>
        {fmtDateFull(value)}
      </button>
      {open && (
        <>
          <span className="pickscrim" onClick={dismiss} />
          <div className={`dpick ${closing ? 'closing' : ''}`}>
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
                      dismiss();
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

  // 모바일/터치(가로 태블릿 포함): 트랙 탭 → 시트 / PC 마우스: 호버 툴팁 + 클릭 즉시 이동
  const isMobile = useTouchMode();

  useEffect(() => setTip(null), [date]);

  // PC: 호버 툴팁이 열린 채 스크롤하면 커서가 바를 벗어나도 남아있음 → 스크롤 시 닫기
  const tipOpen = tip !== null;
  useEffect(() => {
    if (!tipOpen || isMobile) return;
    const close = () => setTip(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [tipOpen, isMobile]);

  const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
  const all = data?.sessions ?? [];
  const fullMs = (r: DaySession) =>
    (r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - new Date(r.startedAt).getTime();

  /** 스트리머 단위로 묶기 — 하루에 여러 번 방송해도 한 줄에 여러 조각으로 */
  const groupMap = new Map<number, DaySession[]>();
  for (const r of all) {
    const arr = groupMap.get(r.streamerId);
    if (arr) arr.push(r);
    else groupMap.set(r.streamerId, [r]);
  }
  const groups = [...groupMap.values()]
    .map((sessions) => {
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const rep = sessions[0];
      // 그날 '시작한' 방송의 총 시간 (전날 이어진 것은 제외 = 시작일 귀속)
      const ownMs = sessions
        .filter((s) => new Date(s.startedAt).getTime() >= dayStart)
        .reduce((a, s) => a + fullMs(s), 0);
      return { rep, sessions, ownMs, firstStart: new Date(rep.startedAt).getTime() };
    })
    .sort((a, b) => a.firstStart - b.firstStart);

  // 상단 요약: 그날 시작한 방송 건수·총시간
  const startedAll = all.filter((r) => new Date(r.startedAt).getTime() >= dayStart);
  const totalMs = startedAll.reduce((a, r) => a + fullMs(r), 0);

  const showTip = (s: DaySession) => (e: React.MouseEvent) => {
    setTip({ x: e.clientX, y: e.clientY, s });
  };

  /** 한 세션의 트랙 내 위치·상태 계산 */
  const segOf = (s: DaySession) => {
    const st = Math.max(0, (new Date(s.startedAt).getTime() - dayStart) / 86400_000);
    const rawEn = ((s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - dayStart) / 86400_000;
    return {
      st,
      en: Math.min(1, rawEn),
      carried: new Date(s.startedAt).getTime() < dayStart,
      over: rawEn > 1,
      url: linkOf(s),
    };
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
          {startedAll.length > 0 && (
            <span className="pill datesum" style={{ marginLeft: 'auto' }}>
              방송 <b className="num">{startedAll.length}</b>건 · 총{' '}
              <b className="num">{Math.round(totalMs / 3600_000)}</b>시간
            </span>
          )}
        </div>
      </section>

      <section className="sec">
        {isLoading ? (
          <div className="loading">불러오는 중…</div>
        ) : all.length === 0 ? (
          <div className="empty">이 날은 방송 기록이 없어요</div>
        ) : (
          <div className="panel">
            <div className="mb-only">
              <Summary count={startedAll.length} totalMs={totalMs} />
            </div>
            {groups.map((g, gi) => (
              <div
                key={`${date}-${g.rep.streamerId}`} /* 날짜 전환 시 행 전체 리마운트 → 일관된 페이드 */
                className="grow"
                style={{ '--c': g.rep.color ?? FALLBACK_COLOR, animationDelay: `${Math.min(gi * 0.045, 0.5)}s` } as React.CSSProperties}
              >
                <span className="nm">
                  <img src={avatar(g.rep.profileImage)} alt="" loading="lazy" />
                  {g.rep.name}
                </span>
                <span className="gt">
                  {g.sessions.map((s) => {
                    const seg = segOf(s);
                    return (
                      <span
                        key={s.id}
                        className={`${seg.carried ? 'cont' : ''} ${seg.over ? 'over' : ''} ${seg.url || isMobile ? 'linked' : ''}`}
                        style={{ left: `${seg.st * 100}%`, width: `${Math.max(0.5, (seg.en - seg.st) * 100)}%` }}
                        onMouseMove={isMobile ? undefined : showTip(s)}
                        onMouseLeave={isMobile ? undefined : () => setTip(null)}
                        onClick={(e) => {
                          if (isMobile) setTip({ x: e.clientX, y: e.clientY, s });
                          else if (seg.url) window.open(seg.url, '_blank', 'noopener');
                        }}
                      />
                    );
                  })}
                </span>
                <span className="hrs num">{g.ownMs > 0 ? `${(g.ownMs / 3600_000).toFixed(1)}h` : '—'}</span>
              </div>
            ))}
            <div className="gaxis num">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className={i % 2 === 1 ? 'odd' : ''} style={{ left: `${(i / 8) * 100}%` }}>
                  {i * 3}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {tip && <GanttTip tip={tip} dayStart={dayStart} mobile={isMobile} onClose={() => setTip(null)} />}

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

/** PC: 커서를 따라다니는 툴팁 / 모바일: 하단 시트 + 이동 버튼 */
function GanttTip({
  tip,
  dayStart,
  mobile,
  onClose,
}: {
  tip: Tip;
  dayStart: number;
  mobile: boolean;
  onClose: () => void;
}) {
  const { s } = tip;
  const { closing, dismiss } = useDismiss(onClose);

  // 모바일 시트가 떠 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!mobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobile]);
  const startMs = new Date(s.startedAt).getTime();
  const endMs = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
  const carried = startMs < dayStart;
  const crossed = s.endedAt !== null && endMs >= dayStart + 86400_000;
  const color = s.color ?? FALLBACK_COLOR;
  const url = linkOf(s);
  const live = s.endedAt === null;

  const body = (
    <>
      <div className="gtip-head">
        <img src={avatar(s.profileImage)} alt="" />
        <b>{s.name}</b>
        {live && <span className="live">LIVE</span>}
      </div>
      <div className="gtip-title">{s.title || '(제목 없음)'}</div>
      <div className="gtip-time num">
        {carried ? '어제 ' : ''}
        {fmtTime(s.startedAt)}
        <span className="ar">→</span>
        {s.endedAt ? `${crossed ? '내일 ' : ''}${fmtTime(s.endedAt)}` : '방송 중'}
        <span className="dur" style={{ background: color, color: contrastText(color) }}>
          {fmtDurKo(endMs - startMs)}
        </span>
      </div>
    </>
  );

  if (mobile) {
    return (
      <>
        <div className={`gtip-scrim ${closing ? 'closing' : ''}`} onClick={dismiss} />
        <div className={`gtip mobile ${closing ? 'closing' : ''}`}>
          {body}
          {url ? (
            <button
              className="gtip-go"
              onClick={() => window.open(url, '_blank', 'noopener')}
            >
              ▶ {live ? '방송으로 이동' : '다시보기로 이동'}
            </button>
          ) : (
            <div className="gtip-novod">다시보기가 없는 방송이에요</div>
          )}
        </div>
      </>
    );
  }

  // PC — 화면 밖으로 나가지 않게 위치 보정
  const x = Math.min(tip.x + 14, window.innerWidth - 280);
  const y = Math.max(tip.y - 12, 12);
  return (
    <div className="gtip" style={{ left: x, top: y }}>
      {body}
    </div>
  );
}
