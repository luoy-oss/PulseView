import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AccelAlgorithm, AccelOptions, CursorMarker, FreqPoint, AccelSegment, FreqMode, LowGapMarker } from '../types';
import { FreqChart } from './FreqChart';
import { DerivSeriesChart } from './DerivSeriesChart';
import { computeAcceleration, DEFAULT_ACCEL_OPTIONS } from '../acceleration';
import { fmtRate } from '../utils';
import { ViewRange } from '../decimate';
import { ThemeId, THEME_COLORS } from '../theme';

export type DerivChartKey = 'freq' | 'accel';

interface Props {
  freqPts: FreqPoint[];
  allFreqPts: FreqPoint[];
  freqMode: FreqMode;
  cursorA: number | null;
  cursorB: number | null;
  rangeMode: boolean;
  rangeStart: number | null;
  rangeEnd: number | null;
  accelSegs: AccelSegment[];
  lowGapMarkers?: LowGapMarker[];
  showFreqChart: boolean;
  showAccelChart: boolean;
  viewRange: ViewRange | null;
  onToggleChart: (key: DerivChartKey) => void;
  onViewRangeChange: (r: ViewRange | null) => void;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
  cursorMarkers?: CursorMarker[];
  activeCursorId?: string;
  onCursorMarkersChange?: (markers: CursorMarker[], activeCursorId: string) => void;
  onRangeModeChange: (mode: boolean) => void;
  onRangeChange: (
    start: number | null,
    end: number | null,
    idxStart: number | null,
    idxEnd: number | null
  ) => void;
  onClearRange: () => void;
  resetZoomRef?: React.MutableRefObject<() => void>;
  theme: ThemeId;
}

