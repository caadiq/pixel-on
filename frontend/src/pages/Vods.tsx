import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useStreamers } from '../api/hooks';
import type { Streamer } from '../api/types';
import { StreamerPicker } from '../components/StreamerPicker';
import { FALLBACK_COLOR, fmtDurClock, fmtRelDate } from '../lib/format';
import { useTitle } from '../lib/useTitle';

const PAGE_SIZE = 24;

interface DbVod {
  id: number;
  streamerId: number;
  title: string;
  category: string | null;
  thumbnail: string;
  startedAt: string;
  duration: number;
  url: string;
}

/** 다시보기 — DB 기반, 총 개수를 알아서 페이지 번호가 처음부터 고정 표시됨 */
export function Vods() {
  useTitle('다시보기');
  const { data: streamers } = useStreamers();
  const [params, setParams] = useSearchParams();
  const filter = params.get('s') ? Number(params.get('s')) : null;
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [filter]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  const { data, isLoading } = useQuery({
    queryKey: ['vods-db', filter, page],
    queryFn: async (): Promise<{ total: number; vods: DbVod[] }> => {
      const res = await fetch(
        `/api/vods?page=${page}&size=${PAGE_SIZE}${filter ? `&streamerId=${filter}` : ''}`,
      );
      if (!res.ok) throw new Error();
      return res.json();
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  const setFilter = (id: number | null) => {
    setParams(id ? { s: String(id) } : {}, { replace: true });
  };

  if (!streamers || (isLoading && !data)) return <div className="loading">불러오는 중…</div>;

  const byId = new Map(streamers.map((s) => [s.id, s]));
  const vods = data?.vods ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <main className="wrap">
      <section className="sec">
        <div className="shead">
          <h2>다시보기</h2>
          <span className="sub num">{(data?.total ?? 0).toLocaleString('ko-KR')}개 · 최신순</span>
          <span style={{ marginLeft: 'auto' }}>
            <StreamerPicker streamers={streamers} value={filter} onChange={setFilter} />
          </span>
        </div>

        {vods.length === 0 ? (
          <div className="empty">다시보기가 없어요</div>
        ) : (
          <div className="vgrid">
            {vods.map((v) => {
              const s = byId.get(v.streamerId);
              return (
                <a
                  key={v.id}
                  className="vod"
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ '--c': s?.color ?? FALLBACK_COLOR } as React.CSSProperties}
                >
                  <div className="th">
                    <img src={v.thumbnail} alt="" loading="lazy" />
                    <span className="dur num">{fmtDurClock(v.duration)}</span>
                  </div>
                  <div className="bd">
                    <b>{v.title || '(제목 없음)'}</b>
                    <span className="sub">
                      {s && <img className="pav" src={s.profileImage} alt="" loading="lazy" />}
                      <span className="who">{s?.name ?? ''}</span>
                      <span className="when">{fmtRelDate(v.startedAt)}</span>
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </section>
    </main>
  );
}

/** 10개 블록 고정 페이지 버튼 — ‹ › 는 페이지 이동, 블록은 자동 전환 */
function Pagination({
  page, totalPages, onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const BLOCK = 10;
  const blockStart = Math.floor(page / BLOCK) * BLOCK;
  const blockEnd = Math.min(totalPages, blockStart + BLOCK);
  const nums = Array.from({ length: blockEnd - blockStart }, (_, i) => blockStart + i);

  return (
    <nav className="pager" aria-label="페이지">
      <button onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="이전 페이지">
        ‹
      </button>
      {nums.map((n) => (
        <button key={n} className={n === page ? 'on' : ''} onClick={() => onPage(n)}>
          {n + 1}
        </button>
      ))}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        aria-label="다음 페이지"
      >
        ›
      </button>
    </nav>
  );
}
