import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FALLBACK_COLOR, fmtCompact } from '../lib/format';
import { useTitle } from '../lib/useTitle';

interface AdminStreamer {
  id: number;
  name: string;
  platform: 'chzzk' | 'soop';
  chzzkId: string | null;
  soopId: string | null;
  profileImage: string;
  followers: number;
  color: string | null;
  autoColor: string | null;
  active: boolean;
}

interface SearchResult {
  chzzk: { channelId: string; name: string; profileImage: string; followers: number }[];
  soop: { soopId: string; name: string; profileImage: string; followers: number }[];
}

const TOKEN_STORAGE = 'pixel-admin-token';

async function adminFetch<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function Admin() {
  useTitle('관리자');
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE) ?? '');
  const [authed, setAuthed] = useState(!!token);

  if (!authed) {
    return (
      <Login
        onOk={(t) => {
          localStorage.setItem(TOKEN_STORAGE, t);
          setToken(t);
          setAuthed(true);
        }}
      />
    );
  }
  return (
    <AdminMain
      token={token}
      onLogout={() => {
        localStorage.removeItem(TOKEN_STORAGE);
        setToken('');
        setAuthed(false);
      }}
    />
  );
}

function Login({ onOk }: { onOk: (token: string) => void }) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password }),
      });
      if (!res.ok) throw new Error();
      const { token } = (await res.json()) as { token: string };
      onOk(token);
    } catch {
      setErr('아이디 또는 비밀번호가 올바르지 않아요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap" style={{ maxWidth: 380 }}>
      <section className="sec">
        <div className="panel loginbox">
          <h3 className="jua">관리자 로그인</h3>
          <label>아이디</label>
          <input
            className="ainp"
            value={user}
            autoComplete="username"
            onChange={(e) => setUser(e.target.value)}
          />
          <label>비밀번호</label>
          <input
            className="ainp"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
          {err && <div className="lerr">{err}</div>}
          <button className="abtn" onClick={() => void submit()} disabled={busy}>
            {busy ? '확인 중…' : '로그인'}
          </button>
        </div>
      </section>
    </main>
  );
}

