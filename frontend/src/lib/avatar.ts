/**
 * 프로필 이미지 리사이즈 URL.
 * 치지직(pstatic) 원본은 수백 KB~수 MB라 그대로 쓰면 홈 카드 등장 중 디코딩으로 프레임 드랍.
 * 네이버 CDN의 type 파라미터로 축소본을 받는다 (f120_120_na·f240_240_na만 지원 확인됨).
 * 숲 프로필은 원래 수십 KB라 그대로 사용.
 */
export function avatar(url: string, size: 120 | 240 = 120): string {
  if (!url.includes('pstatic.net') || url.includes('?')) return url;
  return `${url}?type=f${size}_${size}_na`;
}
