import { useState } from 'react';
import { useDaySessions } from '../api/hooks';
import { FALLBACK_COLOR, fmtDateFull, fmtDurKo, fmtTime } from '../lib/format';

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return new Date(d.getTime() + days * 86400_000 + 9 * 3600_000).toISOString().slice(0, 10);
}

export function History() {
  const [date, setDate] = useState(kstToday());
  const { data, isLoading } = useDaySessions(date);
  const isToday = date === kstToday();

  const rows = data?.sessions ?? [];
  // 방송일 = 시작일 귀속 — 자정을 넘겨도 전체 길이를 그날 것으로 집계
  const dayStart = new Date(`${date}T00:00:00+09:00`).getTime();
  const fullMs = (r: { startedAt: string; endedAt: string | null }) =>
    (r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - new Date(r.startedAt).getTime();
  const totalMs = rows.reduce((a, r) => a + fullMs(r), 0);

  return (
    <main className="wrap">
      <section className="sec">
        <div className="datebar">
          <button className="arr" onClick={() => setDate(shiftDate(date, -1))} aria-label="이전 날">
            ←
          </button>
          <span className="db">{fmtDateFull(date)}</span>
          <button className="arr" onClick={() => setDate(shiftDate(date, 1))} disabled={isToday} aria-label="다음 날">
            →
          </button>
          {rows.length > 0 && (
            <span className="pill" style={{ marginLeft: 'auto' }}>
              방송 <b className="num">{rows.length}</b>건 · 총 <b className="num">{Math.round(totalMs / 3600_000)}</b>시간
            </span>
          )}
        </div>
      </section>

      <section className="sec">
        {isLoading ? (
          <div className="loading">불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="empty">이 날은 방송 기록이 없어요</div>
        ) : (
          <>
            {/* PC: 간트 */}
            <div className="panel pc-only">
              {rows.map((r) => {
                const st = (new Date(r.startedAt).getTime() - dayStart) / 86400_000;
                const rawEn = ((r.endedAt ? new Date(r.endedAt).getTime() : Date.now()) - dayStart) / 86400_000;
                const overflow = rawEn > 1; // 자정 넘김
                const en = Math.min(1, rawEn);
                return (
                  <div key={r.id} className="grow" style={{ '--c': r.color ?? FALLBACK_COLOR } as React.CSSProperties}>
                    <span className="nm">
                      <img src={r.profileImage} alt="" loading="lazy" />
                      {r.name}
                    </span>
                    <span className="gt" title={r.title}>
                      <span
                        className={overflow ? 'over' : ''}
                        style={{ left: `${st * 100}%`, width: `${Math.max(0.5, (en - st) * 100)}%` }}
                      />
                    </span>
                    <span className="hrs num">{(fullMs(r) / 3600_000).toFixed(1)}h</span>
                  </div>
                );
              })}
              <div className="gaxis num">
                {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
                  <span key={h}>{String(h).padStart(2, '0')}</span>
                ))}
              </div>
            </div>

            {/* 모바일: 시간 리스트 */}
            <div className="panel mb-only">
              {rows.map((r) => {
                const crossed = r.endedAt !== null && new Date(r.endedAt).getTime() >= dayStart + 86400_000;
                return (
                  <div key={r.id} className="mrow">
                    <img src={r.profileImage} alt="" loading="lazy" />
                    <span>
                      <span className="who">{r.name}</span>
                      <div className="rng num">
                        {fmtTime(r.startedAt)} → {r.endedAt ? `${crossed ? '익일 ' : ''}${fmtTime(r.endedAt)}` : '방송 중'}
                        {r.source === 'backfill' && ' ≈'}
                      </div>
                    </span>
                    <span className="hrs num">{fmtDurKo(fullMs(r))}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

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
