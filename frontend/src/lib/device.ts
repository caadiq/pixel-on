/**
 * 기기 능력 판정 — UA 추측(react-device-detect류) 대신 matchMedia 능력 쿼리 사용.
 * UA는 아이패드 데스크톱 모드 등에서 위장되지만, (hover)/(pointer)는 실제 능력을 직접 묻는다.
 */
import { useEffect, useState } from 'react';

/** 진짜 마우스 환경(PC)인지 — 터치 탭이 mouseenter를 흉내내므로 이벤트 시점에 호출 */
export const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** 좁은 화면 "또는" 터치 기기 — 시트/탭 UI를 써야 하는 환경 (가로 태블릿 포함) */
export function useTouchMode(maxWidth = 720): boolean {
  const queries = [`(max-width: ${maxWidth}px)`, '(hover: none) and (pointer: coarse)'];
  const calc = () => queries.some((q) => window.matchMedia(q).matches);
  const [on, setOn] = useState(() => typeof window !== 'undefined' && calc());
  useEffect(() => {
    const mqs = queries.map((q) => window.matchMedia(q));
    const h = () => setOn(calc());
    mqs.forEach((mq) => mq.addEventListener('change', h));
    return () => mqs.forEach((mq) => mq.removeEventListener('change', h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxWidth]);
  return on;
}

/** 좁은 화면 여부 (레이아웃 전용 — 무한 스크롤 등) */
export function useNarrow(maxWidth = 480): boolean {
  const q = `(max-width: ${maxWidth}px)`;
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setOn(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return on;
}
