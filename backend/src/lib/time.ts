/** "YYYY-MM-DD HH:mm:ss" (KST) → Date. 치지직·숲 모두 이 포맷을 쓴다 */
export function parseKst(s: string | undefined | null): Date {
  if (!s) return new Date();
  return new Date(`${s.replace(' ', 'T')}+09:00`);
}
