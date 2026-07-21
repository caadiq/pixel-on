import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { StreamerDetail } from './pages/StreamerDetail';
import { Vods } from './pages/Vods';
import { Admin } from './pages/Admin';

/** 페이지 이동 시 스크롤 맨 위로 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/streamer/:id" element={<StreamerDetail />} />
          <Route path="/history" element={<History />} />
          <Route path="/vods" element={<Vods />} />
        </Route>
        {/* 관리자는 자체 헤더(로그아웃)를 쓰므로 공용 Layout 밖 */}
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  );
}
