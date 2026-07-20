import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useStreamers } from '../api/hooks';
import type { Vod } from '../api/types';
import { FALLBACK_COLOR, fmtDurClock, fmtRelDate } from '../lib/format';

/** 홈 그리드 순서 상위 스트리머들의 최신 VOD를 모아 시간순으로 */
export function Vods() {
  const { data: streamers } = useStreamers();
  const [filter, setFilter] = useState<number | null>(null);

  const targets = streamers ?? [];
  const results = useQueries({
    queries: targets.map((s) => ({
      queryKey: ['vods', s.id],
      queryFn: async (): Promise<{ vods: Vod[] }> => {
        const res = await fetch(`/api/streamers/${s.id}/vods`);
        if (!res.ok) throw new Error();
        return res.json();
      },
      staleTime: 10 * 60_000,
      enabled: filter === null || filter === s.id,
    })),
  });

  if (!streamers) return <div className="loading">불러오는 중…</div>;

  const merged = results
    .flatMap((r, i) =>
      (r.data?.vods ?? []).map((v) => ({
        ...v,
        streamer: targets[i],
      })),
    )
    .filter((v) => filter === null || v.streamer.id === filter)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 24);

  const loading = results.some((r) => r.isLoading);

  return (
    <main className="wrap">
      <section className="sec">
        <div className="shead">
          <h2>다시보기</h2>
          <span className="sub">최신순</span>
        </div>
        <div className="fchips">
          <button className={`pill tab ${filter === null ? 'on' : ''}`} onClick={() => setFilter(null)}>
            전체
          </button>
          {streamers.map((s) => (
            <button
              key={s.id}
              className={`pill tab ${filter === s.id ? 'on' : ''}`}
              onClick={() => setFilter(filter === s.id ? null : s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        {loading && merged.length === 0 ? (
          <div className="loading">불러오는 중…</div>
        ) : merged.length === 0 ? (
          <div className="empty">다시보기가 없어요</div>
        ) : (
          <div className="vgrid" style={{ marginTop: 8 }}>
            {merged.map((v) => (
              <a
                key={v.id}
                className="vod"
                href={v.url}
                target="_blank"
                rel="noreferrer"
                style={{ '--c': v.streamer.color ?? FALLBACK_COLOR } as React.CSSProperties}
              >
                <div className="th">
                  {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
                  <span className="dur num">{fmtDurClock(v.duration)}</span>
                </div>
                <div className="bd">
                  <b>{v.title}</b>
                  <span className="sub">
                    <span className="who">{v.streamer.name}</span>
                    <span>{fmtRelDate(v.publishedAt)}</span>
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
