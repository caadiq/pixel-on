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

export interface SoopVod {
  titleNo: number;
  title: string;
  category: string | null;
  thumbnail: string | null;
  /** 등록 시각 ≈ 방송 종료 직후 */
  regDate: Date;
  /** 영상 길이 (초) */
  duration: number;
}

interface VodListRaw {
  data?: Array<{
    title_no: number;
    title_name: string;
    reg_date: string;
    ucc?: {
      total_file_duration?: number;
      category_tags?: string[];
      thumb?: string;
    };
  }>;
  meta?: { last_page?: number; current_page?: number };
}

/** 다시보기(REVIEW=본방 다시보기) 목록 — page는 1부터 */
export async function fetchSoopVods(
  soopId: string,
  page: number,
): Promise<{ vods: SoopVod[]; hasMore: boolean } | null> {
  const j = (await get(
    `https://chapi.sooplive.co.kr/api/${encodeURIComponent(soopId)}/vods/review?page=${page}&per_page=30&orderby=reg_date`,
  )) as VodListRaw | null;
  if (!j?.data) return null;
  return {
    vods: j.data.map((v) => ({
      titleNo: v.title_no,
      title: v.title_name,
      category: v.ucc?.category_tags?.[0] ?? null,
      thumbnail: v.ucc?.thumb ? (v.ucc.thumb.startsWith('//') ? 'https:' + v.ucc.thumb : v.ucc.thumb) : null,
      regDate: parseKst(v.reg_date),
      duration: normalizeDuration(v.ucc?.total_file_duration ?? 0),
    })),
    hasMore: (j.meta?.current_page ?? page) < (j.meta?.last_page ?? page),
  };
}

/** 숲 duration은 ms로 오는 경우가 있어 보정 (3일 초과 값이면 ms로 간주) */
function normalizeDuration(d: number): number {
  return d > 86_400 * 3 ? Math.round(d / 1000) : d;
}

export interface SoopSearchResult {
  soopId: string;
  name: string;
  profileImage: string;
  followers: number;
}

interface BjSearchRaw {
  DATA?: Array<{
    user_id: string;
    user_nick: string;
    station_logo?: string;
    favorite_cnt?: string | number;
  }>;
}

export async function searchSoopChannels(keyword: string): Promise<SoopSearchResult[]> {
  const j = (await get(
    `https://sch.sooplive.co.kr/api.php?m=bjSearch&v=1.0&szKeyword=${encodeURIComponent(keyword)}&c=UTF-8&nPageNo=1&nListCnt=5`,
  )) as BjSearchRaw | null;
  return (j?.DATA ?? []).map((d) => ({
    soopId: d.user_id,
    name: d.user_nick,
    profileImage: d.station_logo ?? '',
    followers: Number(d.favorite_cnt ?? 0),
  }));
}
