import { FreqPoint } from '../types';
import { fmtFreq, fmtTime } from '../utils';
import { computeStats } from '../compute';

interface Props {
  samplingRate: number;
  risingCount: number;
  fallingCount: number;
  duration: number;
  allFreqPts: FreqPoint[];
  displayCount: number;
}

export function Sidebar({
  samplingRate,
  risingCount,
  fallingCount,
  duration,
  allFreqPts,
  displayCount,
}: Props) {
  const stats = computeStats(allFreqPts);

  return (
    <aside className="sidebar">
      <h3>统计信息</h3>
      <div className="sidebar-section">
        <StatRow label="采样频率" value={fmtFreq(samplingRate)} cls="accent" />
        <StatRow label="上升沿数" value={risingCount.toLocaleString()} cls="green" />
        <StatRow label="下降沿数" value={fallingCount.toLocaleString()} cls="rose" />
        <StatRow label="数据时长" value={fmtTime(duration)} />
      </div>
      {stats && (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-section">
            <StatRow label="频率点数" value={allFreqPts.length.toLocaleString()} cls="accent" />
            {displayCount < allFreqPts.length && (
              <StatRow label="图表显示" value={displayCount.toLocaleString()} />
            )}
            <StatRow label="频率最小值" value={fmtFreq(stats.min)} cls="green" />
            <StatRow label="频率最大值" value={fmtFreq(stats.max)} cls="rose" />
            <StatRow label="频率均值" value={fmtFreq(stats.avg)} cls="accent" />
            <StatRow label="标准差" value={fmtFreq(stats.std)} />
            <StatRow label="变异系数" value={stats.cv.toFixed(4) + '%'} />
          </div>
        </>
      )}
    </aside>
  );
}

function StatRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="stat-row">
      <span className="stat-k">{label}</span>
      <span className={`stat-v ${cls || ''}`}>{value}</span>
    </div>
  );
}
