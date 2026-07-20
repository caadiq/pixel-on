/**
 * 치지직 비공식 API 어댑터 — 호출부는 반드시 이 파일만 거칠 것
 *
 * ⚠ 비공식 API라 예고 없이 바뀔 수 있다 (v1 live-detail 폐지 전례)
 * ⚠ CORS 차단이라 서버사이드 전용
 * - openDate/closeDate는 정확값이며 종료 후에도 직전 방송 1건이 남는다
 */
import { parseKst } from '../lib/time.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const TIMEOUT_MS = 10_000;

/** 429/403 등 스로틀 신호를 상위(폴러 백오프)에 알리기 위한 에러 */
export class ThrottledError extends Error {
  constructor(public status: number) {
    super(`throttled: HTTP ${status}`);
  }
}

async function get<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status === 403) throw new ThrottledError(res.status);
      if (!res.ok) return null;
      const j = (await res.json()) as { code: number; content: T };
      return j.code === 200 ? j.content : null;
    } catch (e) {
      if (e instanceof ThrottledError) throw e;
      // 간헐적 커넥션 리셋 실측됨 — 1회 재시도
    }
  }
  return null;
}

export interface ChzzkLiveStatus {
  status: 'OPEN' | 'CLOSE';
  title: string;
  category: string | null;
  viewers: number;
  accumulate: number;
  openDate: Date;
  closeDate: Date | null;
  /** 서버가 지시하는 혼잡 상태 (-1 = 정상) */
  trafficThrottling: number;
}

interface LiveStatusRaw {
  status: string;
  liveTitle: string | null;
  liveCategoryValue: string | null;
  concurrentUserCount: number;
  accumulateCount: number;
  openDate: string | null;
  closeDate: string | null;
  livePollingStatusJson: string;
}

export async function fetchChzzkLiveStatus(channelId: string): Promise<ChzzkLiveStatus | null> {
  const c = await get<LiveStatusRaw>(
    `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`,
  );
  if (!c) return null;

  let throttling = -1;
  try {
    throttling = (JSON.parse(c.livePollingStatusJson) as { trafficThrottling?: number })
      .trafficThrottling ?? -1;
  } catch {
    /* 폴링 메타 파싱 실패는 무시 */
  }

  return {
    status: c.status === 'OPEN' ? 'OPEN' : 'CLOSE',
    title: c.liveTitle ?? '',
    category: c.liveCategoryValue,
    viewers: c.concurrentUserCount,
    accumulate: c.accumulateCount,
    openDate: parseKst(c.openDate),
    closeDate: c.closeDate ? parseKst(c.closeDate) : null,
    trafficThrottling: throttling,
  };
}

interface LiveDetailRaw {
  liveImageUrl: string | null;
}

/** 현재 라이브 썸네일 URL (방송 중이 아닐 땐 null) */
export async function fetchChzzkLiveThumbnail(channelId: string): Promise<string | null> {
  const c = await get<LiveDetailRaw>(
    `https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`,
  );
  return c?.liveImageUrl ? c.liveImageUrl.replace('{type}', '480') : null;
}

export interface ChzzkVideo {
  videoNo: number;
  title: string;
  category: string | null;
  thumbnail: string | null;
  /** VOD 공개 시각 ≈ 방송 종료 직후 */
  publishDate: Date;
  /** 영상 길이 (초) */
  duration: number;
  /** 라이브 누적 시청 (있으면) */
  livePv: number | null;
}

interface VideoListRaw {
  totalCount: number;
  totalPages: number;
  data: Array<{
    videoNo: number;
    videoTitle: string;
    videoType: string;
    publishDate: string;
    duration: number;
    videoCategoryValue: string | null;
    livePv: number | null;
    thumbnailImageUrl: string | null;
  }>;
}

/** 다시보기(REPLAY) 목록 — page는 0부터 */
export async function fetchChzzkVideos(
  channelId: string,
  page: number,
): Promise<{ videos: ChzzkVideo[]; hasMore: boolean } | null> {
  const c = await get<VideoListRaw>(
    `https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos?size=30&page=${page}&sortType=LATEST`,
  );
  if (!c) return null;
  return {
    videos: c.data
      .filter((v) => v.videoType === 'REPLAY')
      .map((v) => ({
        videoNo: v.videoNo,
        title: v.videoTitle,
        category: v.videoCategoryValue,
        thumbnail: v.thumbnailImageUrl,
        publishDate: parseKst(v.publishDate),
        duration: v.duration,
        livePv: v.livePv,
      })),
    hasMore: page + 1 < c.totalPages,
  };
}

export interface ChzzkChannel {
  channelId: string;
  name: string;
  profileImage: string;
  followers: number;
}

interface ChannelRaw {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  followerCount: number;
}

export async function fetchChzzkChannel(channelId: string): Promise<ChzzkChannel | null> {
  const c = await get<ChannelRaw>(`https://api.chzzk.naver.com/service/v1/channels/${channelId}`);
  if (!c) return null;
  return {
    channelId: c.channelId,
    name: c.channelName,
    profileImage: c.channelImageUrl ?? '',
    followers: c.followerCount,
  };
}

export interface ChzzkSearchResult {
  channelId: string;
  name: string;
  profileImage: string;
  followers: number;
}

interface SearchRaw {
  data: Array<{
    channel: {
      channelId: string;
      channelName: string;
      channelImageUrl: string | null;
      followerCount: number;
    };
  }>;
}

export async function searchChzzkChannels(keyword: string): Promise<ChzzkSearchResult[]> {
  const c = await get<SearchRaw>(
    `https://api.chzzk.naver.com/service/v1/search/channels?keyword=${encodeURIComponent(keyword)}&size=5`,
  );
  return (c?.data ?? []).map((d) => ({
    channelId: d.channel.channelId,
    name: d.channel.channelName,
    profileImage: d.channel.channelImageUrl ?? '',
    followers: d.channel.followerCount,
  }));
}
