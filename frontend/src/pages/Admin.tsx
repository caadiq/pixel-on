import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FALLBACK_COLOR, fmtCompact } from '../lib/format';

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

const KEY_STORAGE = 'pixel-admin-key';

async function adminFetch<T>(key: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init?.headers, 'X-Admin-Key': key, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function Admin() {
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORAGE) ?? '');
  const [authed, setAuthed] = useState(false);

  if (!authed) return <Login savedKey={key} onOk={(k) => { setKey(k); setAuthed(true); }} />;
  return <AdminMain adminKey={key} />;
}

function Login({ savedKey, onOk }: { savedKey: string; onOk: (k: string) => void }) {
  const [input, setInput] = useState(savedKey);
  const [err, setErr] = useState('');

  const tryLogin = async (k: string) => {
    try {
      await adminFetch(k, '/api/admin/ping');
      localStorage.setItem(KEY_STORAGE, k);
      onOk(k);
    } catch {
      setErr('키가 맞지 않아요');
    }
  };

  // 저장된 키가 있으면 자동 시도
  useState(() => {
    if (savedKey) void tryLogin(savedKey);
  });

  return (
    <main className="wrap" style={{ maxWidth: 420 }}>
      <section className="sec">
        <div className="panel" style={{ textAlign: 'center', padding: 32 }}>
          <h3 className="jua" style={{ justifyContent: 'center', fontSize: 19 }}>관리자</h3>
          <input
            className="ainp"
            type="password"
            placeholder="관리자 키"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void tryLogin(input)}
          />
          {err && <div style={{ color: 'var(--live)', fontSize: 12, marginTop: 8, fontWeight: 600 }}>{err}</div>}
          <button className="abtn" onClick={() => void tryLogin(input)}>들어가기</button>
        </div>
      </section>
    </main>
  );
}

function AdminMain({ adminKey }: { adminKey: string }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ['admin-streamers'],
    queryFn: () => adminFetch<AdminStreamer[]>(adminKey, '/api/admin/streamers'),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-streamers'] });
    void qc.invalidateQueries({ queryKey: ['streamers'] });
  };

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      adminFetch(adminKey, `/api/admin/streamers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const [selected, setSelected] = useState<AdminStreamer | null>(null);

  if (!rows) return <div className="loading">불러오는 중…</div>;

  return (
    <main className="wrap">
      <section className="sec">
        <div className="shead">
          <h2>스트리머 관리</h2>
          <span className="sub">
            {rows.length}명 · 비활성 {rows.filter((r) => !r.active).length}명
          </span>
        </div>
        <div className="admgrid">
          <div className="panel" style={{ padding: '8px 16px' }}>
            {rows.map((s) => (
              <div key={s.id} className={`admrow ${s.active ? '' : 'off'}`}>
                <img src={s.profileImage} alt="" />
                <b>{s.name}</b>
                <span className={`pfbadge ${s.platform}`}>{s.platform === 'soop' ? '숲' : '치지직'}</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--soft)' }}>{fmtCompact(s.followers)}</span>
                <button
                  className="csw"
                  title={s.color ? `수동 ${s.color}` : s.autoColor ? `자동 ${s.autoColor}` : '색 없음'}
                  onClick={() => setSelected(s)}
                >
                  <i style={{ background: s.color ?? s.autoColor ?? FALLBACK_COLOR }} className={s.color ? 'man' : ''} />
                  <span>{s.color ? '수동' : s.autoColor ? '자동' : '없음'}</span>
                </button>
                <button
                  className={`tg ${s.active ? 'on' : ''}`}
                  title={s.active ? '활성 (클릭 시 비활성)' : '비활성'}
                  onClick={() => patch.mutate({ id: s.id, body: { active: !s.active } })}
                />
              </div>
            ))}
          </div>
          <div className="admside">
            <AddPanel adminKey={adminKey} onAdded={invalidate} />
            {selected && (
              <ColorPanel
                key={selected.id}
                s={rows.find((r) => r.id === selected.id) ?? selected}
                onSave={(color) => patch.mutate({ id: selected.id, body: { color } })}
                adminKey={adminKey}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function AddPanel({ adminKey, onAdded }: { adminKey: string; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResults(await adminFetch<SearchResult>(adminKey, `/api/admin/search?q=${encodeURIComponent(q)}`));
    } finally {
      setBusy(false);
    }
  };

  const add = async (body: object) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await adminFetch<{ name: string }>(adminKey, '/api/admin/streamers', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMsg(`✓ ${r.name} 추가됨`);
      setResults(null);
      setQ('');
      onAdded();
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
            <div style={{ fontSize: 12, color: 'var(--faint)', textAlign: 'center', padding: 10 }}>검색 결과가 없어요</div>
          )}
        </div>
      )}
      {msg && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mint)', marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

function ColorPanel({
  s,
  onSave,
  adminKey,
}: {
  s: AdminStreamer;
  onSave: (color: string | null) => void;
  adminKey: string;
}) {
  const [val, setVal] = useState(s.color ?? s.autoColor ?? '#888888');
  const [backfillMsg, setBackfillMsg] = useState('');

  return (
    <div className="panel">
      <h3>
        <span className="mark" style={{ background: s.color ?? s.autoColor ?? FALLBACK_COLOR }} />
        대표색 — {s.name}
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="color" value={val} onChange={(e) => setVal(e.target.value)} className="cpick-big" />
        <div>
          <div className="num" style={{ fontFamily: 'ui-monospace', fontSize: 13, fontWeight: 700 }}>{val.toUpperCase()}</div>
          <div style={{ fontSize: 10.5, color: 'var(--soft)', fontWeight: 600, marginTop: 2 }}>
            {s.color ? '수동 지정됨' : '자동 추출값'}
          </div>
        </div>
      </div>
      {s.autoColor && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--soft)', marginBottom: 6 }}>자동 추출값</div>
          <button className="cswatch" style={{ background: s.autoColor }} onClick={() => setVal(s.autoColor!)} title={s.autoColor} />
        </div>
      )}
      <button className="abtn" onClick={() => onSave(val)}>이 색으로 저장</button>
      {s.color && (
        <button className="abtn ghost" onClick={() => onSave(null)}>자동값으로 되돌리기</button>
      )}
      <button
        className="abtn ghost"
        onClick={() => {
          void adminFetch(adminKey, `/api/admin/streamers/${s.id}/backfill`, { method: 'POST' });
          setBackfillMsg('백필 시작됨 — 잠시 후 반영돼요');
        }}
      >
        다시보기 백필 실행
      </button>
      {backfillMsg && <div style={{ fontSize: 11.5, color: 'var(--mint)', fontWeight: 700, marginTop: 8 }}>{backfillMsg}</div>}
    </div>
  );
}
