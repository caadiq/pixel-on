/**
 * 프로필 이미지에서 대표색 추출
 *
 * sharp의 dominant(거친 RGB 히스토그램)는 일러스트 프로필에서 피부·머리색에
 * 수렴하는 문제가 있어(29명 중 대다수가 같은 적갈색), 채도 가중 hue 히스토그램을
 * 직접 계산한다: 유채색 픽셀을 24개 hue 구간에 나눠 채도 가중 투표 → 최다 구간의
 * 평균색을 대표색으로.
 */
import sharp from 'sharp';
import { normalizeCardColor, rgbToHsl } from '../lib/color.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const HUE_BUCKETS = 24;

/** 이미지 URL → 정규화된 대표색 hex. 실패 시 null */
export async function extractColorFromUrl(imageUrl: string): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await extractColor(buf);
  } catch {
    return null;
  }
}

export async function extractColor(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(64, 64, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // hue 구간별 채도 가중 투표
    const votes = new Float64Array(HUE_BUCKETS);
    const sums = Array.from({ length: HUE_BUCKETS }, () => ({ r: 0, g: 0, b: 0, w: 0 }));

    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * 3];
      const g = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      const { h, s, l } = rgbToHsl(r, g, b);
      // 무채색·극단 명도 제외 (배경 흰색, 라인 검정)
      if (s < 0.22 || l < 0.15 || l > 0.92) continue;
      const bucket = Math.min(HUE_BUCKETS - 1, Math.floor((h / 360) * HUE_BUCKETS));
      const w = s; // 채도가 높을수록 브랜드색일 가능성
      votes[bucket] += w;
      const acc = sums[bucket];
      acc.r += r * w;
      acc.g += g * w;
      acc.b += b * w;
      acc.w += w;
    }

    let best = -1;
    let bestVotes = 0;
    for (let i = 0; i < HUE_BUCKETS; i++) {
      if (votes[i] > bestVotes) {
        bestVotes = votes[i];
        best = i;
      }
    }
    // 유채색 픽셀이 전체의 3% 미만이면 실패 처리 (흑백 프로필 등)
    if (best < 0 || bestVotes < info.width * info.height * 0.03) return null;

    const acc = sums[best];
    return normalizeCardColor(acc.r / acc.w, acc.g / acc.w, acc.b / acc.w);
  } catch {
    return null;
  }
}
