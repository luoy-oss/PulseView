import { FreqPoint } from '../types';
import { fmtFreq, fmtTime } from '../utils';
import { computeStats } from '../compute';

interface Props {
  samplingRate: number;
  pulseCount: number;
  risingCount: number;
  fallingCount: number;
  duration: number;
  allFreqPts: FreqPoint[];
  lowGapMode: boolean;
}

export function Sidebar({
  samplingRate,
  pulseCount,
  risingCount,
  fallingCount,
  duration,
  allFreqPts,
  lowGapMode,
}: Props) {
  const stats = computeStats(allFreqPts);

  return (
    <aside className="sidebar">
      <h3>统计信息</h3>
      <div className="sidebar-section">
        <StatRow label="采样频率" value={fmtFreq(samplingRate)} cls="accent" />
        <StatRow label="上升沿数" value={risingCount.toLocaleString()} cls="green" />
        <StatRow label="下降沿数" value={fallingCount.toLocaleString()} cls="rose" />
        <StatRow label="总脉冲数" value={pulseCount.toLocaleString()} cls="accent" />
        <StatRow label="数据时长" value={fmtTime(duration)} />
      </div>
      {stats && (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-section">
            <StatRow label={lowGapMode ? '间隔点数' : '频率点数'} value={allFreqPts.length.toLocaleString()} cls="accent" />
            <StatRow label={lowGapMode ? '间隔最小值' : '频率最小值'} value={lowGapMode ? fmtTime(stats.min) : fmtFreq(stats.min)} cls="green" />
            <StatRow label={lowGapMode ? '间隔最大值' : '频率最大值'} value={lowGapMode ? fmtTime(stats.max) : fmtFreq(stats.max)} cls="rose" />
            <StatRow label={lowGapMode ? '间隔均值' : '频率均值'} value={lowGapMode ? fmtTime(stats.avg) : fmtFreq(stats.avg)} cls="accent" />
            <StatRow label="标准差" value={lowGapMode ? fmtTime(stats.std) : fmtFreq(stats.std)} />
            <StatRow
              label="变异系数"
              value={lowGapMode && stats.avg === 0 ? '—' : stats.cv.toFixed(4) + '%'}
            />
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
