export interface LiveNow {
  title: string;
  category: string | null;
  viewers: number;
  startedAt: string;
  thumbnail: string | null;
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
    avgStartMin: number | null;
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
  totalHours: number;
  longest: { name: string; hours: number } | null;
  bestPeak: { name: string; peak: number } | null;
  avgStartMin: number | null;
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
