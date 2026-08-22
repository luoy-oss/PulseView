import { useRef, useCallback } from 'react';
import { DefaultLevel, EdgeBase, FreqPoint, FreqMode, PulseLevel } from '../types';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ThemeId } from '../theme';

interface Props {
  fileName: string;
  allFreqPts: FreqPoint[];
  freqMode: FreqMode;
  dutyCorrect: boolean;
  edgeBase: EdgeBase;
  pulseLevel: PulseLevel;
  defaultLevel: DefaultLevel;
  canChangeWaveformInterpretation: boolean;
  lowGapToleranceEnabled: boolean;
  lowGapTolerancePct: number;
  canComputeLowGap: boolean;
  lowGapAnnotationEnabled: boolean;
  lowGapThreshold: number;
  onDutyCorrectChange: (on: boolean) => void;
  onEdgeBaseChange: (base: EdgeBase) => void;
  onPulseLevelChange: (pulseLevel: PulseLevel) => void;
  onDefaultLevelChange: (defaultLevel: DefaultLevel) => void;
  onLowGapToleranceChange: (enabled: boolean, pct: number) => void;
  onLowGapAnnotationChange: (enabled: boolean, threshold: number) => void;
  onFreqModeChange: (mode: FreqMode) => void;
  onFile: (file: File) => void;
  onRangeModeChange: (mode: boolean) => void;
  rangeMode: boolean;
  onResetZoom: () => void;
  showDerivs: boolean;
  onToggleDerivView: () => void;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
}

