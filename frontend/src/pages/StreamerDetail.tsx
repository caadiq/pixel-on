import { useParams } from 'react-router-dom';
import { useStreamerDetail, useStreamerVods } from '../api/hooks';
import { BroadcastRecord } from '../components/BroadcastRecord';
import { FALLBACK_COLOR, fmtCompact, fmtDurClock, fmtMinOfDay, fmtRelDate } from '../lib/format';

export function StreamerDetail() {
  const id = Number(useParams().id);
  const { data: s, isLoading } = useStreamerDetail(id);

  if (isLoading) return <div className="loading">불러오는 중…</div>;
  if (!s) return <div className="loading">스트리머를 찾을 수 없어요</div>;

  const c = s.color ?? FALLBACK_COLOR;

  return (
    <main style={{ '--c': c } as React.CSSProperties}>
      <div className="dhead">
        <div className="wrap">
          <img src={s.profileImage} alt={s.name} />
          <div>
            <h1 className="jua">
              {s.name}
              {s.live && (
                <span className="lbadge">
                  <i />
                  LIVE
                </span>
              )}
            </h1>
            <div className="meta">
              <span className={`pfbadge ${s.platform}`}>{s.platform === 'soop' ? '숲' : '치지직'}</span>
              <span className="num">팔로워 {fmtCompact(s.followers)}</span>
              {s.live && <span>{s.live.title}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="wrap">
        <div className="dstats">
          <div className="dstat">
            <i>이번 달 방송</i>
            <b className="num">
              {s.stats.monthCount}
              <em>회 · {s.stats.monthHours}시간</em>
            </b>
          </div>
          <div className="dstat">
            <i>평균 시작 시각</i>
            <b className="num">{s.stats.avgStartMin != null ? fmtMinOfDay(s.stats.avgStartMin) : '—'}</b>
          </div>
          <div className="dstat">
            <i>최고 동시 시청</i>
            <b className="num">{s.stats.bestPeak > 0 ? s.stats.bestPeak.toLocaleString('ko-KR') : '—'}</b>
          </div>
          <div className="dstat">
            <i>주로 하는 카테고리</i>
            <b style={{ fontSize: 16 }}>{s.stats.topCategory ?? '—'}</b>
          </div>
        </div>

        <BroadcastRecord id={id} color={c} liveThumbnail={s.live?.thumbnail ?? null} />
        <Vods id={id} color={c} />
      </div>
    </main>
  );
}

function Vods({ id, color }: { id: number; color: string }) {
  const { data } = useStreamerVods(id);
  if (!data || data.vods.length === 0) return null;

  return (
    <section className="sec">
      <div className="shead">
        <h2>다시보기</h2>
      </div>
      <div className="vgrid">
        {data.vods.slice(0, 8).map((v) => (
          <a
            key={v.id}
            className="vod"
            href={v.url}
            target="_blank"
            rel="noreferrer"
            style={{ '--c': color } as React.CSSProperties}
          >
            <div className="th">
              {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" />}
              <span className="dur num">{fmtDurClock(v.duration)}</span>
            </div>
            <div className="bd">
              <b>{v.title}</b>
              <span className="sub">
                <span>{fmtRelDate(v.publishedAt)}</span>
                {v.category && <span>{v.category}</span>}
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
