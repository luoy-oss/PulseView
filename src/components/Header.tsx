import { useRef, useCallback } from 'react';
import { FreqPoint, FreqMode } from '../types';

interface Props {
  fileName: string;
  allFreqPts: FreqPoint[];
  freqMode: FreqMode;
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
            title="每个高电平脉冲生成一个频率点：freq = 1 / (2 × 脉宽)"
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