// 导数视图：垂直堆叠显示频率与加速度两个图，
// 共享时间轴缩放、平移与光标；每张图可单独关闭。
export function DerivView({
  freqPts,
  allFreqPts,
  freqMode,
  cursorA,
  cursorB,
  rangeMode,
  rangeStart,
  rangeEnd,
  accelSegs,
  lowGapMarkers = [],
  showFreqChart,
  showAccelChart,
  viewRange,
  onToggleChart,
  onViewRangeChange,
  onCursorChange,
  cursorMarkers = [],
  activeCursorId = 'cursor-1',
  onCursorMarkersChange,
  onRangeModeChange,
  onRangeChange,
  onClearRange,
  resetZoomRef,
  theme,
}: Props) {
  const colors = THEME_COLORS[theme];
  const [accelOptions, setAccelOptions] = useState<AccelOptions>(DEFAULT_ACCEL_OPTIONS);
  // 由频率-时间曲线派生的加速度曲线。
  const accel = useMemo(
    () => computeAcceleration(allFreqPts, accelOptions),
    [allFreqPts, accelOptions]
  );

  const updateAccelOption = useCallback(<K extends keyof AccelOptions>(key: K, value: AccelOptions[K]) => {
    setAccelOptions((previous) => ({ ...previous, [key]: value }));
  }, []);

  // 数据变化（重新载入文件 / 切换频率模式）时重置共享视图
  useEffect(() => {
    onViewRangeChange(null);
  }, [allFreqPts]);

  // 组合所有子图的 resetZoom，供 Header"重置视图"调用
  const resetFns = useRef<Record<string, () => void>>({});
  const registerReset = useCallback(
    (key: DerivChartKey) => (fn: () => void) => {
      resetFns.current[key] = fn;
    },
    []
  );
  const registerFreqReset = useMemo(
    () => registerReset('freq'),
    [registerReset]
  );
  const registerAccelReset = useMemo(
    () => registerReset('accel'),
    [registerReset]
  );

  useEffect(() => {
    if (!resetZoomRef) return;
    resetZoomRef.current = () => {
      Object.values(resetFns.current).forEach((fn) => fn());
      onViewRangeChange(null);
    };
  }, [resetZoomRef, onViewRangeChange]);

  const anyVisible = showFreqChart || showAccelChart;

  return (
    <div className="deriv-view">
      {showFreqChart && (
        <div className="deriv-panel">
          <div className="deriv-panel-head">
            <span className="deriv-title">
              <span className="deriv-dot freq" />
              频率
            </span>
            <button
              className="deriv-close"
              title="关闭频率图"
              onClick={() => onToggleChart('freq')}
            >
              ×
            </button>
          </div>
          <FreqChart
            freqPts={freqPts}
            allFreqPts={allFreqPts}
            freqMode={freqMode}
            cursorA={cursorA}
            cursorB={cursorB}
            rangeMode={rangeMode}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            accelSegs={accelSegs}
            lowGapMarkers={lowGapMarkers}
            viewRange={viewRange}
            onViewRangeChange={onViewRangeChange}
            onCursorChange={onCursorChange}
            cursorMarkers={cursorMarkers}
            activeCursorId={activeCursorId}
            onCursorMarkersChange={onCursorMarkersChange}
            onRangeModeChange={onRangeModeChange}
            onRangeChange={onRangeChange}
            onClearRange={onClearRange}
            onResetZoomReady={registerFreqReset}
            showToolbar={false}
            theme={theme}
          />
        </div>
      )}

      {showAccelChart && (
        <div className="deriv-panel">
          <div className="deriv-panel-head">
            <span className="deriv-title">
              <span className="deriv-dot accel" />
              加速度（频率变化率）
            </span>
            {accelOptions.algorithm === 'raw' && (
              <span className="accel-warning">不滤波状态下，加速度可能因波形抖动而产生剧烈变化</span>
            )}
            <button
              className="deriv-close"
              title="关闭加速度图"
              onClick={() => onToggleChart('accel')}
            >
              ×
            </button>
          </div>
          <div className="accel-chart-controls">
            <label>
              算法
              <select value={accelOptions.algorithm} onChange={(event) => updateAccelOption('algorithm', event.target.value as AccelAlgorithm)}>
                <option value="raw">不滤波 + 中心差分</option>
                <option value="sg">SG 平滑 + 中心差分</option>
                <option value="fft">FFT 低通 + 中心差分</option>
                <option value="kalman">卡尔曼状态估计</option>
                <option value="td">跟踪微分器 TD</option>
              </select>
            </label>
            {accelOptions.algorithm === 'sg' && <label>
              窗口 <input type="number" min="3" max="101" step="2" value={accelOptions.sgWindow} onChange={(event) => updateAccelOption('sgWindow', Math.max(3, Math.min(101, Number(event.target.value) || 3)))} /> 点
            </label>}
            {accelOptions.algorithm === 'fft' && <label>
              截止 <input type="number" min="0" step="0.1" value={accelOptions.fftCutoffHz} onChange={(event) => updateAccelOption('fftCutoffHz', Math.max(0, Number(event.target.value) || 0))} /> Hz
            </label>}
            {accelOptions.algorithm === 'kalman' && <>
              <label>过程噪声 <input type="number" min="0.000001" step="1" value={accelOptions.kalmanProcessNoise} onChange={(event) => updateAccelOption('kalmanProcessNoise', Math.max(0.000001, Number(event.target.value) || 0.000001))} /></label>
              <label>测量噪声 <input type="number" min="0.000001" step="0.1" value={accelOptions.kalmanMeasurementNoise} onChange={(event) => updateAccelOption('kalmanMeasurementNoise', Math.max(0.000001, Number(event.target.value) || 0.000001))} /></label>
            </>}
            {accelOptions.algorithm === 'td' && <label>
              响应带宽 <input type="number" min="0.1" max="10000" step="1" value={accelOptions.tdBandwidth} onChange={(event) => updateAccelOption('tdBandwidth', Math.max(0.1, Math.min(10000, Number(event.target.value) || 0.1)))} /> s^-1
            </label>}
            <span className="accel-chart-hint">{accelOptions.algorithm === 'raw' ? '直接反映原始波形变化' : accelOptions.algorithm === 'sg' ? '保留峰值，适合平滑分析' : accelOptions.algorithm === 'fft' ? '离线低通，平滑最强' : accelOptions.algorithm === 'kalman' ? '根据噪声模型平滑估计' : '低延迟动态跟踪'}</span>
          </div>
          <DerivSeriesChart
            pts={accel}
            color={colors.green}
            yTitle="加速度"
            viewRange={viewRange}
            onViewRangeChange={onViewRangeChange}
            onResetZoomReady={registerAccelReset}
            cursorA={cursorA}
            cursorB={cursorB}
            onCursorChange={onCursorChange}
            formatValue={fmtRate}
            theme={theme}
          />
        </div>
      )}

      {!anyVisible && (
        <div className="deriv-empty">
          所有图表已关闭，点击顶部"导数视图"按钮重新开启
        </div>
      )}
    </div>
  );
}
