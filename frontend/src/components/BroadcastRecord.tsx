import { useMemo, useState } from 'react';
import { useStreamerPattern, useStreamerSessions } from '../api/hooks';
import type { SessionItem } from '../api/types';
import { fmtDurKo, fmtTime } from '../lib/format';

const DAY_HEADS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

const kstNow = () => new Date(Date.now() + 9 * 3600_000);
const kstKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 방송 기록 — 달력 + 선택한 날 상세 + 시간대 패턴 요약을 하나로.
 * (기존 방송 캘린더 / 요일×시간 히트맵 / 최근 방송 3개를 통합)
 */
export function BroadcastRecord({ id, color }: { id: number; color: string }) {
  const { data } = useStreamerSessions(id, 730);
  const { data: pattern } = useStreamerPattern(id);

  const now = kstNow();
  const [ym, setYm] = useState<[number, number]>([now.getUTCFullYear(), now.getUTCMonth()]);
  const [picked, setPicked] = useState<string | null>(null);

  /** 날짜별 세션 묶음 */
  const byDate = useMemo(() => {
    const m = new Map<string, SessionItem[]>();
    for (const s of data?.sessions ?? []) {
      const key = kstKey(new Date(new Date(s.startedAt).getTime() + 9 * 3600_000));
      const arr = m.get(key);
      if (arr) arr.push(s);
      else m.set(key, [s]);
    }
    return m;
  }, [data]);

  const hoursByDate = useMemo(
    () => new Map((data?.daily ?? []).map((d) => [d.date, d.hours])),
    [data],
  );

  if (!data) return null;

  const [year, month] = ym;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadBlanks = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const todayKey = kstKey(now);
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth();

  const move = (d: number) => {
    const m = new Date(Date.UTC(year, month + d, 1));
    setYm([m.getUTCFullYear(), m.getUTCMonth()]);
    setPicked(null);
  };

  const level = (h: number) => {
    if (h === 0) return 'transparent';
    const a = h < 3 ? 26 : h < 6 ? 50 : h < 9 ? 74 : 100;
    return `color-mix(in srgb, ${color} ${a}%, #fff)`;
  };

  // 선택된 날 (없으면 이 달에서 방송한 가장 최근 날)
  const monthKeys = Array.from({ length: daysInMonth }, (_, i) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
  );
  const defaultKey = [...monthKeys].reverse().find((k) => byDate.has(k)) ?? null;
  const activeKey = picked ?? defaultKey;
  const activeSessions = activeKey ? (byDate.get(activeKey) ?? []) : [];

  // 시간대 패턴 (24시간 합산)
  const hourly = pattern
    ? Array.from({ length: 24 }, (_, h) => pattern.grid.reduce((a, row) => a + row[h], 0))
    : null;
  const peakHour = hourly ? hourly.indexOf(Math.max(...hourly)) : null;
  const peakDay = pattern
    ? pattern.grid
        .map((row, i) => ({ i, sum: row.reduce((a, b) => a + b, 0) }))
        .sort((a, b) => b.sum - a.sum)[0]?.i
    : null;

  return (
    <section className="sec">
      <div className="shead">
        <h2>방송 기록</h2>
        <span className="sub">날짜를 누르면 그날 방송을 볼 수 있어요</span>
      </div>
      <div className="rec">
        {/* 달력 */}
        <div className="panel">
          <h3>
            <span className="mark" style={{ background: color }} />
            {year}년 {month + 1}월
            <span className="calnav">
              <button onClick={() => move(-1)} aria-label="이전 달">←</button>
              <button onClick={() => move(1)} disabled={isCurrentMonth} aria-label="다음 달">→</button>
            </span>
          </h3>

          <div className="mcal">
            {DAY_HEADS.map((d, i) => (
              <div key={d} className={`mh ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>
                {d}
              </div>
            ))}
            {Array.from({ length: leadBlanks }, (_, i) => (
              <div key={`b${i}`} className="mday blank" />
            ))}
            {monthKeys.map((key, i) => {
              const hours = hoursByDate.get(key) ?? 0;
              const has = byDate.has(key);
              const future = key > todayKey;
              return (
                <button
                  key={key}
                  className={`mday ${has ? 'has' : ''} ${key === todayKey ? 'today' : ''} ${
                    future ? 'future' : ''
                  } ${key === activeKey ? 'sel' : ''}`}
                  style={{ background: level(hours) }}
                  onClick={() => has && setPicked(key)}
                  disabled={!has}
                  title={hours > 0 ? `${key} · ${hours}시간` : key}
                >
                  <span className="dn num">{i + 1}</span>
                  {hours > 0 && <span className="dh num">{hours >= 10 ? Math.round(hours) : hours}h</span>}
                </button>
              );
            })}
          </div>

          {/* 시간대 패턴 요약 */}
          {hourly && peakHour !== null && peakDay !== null && (
            <div className="patline" style={{ '--c': color } as React.CSSProperties}>
              <span className="lbl">주로 켜는 시간</span>
              <span className="bars" title="0시부터 23시까지 방송 시간 분포">
                {hourly.map((v, h) => (
                  <i
                    key={h}
                    style={{ height: `${Math.max(4, (v / Math.max(...hourly, 1)) * 100)}%` }}
                    title={`${h}시 · ${v.toFixed(0)}시간`}
                  />
                ))}
              </span>
              <span className="hint">
                {DAY_NAMES[peakDay]}요일 {peakHour}시쯤
              </span>
            </div>
          )}
        </div>

        {/* 선택한 날 상세 */}
        <div className="panel dayx" style={{ '--c': color } as React.CSSProperties}>
          {activeKey ? (
            <>
              <div className="dtitle">{fmtDayTitle(activeKey)}</div>
              <div className="dsub">
                방송 {activeSessions.length}회 ·{' '}
                {fmtDurKo(activeSessions.reduce((a, s) => a + durOf(s), 0))}
              </div>
              {activeSessions.map((s) => (
                <div key={s.id} className="bcard">
                  <div className="btime num">
                    {fmtTime(s.startedAt)}
                    <span style={{ color: 'var(--faint)' }}>→</span>
                    {s.endedAt ? (
                      fmtTime(s.endedAt)
                    ) : (
                      <span style={{ color: 'var(--live)' }}>방송 중</span>
                    )}
                    <span className="dur">{fmtDurKo(durOf(s))}</span>
                  </div>
                  <div className="btitle">{s.title || '(제목 없음)'}</div>
                  <div className="bmeta">
                    {s.category && <span className="cat">{s.category}</span>}
                    {s.peakViewers > 0 && <span className="num">최고 {s.peakViewers.toLocaleString('ko-KR')}명</span>}
                    {s.vodId && (
                      <a
                        className="vlink"
                        href={vodUrl(s.vodId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ▶ 다시보기
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-day">이 달에는 방송 기록이 없어요</div>
          )}
        </div>
      </div>
    </section>
  );
}

function durOf(s: SessionItem): number {
  return (s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - new Date(s.startedAt).getTime();
}

function fmtDayTitle(key: string): string {
  const d = new Date(`${key}T00:00:00+09:00`);
  return d.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

function vodUrl(vodId: string): string {
  const [platform, no] = vodId.split(':');
  return platform === 'soop'
    ? `https://vod.sooplive.co.kr/player/${no}`
    : `https://chzzk.naver.com/video/${no}`;
}
