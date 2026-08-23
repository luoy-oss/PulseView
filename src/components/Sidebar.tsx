import { FreqPoint, SidebarStatVisibility } from '../types';
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
  visibility: SidebarStatVisibility;
  onVisibilityChange: (visibility: SidebarStatVisibility) => void;
}

export function Sidebar({
  samplingRate,
  pulseCount,
  risingCount,
  fallingCount,
  duration,
  allFreqPts,
  lowGapMode,
  visibility,
  onVisibilityChange,
}: Props) {
  const stats = computeStats(allFreqPts);
  const hasBaseStats = visibility.samplingRate || visibility.risingCount || visibility.fallingCount || visibility.pulseCount || visibility.duration;
  const hasDerivedStats = Boolean(stats) && (
    visibility.pointCount || visibility.minimum || visibility.maximum || visibility.average ||
    visibility.standardDeviation || visibility.coefficientOfVariation
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <h3>统计信息</h3>
        <SidebarStatsMenu visibility={visibility} onChange={onVisibilityChange} />
      </div>
      {hasBaseStats && <div className="sidebar-section">
        {visibility.samplingRate && <StatRow label="采样频率" value={fmtFreq(samplingRate)} cls="accent" />}
        {visibility.risingCount && <StatRow label="上升沿数" value={risingCount.toLocaleString()} cls="green" />}
        {visibility.fallingCount && <StatRow label="下降沿数" value={fallingCount.toLocaleString()} cls="rose" />}
        {visibility.pulseCount && <StatRow label="总脉冲数" value={pulseCount.toLocaleString()} cls="accent" />}
        {visibility.duration && <StatRow label="数据时长" value={fmtTime(duration)} />}
      </div>}
      {hasDerivedStats && stats && (
        <>
          <div className="sidebar-divider" />
          <div className="sidebar-section">
            {visibility.pointCount && <StatRow label={lowGapMode ? '间隔点数' : '频率点数'} value={allFreqPts.length.toLocaleString()} cls="accent" />}
            {visibility.minimum && <StatRow label={lowGapMode ? '间隔最小值' : '频率最小值'} value={lowGapMode ? fmtTime(stats.min) : fmtFreq(stats.min)} cls="green" />}
            {visibility.maximum && <StatRow label={lowGapMode ? '间隔最大值' : '频率最大值'} value={lowGapMode ? fmtTime(stats.max) : fmtFreq(stats.max)} cls="rose" />}
            {visibility.average && <StatRow label={lowGapMode ? '间隔均值' : '频率均值'} value={lowGapMode ? fmtTime(stats.avg) : fmtFreq(stats.avg)} cls="accent" />}
            {visibility.standardDeviation && <StatRow label="标准差" value={lowGapMode ? fmtTime(stats.std) : fmtFreq(stats.std)} />}
            {visibility.coefficientOfVariation && <StatRow
              label="变异系数"
              value={lowGapMode && stats.avg === 0 ? '—' : stats.cv.toFixed(4) + '%'}
            />}
          </div>
        </>
      )}
    </aside>
  );
}

const SIDEBAR_STAT_OPTIONS: Array<{ key: keyof SidebarStatVisibility; label: string }> = [
  { key: 'samplingRate', label: '采样频率' },
  { key: 'risingCount', label: '上升沿数' },
  { key: 'fallingCount', label: '下降沿数' },
  { key: 'pulseCount', label: '总脉冲数' },
  { key: 'duration', label: '数据时长' },
  { key: 'pointCount', label: '频率点数' },
  { key: 'minimum', label: '最小值' },
  { key: 'maximum', label: '最大值' },
  { key: 'average', label: '均值' },
  { key: 'standardDeviation', label: '标准差' },
  { key: 'coefficientOfVariation', label: '变异系数' },
];

function SidebarStatsMenu({ visibility, onChange }: { visibility: SidebarStatVisibility; onChange: (visibility: SidebarStatVisibility) => void }) {
  const setAll = (value: boolean) => onChange(Object.keys(visibility).reduce((next, key) => {
    next[key as keyof SidebarStatVisibility] = value;
    return next;
  }, {} as SidebarStatVisibility));

  return (
    <details className="sidebar-settings">
      <summary title="配置统计信息显示项" aria-label="配置统计信息显示项">☷</summary>
      <div className="sidebar-settings-panel">
        <div className="sidebar-settings-title">显示统计项</div>
        <div className="sidebar-settings-actions">
          <button type="button" onClick={() => setAll(true)}>全选</button>
          <button type="button" onClick={() => setAll(false)}>清空</button>
        </div>
        {SIDEBAR_STAT_OPTIONS.map(({ key, label }) => (
          <label key={key} className="sidebar-setting-option">
            <input
              type="checkbox"
              checked={visibility[key]}
              onChange={(event) => onChange({ ...visibility, [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </details>
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
