import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverlayScrollbars } from 'overlayscrollbars';
import { App } from './App';
import './styles/global.css';
import './styles/components.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // 모바일 네트워크에서 간헐 실패가 잦아 재시도를 넉넉히 (지수 백오프)
    queries: { retry: 3, retryDelay: (n) => Math.min(1000 * 2 ** n, 5000), staleTime: 10_000, refetchOnWindowFocus: false },
  },
});

// 페이지 전체 스크롤바를 오버레이 방식으로 교체
OverlayScrollbars(
  { target: document.body, cancel: { nativeScrollbarsOverlaid: true } },
  { scrollbars: { theme: 'os-theme-dark', autoHide: 'leave', autoHideDelay: 600 } },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
