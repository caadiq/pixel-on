/**
 * 숲(SOOP) 비공식 API 어댑터 — 호출부는 반드시 이 파일만 거칠 것
 *
 * ⚠ chapi는 브라우저 UA가 아니면 404를 반환한다 (없는 채널로 오인 주의)
 * ⚠ 구 도메인(bjapi.afreecatv.com) 사용 금지 — 현행은 chapi.sooplive.co.kr
 */

import { parseKst } from '../lib/time.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const TIMEOUT_MS = 10_000;

async function get(url: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      // 간헐적 커넥션 리셋 실측됨 — 1회 재시도
    }
  }
  return null;
}

export interface SoopStation {
  nickname: string;
  profileImage: string;
  /** 애청자 수 (팔로워에 해당) */
  followers: number;
  live: {
    broadNo: number;
    title: string;
    viewers: number;
    startedAt: Date;
    category: string | null;
  } | null;
}

interface StationResponse {
  station?: {
    user_nick?: string;
    upd?: { fan_cnt?: number };
    broad_start?: string;
  };
  profile_image?: string;
  broad?: {
    broad_no?: number;
    broad_title?: string;
    current_sum_viewer?: number;
    broad_cate_no?: number;
  } | null;
}

/** 채널 정보 + 현재 라이브 (broad 키 존재 = 방송 중) */
export async function fetchSoopStation(soopId: string): Promise<SoopStation | null> {
  const j = (await get(
    `https://chapi.sooplive.co.kr/api/${encodeURIComponent(soopId)}/station`,
  )) as StationResponse | null;
  if (!j?.station) return null;

  const profile = j.profile_image ?? '';
  const broad = j.broad ?? null;

  return {
    nickname: j.station.user_nick ?? soopId,
    profileImage: profile.startsWith('//') ? `https:${profile}` : profile,
    followers: j.station.upd?.fan_cnt ?? 0,
    live: broad
      ? {
          broadNo: broad.broad_no ?? 0,
          title: broad.broad_title ?? '',
          viewers: broad.current_sum_viewer ?? 0,
          // 정확한 시작 시각은 station.broad_start (KST 문자열)
          startedAt: parseKst(j.station.broad_start),
          category: broad.broad_cate_no != null ? String(broad.broad_cate_no) : null,
        }
      : null,
  };
}
