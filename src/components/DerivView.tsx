import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { CursorMarker, FreqPoint, AccelSegment, FreqMode, LowGapMarker } from '../types';
import { FreqChart } from './FreqChart';
import { DerivSeriesChart } from './DerivSeriesChart';
import { computeDerivatives } from '../compute';
import { fmtRate, fmtJerk } from '../utils';
import { ViewRange } from '../decimate';
import { ThemeId, THEME_COLORS } from '../theme';

export type DerivChartKey = 'freq' | 'accel' | 'jerk';

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
  showJerkChart: boolean;
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

// 导数视图：垂直堆叠显示频率 / 加速度 / 加加速度三个图，
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
  showJerkChart,
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
  // 由频率-时间曲线派生的加速度 / 加加速度曲线（点数与频率点一一对应）
  const { accel, jerk } = useMemo(
    () => computeDerivatives(allFreqPts),
    [allFreqPts]
  );

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
  const registerJerkReset = useMemo(
    () => registerReset('jerk'),
    [registerReset]
  );

  useEffect(() => {
    if (!resetZoomRef) return;
    resetZoomRef.current = () => {
      Object.values(resetFns.current).forEach((fn) => fn());
      onViewRangeChange(null);
    };
  }, [resetZoomRef, onViewRangeChange]);

  const anyVisible = showFreqChart || showAccelChart || showJerkChart;

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
            <button
              className="deriv-close"
              title="关闭加速度图"
              onClick={() => onToggleChart('accel')}
            >
              ×
            </button>
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

      {showJerkChart && (
        <div className="deriv-panel">
          <div className="deriv-panel-head">
            <span className="deriv-title">
              <span className="deriv-dot jerk" />
              加加速度（变化率的变化率）
            </span>
            <button
              className="deriv-close"
              title="关闭加加速度图"
              onClick={() => onToggleChart('jerk')}
            >
              ×
            </button>
          </div>
          <DerivSeriesChart
            pts={jerk}
            color={colors.teal}
            yTitle="加加速度"
            viewRange={viewRange}
            onViewRangeChange={onViewRangeChange}
            onResetZoomReady={registerJerkReset}
            cursorA={cursorA}
            cursorB={cursorB}
            onCursorChange={onCursorChange}
            formatValue={fmtJerk}
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
