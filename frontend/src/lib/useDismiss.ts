import { useEffect, useRef, useState } from 'react';

/**
 * 오버레이(다이얼로그·시트·팝오버) 닫힘 애니메이션.
 * dismiss()가 closing을 켜 .closing CSS 애니메이션을 재생한 뒤 ms 후 실제 close를 호출한다.
 */
export function useDismiss(close: () => void, ms = 180) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    timer.current = window.setTimeout(() => {
      setClosing(false);
      close();
    }, ms);
  };

  return { closing, dismiss };
}
