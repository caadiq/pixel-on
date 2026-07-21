import { Fragment, useMemo, useState } from 'react';
import { vodThumb } from '../lib/avatar';
import { useStreamerMonthSessions, useStreamerPattern, useStreamerVods } from '../api/hooks';
import type { SessionItem } from '../api/types';
import { fmtDurKo, fmtTime } from '../lib/format';

const DAY_HEADS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];

const kstNow = () => new Date(Date.now() + 9 * 3600_000);
const kstKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 방송 기록 — 달력 아코디언 (시안 B)
 * 셀에 게이지 막대, 날짜 클릭 시 그 주 아래로 상세 카드(썸네일 포함)가 펼쳐짐.
 * 방송일 귀속: 시작일 기준.
 */
export function BroadcastRecord({
  id,
  color,
  liveThumbnail,
  liveUrl,
}: {
  id: number;
  color: string;
  liveThumbnail?: string | null;
  liveUrl?: string | null;
}) {
  const now = kstNow();
  const [ym, setYm] = useState<[number, number]>([now.getUTCFullYear(), now.getUTCMonth()]);
  const [picked, setPicked] = useState<string | null>(null);
  // 보고 있는 달의 세션 전체를 월 단위로 조회 (30건 제한 없음)
  const { data } = useStreamerMonthSessions(id, ym[0], ym[1]);
  const { data: pattern } = useStreamerPattern(id);
  const { data: vodData } = useStreamerVods(id);

  /** 시작일(KST) 기준 날짜별 세션 — 시간순 오름차순 */
  const byDate = useMemo(() => {
    const m = new Map<string, SessionItem[]>();
    const sorted = [...(data?.sessions ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (const s of sorted) {
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

  /**
   * 세션 → 다시보기 매칭.
   * 1순위 vodId 일치, 2순위 구간 겹침 — VOD 추정 구간(업로드시각−길이 ~ 업로드시각)이
   * 세션 구간과 겹치면 매칭. 업로드가 수 시간 늦어도(±30분 여유) 잡히고,
   * 리커버리로 기록돼 vodId가 없는 세션에도 썸네일이 붙는다.
   */
  const resolveVod = useMemo(() => {
    const vods = vodData?.vods ?? [];
    const byId = new Map(vods.map((v) => [v.id, v]));
    const MARGIN = 30 * 60 * 1000;
    return (s: SessionItem) => {
      if (s.vodId) {
        const hit = byId.get(s.vodId);
        if (hit) return hit;
      }
      const sStart = new Date(s.startedAt).getTime();
      const sEnd = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
      let best: (typeof vods)[number] | null = null;
      let bestOverlap = 0;
      for (const v of vods) {
        const vEnd = new Date(v.publishedAt).getTime();
        const vStart = vEnd - v.duration * 1000;
        const overlap = Math.min(sEnd + MARGIN, vEnd) - Math.max(sStart - MARGIN, vStart);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = v;
        }
      }
      return best;
    };
  }, [vodData]);

  if (!data) return null;

  const [year, month] = ym;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadBlanks = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const todayKey = kstKey(now);
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth();
  const maxHours = 14; // 게이지 만점 기준

  const move = (d: number) => {
    const m = new Date(Date.UTC(year, month + d, 1));
    setYm([m.getUTCFullYear(), m.getUTCMonth()]);
    setPicked(null);
  };

  const monthKeys = Array.from({ length: daysInMonth }, (_, i) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
  );
  // 기본 선택: 이 달의 마지막 방송일
  const defaultKey = [...monthKeys].reverse().find((k) => byDate.has(k)) ?? null;
  const activeKey = picked ?? defaultKey;
  const activeSessions = activeKey ? (byDate.get(activeKey) ?? []) : [];

  // 셀을 주 단위로 나눔 (선택된 주 뒤에 확장 패널 삽입)
  type Cell = { key: string | null; day: number };
  const cells: Cell[] = [
    ...Array.from({ length: leadBlanks }, () => ({ key: null, day: 0 })),
    ...monthKeys.map((key, i) => ({ key, day: i + 1 })),
  ];
  while (cells.length % 7 !== 0) cells.push({ key: null, day: 0 });
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <section className="sec">
      <div className="shead">
        <h2>방송 기록</h2>
        <span className="sub">날짜를 누르면 그날 방송이 펼쳐져요</span>
        <span className="calnav">
          <button onClick={() => move(-1)} aria-label="이전 달">←</button>
          <b className="num">{year}년 {month + 1}월</b>
          <button onClick={() => move(1)} disabled={isCurrentMonth} aria-label="다음 달">→</button>
        </span>
      </div>

      <div className="panel">
        <div className="bcal">
          {DAY_HEADS.map((d, i) => (
            <div key={d} className={`mh ${i === 0 ? 'sun' : ''} ${i === 6 ? 'sat' : ''}`}>{d}</div>
          ))}
          {weeks.map((week, wi) => (
            <Fragment key={wi}>
              {week.map((c, ci) =>
                c.key === null ? (
                  <div key={`b${wi}-${ci}`} className="bday blank" />
                ) : (
                  <DayCell
                    key={c.key}
                    dayNo={c.day}
                    hours={hoursByDate.get(c.key) ?? 0}
                    has={byDate.has(c.key)}
                    today={c.key === todayKey}
                    future={c.key > todayKey}
                    selected={c.key === activeKey}
                    maxHours={maxHours}
                    color={color}
                    onClick={() => setPicked(c.key)}
                  />
                ),
              )}
            </Fragment>
          ))}
        </div>

        {activeKey && (
          <DayExpand
            dateKey={activeKey}
            sessions={activeSessions}
            color={color}
            resolveVod={resolveVod}
            liveThumbnail={liveThumbnail ?? null}
            liveUrl={liveUrl ?? null}
          />
        )}

        <PatternInsight pattern={pattern} color={color} />
      </div>
    </section>
  );
}

function DayCell({
  dayNo, hours, has, today, future, selected, maxHours, color, onClick,
}: {
  dayNo: number; hours: number; has: boolean; today: boolean; future: boolean;
  selected: boolean; maxHours: number; color: string; onClick: () => void;
}) {
  return (
    <button
      className={`bday ${today ? 'today' : ''} ${future ? 'future' : ''} ${selected ? 'sel' : ''} ${has ? 'has' : ''}`}
      onClick={onClick}
      disabled={!has}
      title={hours > 0 ? `${hours}시간 방송` : undefined}
    >
      <span className="dn num">{dayNo}</span>
      {hours > 0 ? (
        <>
          <span className="gh num">{hours >= 10 ? Math.round(hours) : hours}h</span>
          <span className="gauge">
            <i style={{ width: `${Math.min(100, (hours / maxHours) * 100)}%`, background: color }} />
          </span>
        </>
      ) : (
        <span />
      )}
    </button>
  );
}

function DayExpand({
  dateKey, sessions, color, resolveVod, liveThumbnail, liveUrl,
}: {
  dateKey: string;
  sessions: SessionItem[];
  color: string;
  resolveVod: (s: SessionItem) => { thumbnail: string | null; url: string } | null;
  liveThumbnail: string | null;
  liveUrl: string | null;
}) {
  const d = new Date(`${dateKey}T00:00:00+09:00`);
  const title = d.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short',
  });
  const total = sessions.reduce((a, s) => a + durOf(s), 0);

  return (
    <div className="bexp" style={{ '--c': color } as React.CSSProperties}>
      <div className="bxh">
        <b>{title}</b>
        <span className="num">방송 {sessions.length}회 · {fmtDurKo(total)}</span>
      </div>
      {sessions.map((s) => {
        const vod = resolveVod(s);
        const isLive = s.endedAt === null;
        // 방송 중이면 라이브 페이지, 아니면 다시보기
        const url = isLive ? liveUrl : (vod?.url ?? (s.vodId ? fallbackVodUrl(s.vodId) : null));
        // DB 저장 썸네일 → VOD 매칭 → (방송 중이면) 라이브 썸네일
        const raw = s.thumbnail ?? vod?.thumbnail ?? (s.endedAt === null ? liveThumbnail : null);
        const thumb = raw ? vodThumb(raw) : null;
        return (
          <div key={s.id} className="brow">
            {thumb ? (
              url ? (
                <a className="bthumb" href={url} target="_blank" rel="noreferrer">
                  <img src={thumb} alt="" loading="lazy" />
                  <span className="bplay">▶</span>
                </a>
              ) : (
                <div className="bthumb">
                  <img src={thumb} alt="" loading="lazy" />
                </div>
              )
            ) : (
              <div className="bthumb none">▶</div>
            )}
            <div className="binfo">
              <div className="bt num">
                {fmtTime(s.startedAt)}
                <span className="ar">→</span>
                {s.endedAt ? fmtTime(s.endedAt) : <span style={{ color: 'var(--live)' }}>방송 중</span>}
                <span className="bd2 num">{fmtDurKo(durOf(s))}</span>
              </div>
              <div className="btl">{s.title || '(제목 없음)'}</div>
              {s.category && (
                <div className="bsub">
                  <span className="bcat">{s.category}</span>
                </div>
              )}
            </div>
            {url && (
              <a className={`bv ${isLive ? 'live' : ''}`} href={url} target="_blank" rel="noreferrer">
                {isLive ? '방송 보기' : '다시보기'}
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 방송 시간대 — 시간대 히스토그램(축·피크 강조) + 요일 분포 */
function PatternInsight({
  pattern, color,
}: {
  pattern: { grid: number[][] } | undefined;
  color: string;
}) {
  if (!pattern) return null;
  const hourly = Array.from({ length: 24 }, (_, h) => pattern.grid.reduce((a, r) => a + r[h], 0));
  const maxHour = Math.max(...hourly, 1);
  const peakHour = hourly.indexOf(maxHour);
  const byDay = pattern.grid.map((r) => r.reduce((a, b) => a + b, 0));
  const maxDay = Math.max(...byDay, 1);
  const peakDay = byDay.indexOf(maxDay);
  if (maxHour <= 0) return null;

  return (
    <div className="insight" style={{ '--c': color } as React.CSSProperties}>
      <div className="ins-block hours">
        <div className="ins-head">
          <b>방송 시간대</b>
          <span className="badge num">
            {peakHour < 12 ? '오전' : '오후'} {peakHour % 12 === 0 ? 12 : peakHour % 12}시쯤
          </span>
        </div>
        <div className="hbars">
          {hourly.map((v, h) => (
            <div key={h} className="hcol" title={`${h}시 · ${Math.round(v)}시간`}>
              <i
                className={h === peakHour ? 'peak' : ''}
                style={{ height: `${Math.max(4, (v / maxHour) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="haxis num">
          {[0, 6, 12, 18, 24].map((h) => <span key={h}>{h}시</span>)}
        </div>
      </div>
      <div className="ins-block days">
        <div className="ins-head"><b>요일별</b></div>
        <div className="dbars">
          {DAY_NAMES.map((name, i) => (
            <div key={name} className="dcol" title={`${name} · ${Math.round(byDay[i])}시간`}>
              <div className="dtrack">
                <i className={i === peakDay ? 'peak' : ''} style={{ height: `${Math.max(4, (byDay[i] / maxDay) * 100)}%` }} />
              </div>
              <span className={`dlab ${i === peakDay ? 'peak' : ''}`}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function durOf(s: SessionItem): number {
  return (s.endedAt ? new Date(s.endedAt).getTime() : Date.now()) - new Date(s.startedAt).getTime();
}

function fallbackVodUrl(vodId: string): string {
  const [platform, no] = vodId.split(':');
  return platform === 'soop'
    ? `https://vod.sooplive.co.kr/player/${no}`
    : `https://chzzk.naver.com/video/${no}`;
}