export function Header({
  fileName,
  allFreqPts,
  freqMode,
  dutyCorrect,
  edgeBase,
  pulseLevel,
  defaultLevel,
  canChangeWaveformInterpretation,
  lowGapToleranceEnabled,
  lowGapTolerancePct,
  canComputeLowGap,
  lowGapAnnotationEnabled,
  lowGapThreshold,
  onDutyCorrectChange,
  onEdgeBaseChange,
  onPulseLevelChange,
  onDefaultLevelChange,
  onLowGapToleranceChange,
  onLowGapAnnotationChange,
  onFreqModeChange,
  onFile,
  onRangeModeChange,
  rangeMode,
  onResetZoom,
  showDerivs,
  onToggleDerivView,
  theme,
  onThemeChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const handleExport = useCallback(() => {
    if (!allFreqPts.length) return;
    const parts: string[] = ['time_s,frequency_hz\n'];
    for (const p of allFreqPts) {
      parts.push(p.time.toPrecision(10) + ',' + p.freq.toPrecision(10) + '\n');
    }
    const blob = new Blob(parts, { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'frequency_data_full.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [allFreqPts, freqMode]);

  return (
    <header className="app-header">
      <div className="header-l">
        <div className="logo-mark">⚡</div>
        <span className="title">PulseView</span>
        <span className="fname">{fileName}</span>
      </div>
      <div className="header-r">
        <ThemeSwitcher theme={theme} onChange={onThemeChange} compact />
        <div className="freq-mode-group">
          <button
            className={`btn btn-sm ${freqMode === 'pulse' ? 'btn-p' : ''}`}
            title="每个高电平脉冲生成一个频率点：freq = 1 / (2 × 脉宽)，等价于假设占空比 50%"
            onClick={() => onFreqModeChange('pulse')}
          >
            脉冲宽度
          </button>
          <span className="btn btn-sm edge-base-label" title="选择哪种电平段作为频率脉冲">
            脉冲
          </span>
          <button
            className={`btn btn-sm ${pulseLevel === 'high' ? 'btn-p' : ''}`}
            disabled={!canChangeWaveformInterpretation}
            title="将高电平段作为待分析的脉冲"
            onClick={() => onPulseLevelChange('high')}
          >
            高电平脉冲
          </button>
          <button
            className={`btn btn-sm ${pulseLevel === 'low' ? 'btn-p' : ''}`}
            disabled={!canChangeWaveformInterpretation}
            title="将低电平段作为待分析的脉冲"
            onClick={() => onPulseLevelChange('low')}
          >
            低电平脉冲
          </button>
          <span className="btn btn-sm edge-base-label" title="采集开始和结束时信号保持的静止电平；首条电平会自动预选">
            默认
          </span>
          <button className={`btn btn-sm ${defaultLevel === 0 ? 'btn-p' : ''}`} disabled={!canChangeWaveformInterpretation} onClick={() => onDefaultLevelChange(0)}>默认低电平</button>
          <button className={`btn btn-sm ${defaultLevel === 1 ? 'btn-p' : ''}`} disabled={!canChangeWaveformInterpretation} onClick={() => onDefaultLevelChange(1)}>默认高电平</button>
          <button
            className={`btn btn-sm ${freqMode === 'rising' ? 'btn-p' : ''}`}
            title="相邻两个上升沿的间隔为一个周期：freq = 1 / 周期"
            onClick={() => onFreqModeChange('rising')}
          >
            按上升沿
          </button>
          <button
            className={`btn btn-sm ${freqMode === 'falling' ? 'btn-p' : ''}`}
            title="以相邻两个下降沿为周期边界：freq = 1 / 下降沿间隔（默认，适合以有效上升沿开始具体时间的数据），时间点取两下降沿中点，首个脉冲以上升沿为时间起点并默认 50% 占空比"
            onClick={() => onFreqModeChange('falling')}
          >
            按下降沿
          </button>
          <button
            className={`btn btn-sm ${lowGapAnnotationEnabled ? 'btn-p' : ''}`}
            title={canComputeLowGap
              ? '测试标注：在原始频率图上标出低电平间隔。默认阈值 1ms，最小支持 900μs；仅适用于稳定 50% 占空比、每周期单一高电平脉冲。'
              : '当前 PWM 测量直通数据不包含原始边沿，无法标注低电平间隔。'}
            disabled={!canComputeLowGap}
            onClick={() => onLowGapAnnotationChange(!lowGapAnnotationEnabled, lowGapThreshold)}
          >
            低电平间隔标注（测试）
          </button>
          {lowGapAnnotationEnabled && (
            <label
              className="btn btn-sm"
              title="标注阈值：默认 1ms，允许的最小值为 900μs。只有达到此阈值的低电平间隔才会在原始频率图上标注。"
            >
              <input
                className="low-gap-tolerance"
                type="number"
                min="0.9"
                step="0.1"
                value={lowGapThreshold * 1000}
                aria-label="低电平间隔标注阈值（毫秒）"
                title="单位：毫秒，最小 0.9ms"
                onChange={(e) => onLowGapAnnotationChange(true, Number(e.target.value) / 1000)}
              />
              ms 起标注
            </label>
          )}
          {lowGapAnnotationEnabled && (
            <label
              className={`btn btn-sm ${lowGapToleranceEnabled ? 'btn-p' : ''}`}
              title="启用后，50% ± 容差内的占空比误差不生成低电平间隔标注；超出容差的原始间隔按阈值判断。"
            >
              <input
                type="checkbox"
                checked={lowGapToleranceEnabled}
                onChange={(e) => onLowGapToleranceChange(e.target.checked, lowGapTolerancePct)}
              />
              50% 容差
              <input
                className="low-gap-tolerance"
                type="number"
                min="0"
                step="0.0001"
                value={lowGapTolerancePct}
                aria-label="50% 占空比容差（百分点）"
                onChange={(e) => onLowGapToleranceChange(lowGapToleranceEnabled, Number(e.target.value))}
              />
              %
            </label>
          )}
          <label
            className={`btn btn-sm ${dutyCorrect ? 'btn-p' : ''}`}
            title="按实际占空比修正脉冲宽度频率：freq = 1/(2×脉宽) × (占空比/50%) = 1/周期，适合窄脉冲/占空比变化的信号；勾选后默认的 50% 占空比假设不再成立"
          >
            <input
              type="checkbox"
              checked={dutyCorrect}
              onChange={(e) => onDutyCorrectChange(e.target.checked)}
            />
            占空比修正
          </label>
          <span
            className="btn btn-sm edge-base-label"
            title="占空比与占空比修正的周期计算采用哪个边沿的相邻脉冲间隔（默认下降沿）"
          >
            基准
          </span>
          <button
            className={`btn btn-sm ${edgeBase === 'falling' ? 'btn-p' : ''}`}
            title="周期 = 相邻两脉冲下降沿间隔（默认）"
            onClick={() => onEdgeBaseChange('falling')}
          >
            下降沿
          </button>
          <button
            className={`btn btn-sm ${edgeBase === 'rising' ? 'btn-p' : ''}`}
            title="周期 = 相邻两脉冲上升沿间隔"
            onClick={() => onEdgeBaseChange('rising')}
          >
            上升沿
          </button>
        </div>
        <button
          className={`btn ${showDerivs ? 'btn-p' : ''}`}
          title="同步显示频率、加速度（频率变化率）与加加速度三个图，各图可单独关闭"
          onClick={onToggleDerivView}
        >
          导数视图
        </button>
        <button
          className={`btn ${rangeMode ? 'btn-p' : ''}`}
          onClick={() => onRangeModeChange(!rangeMode)}
        >
          {rangeMode ? '取消框选' : '框选范围'}
        </button>
        <button className="btn" onClick={onResetZoom}>
          重置视图
        </button>
        <button className="btn" onClick={handleExport}>
          导出 CSV
        </button>
        <button className="btn" onClick={() => inputRef.current?.click()}>
          打开文件
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".vcd,.txt,.csv,.sr,.bin"
          hidden
          onChange={handleFile}
        />
      </div>
    </header>
  );
}
