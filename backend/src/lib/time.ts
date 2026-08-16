/** "YYYY-MM-DD HH:mm:ss" (KST) → Date. 치지직·숲 모두 이 포맷을 쓴다 */
export function parseKst(s: string | undefined | null): Date {
  if (!s) return new Date();
  return new Date(`${s.replace(' ', 'T')}+09:00`);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date → KST 기준 "YYYY-MM-DD" */
export function kstDateStr(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" (KST 날짜) → 그 날의 UTC 경계 [00:00, 다음날 00:00) */
export function kstDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Date → KST 요일(0=월 … 6=일)·시각 */
export function kstParts(d: Date): { weekday: number; hour: number; minute: number } {
  const k = new Date(d.getTime() + KST_OFFSET_MS);
  return { weekday: (k.getUTCDay() + 6) % 7, hour: k.getUTCHours(), minute: k.getUTCMinutes() };
}

/** 오늘이 속한 주의 월요일(KST 00:00) — 주간 집계 기준 */
export function kstWeekStart(now: Date = new Date()): Date {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const weekday = (k.getUTCDay() + 6) % 7; // 0=월
  const midnightKst = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  return new Date(midnightKst - KST_OFFSET_MS - weekday * 24 * 60 * 60 * 1000);
}
