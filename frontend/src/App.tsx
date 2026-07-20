import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { StreamerDetail } from './pages/StreamerDetail';
import { Vods } from './pages/Vods';

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
      </Routes>
    </BrowserRouter>
  );
}
