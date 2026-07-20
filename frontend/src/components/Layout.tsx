import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', label: '홈', end: true },
  { to: '/history', label: '방송 이력' },
  { to: '/vods', label: '다시보기' },
];

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

    </>
  );
}
