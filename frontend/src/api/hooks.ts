import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  DaySession,
  SessionsResponse,
  Streamer,
  StreamerDetail,
  Vod,
  WeeklyStats,
} from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** 홈 — 30초 자동 갱신 */
export const useStreamers = () =>
  useQuery({
    queryKey: ['streamers'],
    queryFn: () => get<Streamer[]>('/api/streamers'),
    refetchInterval: 30_000,
  });

export const useStreamerDetail = (id: number) =>
  useQuery({
    queryKey: ['streamer', id],
    queryFn: () => get<StreamerDetail>(`/api/streamers/${id}`),
    refetchInterval: 60_000,
  });

export const useStreamerSessions = (id: number, days = 182) =>
  useQuery({
    queryKey: ['sessions', id, days],
    queryFn: () => get<SessionsResponse>(`/api/streamers/${id}/sessions?days=${days}`),
  });

/** 달력용 — 해당 KST 월의 세션 전체 (30건 제한 없음). 월 이동 중엔 이전 데이터 유지 */
export const useStreamerMonthSessions = (id: number, year: number, month0: number) => {
  const key = `${year}-${String(month0 + 1).padStart(2, '0')}`;
  return useQuery({
    queryKey: ['sessions-month', id, key],
    queryFn: () => get<SessionsResponse>(`/api/streamers/${id}/sessions?month=${key}`),
    placeholderData: keepPreviousData,
  });
};

export const useStreamerPattern = (id: number) =>
  useQuery({
    queryKey: ['pattern', id],
    queryFn: () => get<{ grid: number[][] }>(`/api/streamers/${id}/pattern`),
  });

export const useStreamerVods = (id: number) =>
  useQuery({
    queryKey: ['vods', id],
    queryFn: () => get<{ vods: Vod[]; hasMore: boolean }>(`/api/streamers/${id}/vods`),
  });

export const useDaySessions = (date?: string) =>
  useQuery({
    queryKey: ['day', date ?? 'today'],
    queryFn: () =>
      get<{ date: string; sessions: DaySession[] }>(
        `/api/sessions/day${date ? `?date=${date}` : ''}`,
      ),
    refetchInterval: date ? false : 60_000,
  });

export const useWeeklyStats = () =>
  useQuery({
    queryKey: ['weekly'],
    queryFn: () => get<WeeklyStats>('/api/stats/weekly'),
    refetchInterval: 5 * 60_000,
  });
