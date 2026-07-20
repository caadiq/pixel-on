import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { useStreamers } from '../api/hooks';
import type { Streamer, Vod } from '../api/types';
import { StreamerPicker } from '../components/StreamerPicker';
import { FALLBACK_COLOR, fmtDurClock, fmtRelDate } from '../lib/format';

const PAGE_SIZE = 24;

export function Vods() {
  const { data: streamers } = useStreamers();
  const [params, setParams] = useSearchParams();
  const filter = params.get('s') ? Number(params.get('s')) : null;
  const [page, setPage] = useState(0);

  // 필터가 바뀌면 1페이지로
  useEffect(() => {
    setPage(0);
  }, [filter]);

  // 페이지 이동 시 상단으로
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  const setFilter = (id: number | null) => {
    setParams(id ? { s: String(id) } : {}, { replace: true });
  };

  if (!streamers) return <div className="loading">불러오는 중…</div>;

  return (
    <main className="wrap">
      <section className="sec">
        <div className="shead">
          <h2>다시보기</h2>
          <span className="sub">최신순</span>
          <span style={{ marginLeft: 'auto' }}>
            <StreamerPicker streamers={streamers} value={filter} onChange={setFilter} />
          </span>
        </div>

        {filter === null ? (
          <AllVods streamers={streamers} page={page} onPage={setPage} />
        ) : (
          <SingleVods
            streamer={streamers.find((s) => s.id === filter) ?? null}
            page={page}
            onPage={setPage}
          />
        )}
      </section>
    </main>
  );
}

/** 전체 모드 — 스트리머별 최신 페이지를 모아 시간순 + 페이지 버튼 */
function AllVods({
  streamers, page, onPage,
}: {
  streamers: Streamer[];
  page: number;
  onPage: (p: number) => void;
}) {
  const results = useQueries({
    queries: streamers.map((s) => ({
      queryKey: ['vods', s.id],
      queryFn: async (): Promise<{ vods: Vod[] }> => {
        const res = await fetch(`/api/streamers/${s.id}/vods`);
        if (!res.ok) throw new Error();
        return res.json();
      },
      staleTime: 10 * 60_000,
    })),
  });

  const merged = results
    .flatMap((r, i) => (r.data?.vods ?? []).map((v) => ({ ...v, streamer: streamers[i] })))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const loading = results.some((r) => r.isLoading);
  if (loading && merged.length === 0) return <div className="loading">불러오는 중…</div>;
  if (merged.length === 0) return <div className="empty">다시보기가 없어요</div>;

  const totalPages = Math.ceil(merged.length / PAGE_SIZE);
  return (
    <>
      <VodGrid items={merged.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)} />
      <Pagination page={page} totalPages={totalPages} onPage={onPage} />
    </>
  );
}

/** 단일 스트리머 모드 — 플랫폼 API 페이지를 필요한 만큼 이어서 로드 + 페이지 버튼 */
function SingleVods({
  streamer, page, onPage,
}: {
  streamer: Streamer | null;
  page: number;
  onPage: (p: number) => void;
}) {
  const inf = useInfiniteQuery({
    queryKey: ['vods-inf', streamer?.id],
    enabled: streamer !== null,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<{ vods: Vod[]; hasMore: boolean }> => {
      const res = await fetch(`/api/streamers/${streamer!.id}/vods?page=${pageParam}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    staleTime: 10 * 60_000,
  });

  const items = (inf.data?.pages ?? []).flatMap((p) =>
    p.vods.map((v) => ({ ...v, streamer: streamer! })),
  );

  // 현재 페이지를 채울 만큼 로드가 부족하면 다음 플랫폼 페이지를 이어서 가져옴
  const needed = (page + 1) * PAGE_SIZE;
  useEffect(() => {
    if (streamer && items.length < needed && inf.hasNextPage && !inf.isFetchingNextPage) {
      void inf.fetchNextPage();
    }
  }, [streamer, items.length, needed, inf]);

  if (!streamer) return <div className="empty">스트리머를 찾을 수 없어요</div>;
  if (inf.isLoading) return <div className="loading">불러오는 중…</div>;
  if (items.length === 0) return <div className="empty">다시보기가 없어요</div>;

  const pageItems = items.slice(page * PAGE_SIZE, needed);
  // 아직 로드가 안 끝나 더 있을 수 있으면 페이지 수를 열어둠
  const totalPages = Math.ceil(items.length / PAGE_SIZE) + (inf.hasNextPage ? 1 : 0);

  return (
    <>
      {pageItems.length === 0 ? (
        <div className="loading">불러오는 중…</div>
      ) : (
        <VodGrid items={pageItems} />
      )}
      <Pagination page={page} totalPages={totalPages} onPage={onPage} />
    </>
  );
}

/** 숫자 페이지 버튼 (현재 페이지 중심 최대 7개 + 이전/다음) */
function Pagination({
  page, totalPages, onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const WINDOW = 7;
  let start = Math.max(0, page - Math.floor(WINDOW / 2));
  const end = Math.min(totalPages, start + WINDOW);
  start = Math.max(0, end - WINDOW);
  const nums = Array.from({ length: end - start }, (_, i) => start + i);

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

function VodGrid({ items }: { items: (Vod & { streamer: Streamer })[] }) {
  return (
    <div className="vgrid">
      {items.map((v) => (
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
  );
}
