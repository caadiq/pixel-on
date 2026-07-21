import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { StreamerDetail } from './pages/StreamerDetail';
import { Vods } from './pages/Vods';
import { Admin } from './pages/Admin';

export function App() {
  return (
    <BrowserRouter>
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
