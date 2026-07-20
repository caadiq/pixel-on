import { useEffect } from 'react';

const BASE = 'PIXEL ON';

/** 브라우저 탭 제목 — 페이지별로 "이름 · PIXEL ON" */
export function useTitle(page?: string | null) {
  useEffect(() => {
    document.title = page ? `${page} - ${BASE}` : BASE;
    return () => {
      document.title = BASE;
    };
  }, [page]);
}
