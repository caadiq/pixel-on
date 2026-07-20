import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', label: '홈', end: true },
  { to: '/history', label: '방송 이력' },
  { to: '/vods', label: '다시보기' },
];

const TAB_ICONS: Record<string, string> = {
  홈: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  '방송 이력': 'M12 8v5l3.5 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z',
  다시보기: 'M4 5h16v12H4zM8 21h8M10 9l5 2.5L10 14z',
};

export function Layout() {
  return (
    <>
      <header className="hdr">
        <div className="wrap">
          <NavLink to="/" className="logo">
            <img className="logoimg" src="/favicon-192.png?v=2" alt="" />
            <b>PIXEL ON</b>
          </NavLink>
          <nav className="nav">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'on' : '')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <Outlet />

      <footer className="ftr">
        <p>
          비공식 팬 제작 사이트입니다 · 픽셀네트워크 및 소속 스트리머와 무관합니다
          <br />
          방송 정보는 치지직 · 숲(SOOP)에서 가져옵니다
        </p>
      </footer>

      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <path d={TAB_ICONS[n.label]} />
            </svg>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
