import { useEffect, useRef, useState } from 'react';
import { avatar } from '../lib/avatar';
import type { Streamer } from '../api/types';
import { useDismiss } from '../lib/useDismiss';

/** 스트리머 필터 드롭다운 — 검색 가능, 바깥 클릭/ESC로 닫힘 */
export function StreamerPicker({
  streamers,
  value,
  onChange,
}: {
  streamers: Streamer[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { closing, dismiss } = useDismiss(() => setOpen(false), 130);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQ('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const selected = streamers.find((s) => s.id === value) ?? null;
  const filtered = q ? streamers.filter((s) => s.name.includes(q)) : streamers;

  const pick = (id: number | null) => {
    onChange(id);
    dismiss();
  };

  return (
    <div className="pickwrap">
      <button className="pickbtn" onClick={() => (open ? dismiss() : setOpen(true))} aria-expanded={open}>
        {selected ? (
          <>
            <img src={avatar(selected.profileImage)} alt="" />
            {selected.name}
          </>
        ) : (
          '전체 스트리머'
        )}
        <span className="caret">▾</span>
      </button>

      {open && (
        <>
          <div className="pickscrim" onClick={dismiss} />
          <div className={`pickmenu ${closing ? 'closing' : ''}`}>
            <input
              ref={inputRef}
              className="psearch"
              placeholder="이름 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="picklist">
              <button className={`pickitem ${value === null ? 'on' : ''}`} onClick={() => pick(null)}>
                전체 스트리머
              </button>
              {filtered.map((s) => (
                <button
                  key={s.id}
                  className={`pickitem ${value === s.id ? 'on' : ''}`}
                  onClick={() => pick(s.id)}
                >
                  <img src={avatar(s.profileImage)} alt="" />
                  {s.name}
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ padding: 14, textAlign: 'center', color: 'var(--faint)', fontSize: 12.5 }}>
                  검색 결과가 없어요
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
