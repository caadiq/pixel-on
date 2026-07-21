/** 표시 유틸 — 모든 시각은 KST로 표기 */

const KST = 'Asia/Seoul';

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { timeZone: KST, month: 'numeric', day: 'numeric' });

export const fmtDateFull = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return d.toLocaleDateString('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

/** ISO → "오늘"/"어제"/"7/18" */
export function fmtRelDate(iso: string): string {
  const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const target = kstDay(new Date(iso));
  const today = kstDay(new Date());
  const yesterday = kstDay(new Date(Date.now() - 86400_000));
  if (target === today) return '오늘';
  if (target === yesterday) return '어제';
  return fmtDate(iso);
}

/** 초 → "3:04:12" */
export function fmtDurClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** ms → "6시간 12분" */
export function fmtDurKo(ms: number): string {
  const h = Math.floor(ms / 3600_000);
  const m = Math.round((ms % 3600_000) / 60_000);
  if (h === 0) return `${m}분`;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

/** 분(0~1439) → "오후 8시 47분" */
export function fmtMinOfDay(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 < 12 ? '오전' : '오후';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m > 0 ? `${ampm} ${h}시 ${m}분` : `${ampm} ${h}시`;
}

/** 145000 → "14.5만" */
export function fmtCompact(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`;
  return n.toLocaleString('ko-KR');
}

/** 세션의 KST 자정 기준 위치(0~1)와 길이(0~1) — 간트·타임라인용 */
export function dayFraction(iso: string, dateStr: string): number {
  const dayStart = new Date(`${dateStr}T00:00:00+09:00`).getTime();
  return Math.max(0, Math.min(1, (new Date(iso).getTime() - dayStart) / 86400_000));
}

export const FALLBACK_COLOR = '#9aa1af';
