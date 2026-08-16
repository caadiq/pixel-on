export interface LiveNow {
  title: string;
  category: string | null;
  viewers: number;
  startedAt: string;
  thumbnail: string | null;
  /** 라이브 페이지 링크 (치지직/숲) */
  url: string;
}

export interface Streamer {
  id: number;
  name: string;
  platform: 'chzzk' | 'soop';
  profileImage: string;
  followers: number;
  color: string | null;
  live: LiveNow | null;
}

export interface StreamerDetail extends Streamer {
  stats: {
    monthCount: number;
    monthHours: number;
    /** 가장 최근 방송 (기간 제한 없음) */
    lastSession: { startedAt: string; endedAt: string | null; durationMs: number } | null;
    topCategory: string | null;
    bestPeak: number;
  };
}

export interface SessionItem {
  id: number;
  title: string;
  category: string | null;
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  accumulate: number | null;
  source: 'poll' | 'backfill';
  vodId: string | null;
  thumbnail: string | null;
}

export interface SessionsResponse {
  sessions: SessionItem[];
  daily: { date: string; hours: number }[];
}

export interface DaySession {
  id: number;
  streamerId: number;
  name: string;
  color: string | null;
  profileImage: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  source: 'poll' | 'backfill';
  vodId: string | null;
  liveUrl: string | null;
}

export interface WeeklyStats {
  /** 이번 주 월요일 (KST, YYYY-MM-DD) */
  weekStart: string;
  totalHours: number;
  longest: { name: string; hours: number } | null;
  bestPeak: { name: string; peak: number } | null;
  /** 가장 많이 켠 요일 (0=월 … 6=일) */
  topWeekday: { weekday: number; count: number } | null;
  daily: { date: string; hours: number }[];
}

export interface Vod {
  id: string;
  title: string;
  category: string | null;
  thumbnail: string | null;
  publishedAt: string;
  duration: number;
  url: string;
}
