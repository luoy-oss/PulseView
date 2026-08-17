import { useRef, useCallback } from 'react';
import { EdgeBase, FreqPoint, FreqMode } from '../types';

interface Props {
  fileName: string;
  allFreqPts: FreqPoint[];
  freqMode: FreqMode;
  dutyCorrect: boolean;
  edgeBase: EdgeBase;
  onDutyCorrectChange: (on: boolean) => void;
  onEdgeBaseChange: (base: EdgeBase) => void;
  onFreqModeChange: (mode: FreqMode) => void;
  onFile: (file: File) => void;
  onRangeModeChange: (mode: boolean) => void;
  rangeMode: boolean;
  onResetZoom: () => void;
  showDerivs: boolean;
  onToggleDerivView: () => void;
}

export function Header({
  fileName,
  allFreqPts,
  freqMode,
  dutyCorrect,
  edgeBase,
  onDutyCorrectChange,
  onEdgeBaseChange,
  onFreqModeChange,
  onFile,
  onRangeModeChange,
  rangeMode,
  onResetZoom,
  showDerivs,
  onToggleDerivView,
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
  }, [allFreqPts]);

  return (
    <header className="app-header">
      <div className="header-l">
        <div className="logo-mark">⚡</div>
        <span className="title">PulseView</span>
        <span className="fname">{fileName}</span>
      </div>
      <div className="header-r">
        <div className="freq-mode-group">
          <button
            className={`btn btn-sm ${freqMode === 'pulse' ? 'btn-p' : ''}`}
            title="每个高电平脉冲生成一个频率点：freq = 1 / (2 × 脉宽)，等价于假设占空比 50%"
            onClick={() => onFreqModeChange('pulse')}
          >
            脉冲宽度
          </button>
          <button
            className={`btn btn-sm ${freqMode === 'rising' ? 'btn-p' : ''}`}
            title="相邻两个上升沿的间隔为一个周期：freq = 1 / 周期"
            onClick={() => onFreqModeChange('rising')}
          >
            上升沿周期
          </button>
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