function AdminMain({ token, onLogout }: { token: string; onLogout: () => void }) {
  const qc = useQueryClient();
  const { data: rows, isError } = useQuery({
    queryKey: ['admin-streamers'],
    queryFn: () => adminFetch<AdminStreamer[]>(token, '/api/admin/streamers'),
    retry: false,
  });
  // 토큰 만료·무효(401 등) → 로그인 화면으로
  useEffect(() => {
    if (isError) onLogout();
  }, [isError, onLogout]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-streamers'] });
    void qc.invalidateQueries({ queryKey: ['streamers'] });
  };

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  if (isError) return null;
  if (!rows) return <div className="loading">불러오는 중…</div>;
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <main className="wrap">
      <section className="sec">
        <div className="shead">
          <h2>스트리머 관리</h2>
          <span className="sub">
            {rows.length}명 · 비활성 {rows.filter((r) => !r.active).length}명
          </span>
          <button className="admlogout" onClick={onLogout}>로그아웃</button>
        </div>

        <div className="admlayout">
          <div className="admgrid2">
            <button className="addcard" onClick={() => { setAdding(true); setSelectedId(null); }}>
              <span className="plus">+</span>
              스트리머 추가
            </button>
            {rows.map((s) => {
              const c = s.color ?? s.autoColor ?? FALLBACK_COLOR;
              return (
                <button
                  key={s.id}
                  className={`acard ${s.id === selectedId ? 'sel' : ''} ${s.active ? '' : 'off'}`}
                  style={{ '--c': c } as React.CSSProperties}
                  onClick={() => { setSelectedId(s.id); setAdding(false); }}
                >
                  {!s.active && <span className="offbadge">비활성</span>}
                  <img className="av" src={s.profileImage} alt="" loading="lazy" />
                  <b>{s.name}</b>
                  <span className="sub num">{fmtCompact(s.followers)}</span>
                </button>
              );
            })}
          </div>

          <div className="admside2">
            {adding ? (
              <AddPanel token={token} onDone={(id) => { setAdding(false); setSelectedId(id); invalidate(); }} />
            ) : selected ? (
              <EditPanel key={selected.id} token={token} s={selected} onChanged={invalidate} onDeleted={() => { setSelectedId(null); invalidate(); }} />
            ) : (
              <div className="panel emptyside">스트리머를 선택하면<br />설정이 여기 나와요</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function EditPanel({
  token, s, onChanged, onDeleted,
}: {
  token: string;
  s: AdminStreamer;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [color, setColor] = useState(s.color ?? s.autoColor ?? '#888888');
  const [platform, setPlatform] = useState(s.platform);
  const [chzzkId, setChzzkId] = useState(s.chzzkId ?? '');
  const [soopId, setSoopId] = useState(s.soopId ?? '');
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const patch = useMutation({
    mutationFn: (body: object) =>
      adminFetch(token, `/api/admin/streamers/${s.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { onChanged(); setMsg('저장됐어요'); setTimeout(() => setMsg(''), 1500); },
  });

  const del = useMutation({
    mutationFn: () => adminFetch(token, `/api/admin/streamers/${s.id}`, { method: 'DELETE' }),
    onSuccess: onDeleted,
  });

  const platformChanged = platform !== s.platform || chzzkId !== (s.chzzkId ?? '') || soopId !== (s.soopId ?? '');

  return (
    <div className="panel editpanel" style={{ '--c': color } as React.CSSProperties}>
      <div className="ephead">
        <img src={s.profileImage} alt="" />
        <div>
          <b>{s.name}</b>
          <span className="num">팔로워 {fmtCompact(s.followers)}</span>
        </div>
        <button
          className={`tg ${s.active ? 'on' : ''}`}
          title={s.active ? '활성 (클릭 시 비활성)' : '비활성 (클릭 시 활성)'}
          onClick={() => patch.mutate({ active: !s.active })}
        />
      </div>

      {/* 대표색 */}
      <div className="epsec">
        <label>대표색</label>
        <div className="cprow">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="cpick-big" />
          <span className="num hx">{color.toUpperCase()}</span>
          <span className="cplbl">{s.color ? '수동 지정' : '자동 추출'}</span>
          <div className="cpbtns">
            <button className="minibtn" onClick={() => patch.mutate({ color })}>적용</button>
            {s.color && <button className="minibtn ghost" onClick={() => patch.mutate({ color: null })}>자동으로</button>}
          </div>
        </div>
      </div>

      {/* 플랫폼 */}
      <div className="epsec">
        <label>플랫폼</label>
        <div className="pfseg">
          <button className={platform === 'chzzk' ? 'on chzzk' : ''} onClick={() => setPlatform('chzzk')}>치지직</button>
          <button className={platform === 'soop' ? 'on soop' : ''} onClick={() => setPlatform('soop')}>숲</button>
        </div>
        <div className="idrow">
          <span>치지직 ID</span>
          <input className="ainp2" value={chzzkId} placeholder="치지직 채널 ID" onChange={(e) => setChzzkId(e.target.value)} />
        </div>
        <div className="idrow">
          <span>숲 ID</span>
          <input className="ainp2" value={soopId} placeholder="숲 아이디" onChange={(e) => setSoopId(e.target.value)} />
        </div>
        {platformChanged && (
          <button className="abtn" onClick={() => patch.mutate({ platform, chzzkId: chzzkId || null, soopId: soopId || null })}>
            플랫폼 변경 저장
          </button>
        )}
      </div>

      {/* 백필 */}
      <div className="epsec">
        <button className="abtn ghost" onClick={() => { void adminFetch(token, `/api/admin/streamers/${s.id}/backfill`, { method: 'POST' }); setMsg('백필 시작됨 — 잠시 후 반영'); }}>
          다시보기 백필 실행
        </button>
      </div>

      {msg && <div className="epmsg">{msg}</div>}

      {/* 삭제 */}
      <div className="epsec danger">
        <button className="delbtn" onClick={() => setConfirmDel(true)}>스트리머 삭제</button>
      </div>

      {confirmDel && (
        <div className="dlg-scrim" onClick={() => setConfirmDel(false)}>
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            <b>{s.name} 삭제</b>
            <p>이 스트리머와 <strong>모든 방송 기록</strong>이 영구 삭제됩니다.<br />되돌릴 수 없어요.</p>
            <div className="dlg-btns">
              <button className="minibtn ghost" onClick={() => setConfirmDel(false)}>취소</button>
              <button className="minibtn del" onClick={() => del.mutate()} disabled={del.isPending}>
                {del.isPending ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddPanel({ token, onDone }: { token: string; onDone: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResults(await adminFetch<SearchResult>(token, `/api/admin/search?q=${encodeURIComponent(q)}`));
    } finally {
      setBusy(false);
    }
  };

  const add = async (body: object) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await adminFetch<{ id: number; name: string }>(token, '/api/admin/streamers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onDone(r.id);
    } catch {
      setMsg('추가에 실패했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3><span className="mark" />스트리머 추가</h3>
      <div style={{ display: 'flex', gap: 7 }}>
        <input
          className="ainp"
          style={{ marginTop: 0, flex: 1 }}
          placeholder="이름으로 검색 (치지직+숲)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
        />
        <button className="abtn" style={{ marginTop: 0, width: 'auto', padding: '0 16px' }} onClick={() => void search()} disabled={busy}>
          검색
        </button>
      </div>
      {results && (
        <div style={{ marginTop: 10 }}>
          {results.chzzk.map((r) => (
            <button key={r.channelId} className="ares" onClick={() => void add({ platform: 'chzzk', chzzkId: r.channelId })}>
              <img src={r.profileImage} alt="" />
              <b>{r.name}</b>
              <span className="pfbadge chzzk">치지직</span>
              <s className="num">{fmtCompact(r.followers)}</s>
            </button>
          ))}
          {results.soop.map((r) => (
            <button key={r.soopId} className="ares" onClick={() => void add({ platform: 'soop', soopId: r.soopId })}>
              <img src={r.profileImage} alt="" />
              <b>{r.name}</b>
              <span className="pfbadge soop">숲</span>
              <s className="num">{fmtCompact(r.followers)}</s>
            </button>
          ))}
          {results.chzzk.length === 0 && results.soop.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--faint)', textAlign: 'center', padding: 12 }}>검색 결과가 없어요</div>
          )}
        </div>
      )}
      {msg && <div className="epmsg">{msg}</div>}
    </div>
  );
}
