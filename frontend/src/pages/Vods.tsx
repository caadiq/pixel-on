import { useEffect, useRef, useState } from 'react';
import { avatar, vodThumb } from '../lib/avatar';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useStreamers } from '../api/hooks';
import type { Streamer } from '../api/types';
import { StreamerPicker } from '../components/StreamerPicker';
import { FALLBACK_COLOR, fmtDurClock, fmtRelDate } from '../lib/format';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useDismiss } from '../lib/useDismiss';
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

async function fetchVods(page: number, filter: number | null): Promise<{ total: number; vods: DbVod[] }> {
  const res = await fetch(`/api/vods?page=${page}&size=${PAGE_SIZE}${filter ? `&streamerId=${filter}` : ''}`);
  if (!res.ok) throw new Error();
  return res.json();
}

/** 좁은 모바일(≤480px) 여부 — 무한 스크롤 + 플로팅 필터 모드 */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 480px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 480px)');
    const h = () => setNarrow(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return narrow;
}

/** 다시보기 — PC·태블릿은 페이지네이션, 좁은 모바일은 무한 스크롤 + 플로팅 필터 */
export function Vods() {
  useTitle('다시보기');
  const { data: streamers } = useStreamers();
  const [params, setParams] = useSearchParams();
  const filter = params.get('s') ? Number(params.get('s')) : null;
  const [page, setPage] = useState(0);
  const narrow = useIsNarrow();

  useEffect(() => {
    setPage(0);
  }, [filter]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  // PC·태블릿: 페이지 단위
  const { data, isLoading } = useQuery({
    queryKey: ['vods-db', filter, page],
    queryFn: () => fetchVods(page, filter),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    enabled: !narrow,
  });

  // 모바일: 무한 스크롤 누적
  const inf = useInfiniteQuery({
    queryKey: ['vods-inf', filter],
    queryFn: ({ pageParam }) => fetchVods(pageParam as number, filter),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (all.length * PAGE_SIZE < last.total ? all.length : undefined),
    staleTime: 5 * 60_000,
    enabled: narrow,
  });

  // 목록 끝 센티널이 보이면 다음 페이지
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = inf;
  useEffect(() => {
    if (!narrow || !sentinel.current) return;
    const io = new IntersectionObserver(
      (ents) => {
        if (ents[0].isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [narrow, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const setFilter = (id: number | null) => {
    setParams(id ? { s: String(id) } : {}, { replace: true });
    if (narrow) window.scrollTo({ top: 0 });
  };

  const ready = narrow ? !!inf.data : !(isLoading && !data);
  if (!streamers || !ready) return <div className="loading">불러오는 중…</div>;

  const byId = new Map(streamers.map((s) => [s.id, s]));
  const vods = narrow ? (inf.data?.pages.flatMap((p) => p.vods) ?? []) : (data?.vods ?? []);
  const total = narrow ? (inf.data?.pages[0]?.total ?? 0) : (data?.total ?? 0);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="wrap">
      <section className="sec">
        <div className="shead">
          <h2>다시보기</h2>
          <span className="sub num">{total.toLocaleString('ko-KR')}개 · 최신순</span>
          {/* 모바일은 플로팅 필터가 있어 드롭다운 생략 */}
          {!narrow && (
            <span style={{ marginLeft: 'auto' }}>
              <StreamerPicker streamers={streamers} value={filter} onChange={setFilter} />
            </span>
          )}
        </div>

        {vods.length === 0 ? (
          <div className="empty">다시보기가 없어요</div>
        ) : narrow ? (
          <VirtualVodGrid vods={vods} byId={byId} />
        ) : (
          <div className="vgrid">
            {vods.map((v, i) => (
              <VodCard key={v.id} v={v} s={byId.get(v.streamerId)} delay={Math.min(i * 0.04, 0.45)} />
            ))}
          </div>
        )}

        {narrow ? (
          <div ref={sentinel} className="infsentinel">
            {isFetchingNextPage && '불러오는 중…'}
            {!hasNextPage && vods.length > 0 && '마지막 다시보기까지 다 봤어요'}
          </div>
        ) : (
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        )}
      </section>

      {narrow && <FilterFab streamers={streamers} value={filter} onChange={setFilter} />}
    </main>
  );
}

function VodCard({ v, s, delay = 0 }: { v: DbVod; s: Streamer | undefined; delay?: number }) {
  return (
    <a
      className="vod"
      href={v.url}
      target="_blank"
      rel="noreferrer"
      style={{ '--c': s?.color ?? FALLBACK_COLOR, animationDelay: `${delay}s` } as React.CSSProperties}
    >
      <div className="th">
        <img src={vodThumb(v.thumbnail)} alt="" loading="lazy" decoding="async" />
        <span className="dur num">{fmtDurClock(v.duration)}</span>
      </div>
      <div className="bd">
        <b>{v.title || '(제목 없음)'}</b>
        <span className="sub">
          {s && <img className="pav" src={avatar(s.profileImage)} alt="" loading="lazy" />}
          <span className="who">{s?.name ?? ''}</span>
          <span className="when">{fmtRelDate(v.startedAt)}</span>
        </span>
      </div>
    </a>
  );
}

const COLS = 1; // 모바일은 가로 리스트 1열

/** 모바일 무한 스크롤 그리드 — 화면에 보이는 행만 렌더 (창 가상화) */
function VirtualVodGrid({ vods, byId }: { vods: DbVod[]; byId: Map<number, Streamer> }) {
  const listRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(vods.length / COLS);
  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 120,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  return (
    <div ref={listRef}>
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className="vrow"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {vods.slice(row.index * COLS, row.index * COLS + COLS).map((v) => (
              <VodCard key={v.id} v={v} s={byId.get(v.streamerId)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 모바일 플로팅 필터 — 탭하면 스트리머 선택 바텀시트 */
function FilterFab({
  streamers, value, onChange,
}: {
  streamers: Streamer[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { closing, dismiss } = useDismiss(() => setOpen(false));
  const selected = streamers.find((s) => s.id === value) ?? null;

  // 시트가 떠 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const pick = (id: number | null) => {
    onChange(id);
    dismiss();
  };

  return (
    <>
      <button className={`fab ${selected ? 'has' : ''}`} onClick={() => setOpen(true)} aria-label="스트리머 필터">
        {selected ? (
          <img src={avatar(selected.profileImage)} alt="" />
        ) : (
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16M7 12h10M10 19h4" />
          </svg>
        )}
      </button>
      {open && (
        <>
          <div className={`gtip-scrim ${closing ? 'closing' : ''}`} onClick={dismiss} />
          <div className={`fsheet ${closing ? 'closing' : ''}`}>
            <b className="fsheet-t">스트리머 필터</b>
            <div className="fsheet-list">
              <button className={`pickitem ${value === null ? 'on' : ''}`} onClick={() => pick(null)}>
                전체 스트리머
              </button>
              {streamers.map((s) => (
                <button key={s.id} className={`pickitem ${value === s.id ? 'on' : ''}`} onClick={() => pick(s.id)}>
                  <img src={avatar(s.profileImage)} alt="" />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
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
