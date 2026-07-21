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
        <div className="wrap">
          <div className="ftr-main">
            <div className="ftr-brand">
              <span className="logo">
                <img className="logoimg" src="/favicon-192.png?v=2" alt="" />
                <b>PIXEL ON</b>
              </span>
              <p>픽셀네트워크 스트리머들의 방송을 기록하는 비공식 팬사이트</p>
            </div>
            <div className="ftr-links">
              <div className="ftr-col">
                <span className="ftr-h">데이터</span>
                <span>치지직 · 숲(SOOP)</span>
              </div>
              <div className="ftr-col">
                <span className="ftr-h">문의</span>
                <a href="mailto:caadiq@gmail.com">caadiq@gmail.com</a>
              </div>
            </div>
          </div>
          <div className="ftr-bottom">
            <span>픽셀네트워크 및 소속 스트리머와 무관한 비공식 팬 제작 사이트입니다.</span>
            <span>© 2026 PIXEL ON</span>
          </div>
        </div>
      </footer>

    </>
  );
}
