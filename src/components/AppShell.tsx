import { useRef, useState } from 'react';
import { AppState, AccelSegment, FreqMode } from '../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { FreqChart } from './FreqChart';
import { DerivView, DerivChartKey } from './DerivView';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusBar } from './StatusBar';
import { fmtFreq, fmtTime } from '../utils';
import { ViewRange } from '../decimate';

interface Props {
  state: AppState;
  onFile: (file: File) => void;
  onFreqModeChange: (mode: FreqMode) => void;
  onDutyCorrectChange: (on: boolean) => void;
  onAccelDetect: (segs: AccelSegment[]) => void;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
  onRangeModeChange: (mode: boolean) => void;
  onRangeChange: (
    start: number | null,
    end: number | null,
    idxStart: number | null,
    idxEnd: number | null
  ) => void;
  onClearRange: () => void;
  onToggleDerivView: () => void;
  onToggleChart: (key: DerivChartKey) => void;
}

export function AppShell({
  state,
  onFile,
  onFreqModeChange,
  onDutyCorrectChange,
  onAccelDetect,
  onCursorChange,
  onRangeModeChange,
  onRangeChange,
  onClearRange,
  onToggleDerivView,
  onToggleChart,
}: Props) {
  const resetZoomRef = useRef<() => void>(() => {});
  // 共享时间轴缩放/平移范围：导数视图下三个图同步
  const [viewRange, setViewRange] = useState<ViewRange | null>(null);

  const risingCount = state.risingEdges?.length ?? 0;
  const fallingCount = state.fallingEdges?.length ?? 0;
  const dur =
    state.risingEdges && state.risingEdges.length >= 2
      ? state.risingEdges[state.risingEdges.length - 1] - state.risingEdges[0]
      : 0;

  const statusLeft = `分析完成 · ${state.allFreqPts.length.toLocaleString()} 频率点`;
  const statusRight = `${fmtFreq(state.samplingRate)} · ${fmtTime(dur)}`;

  return (
    <div className="app-root">
      <Header
        fileName={state.fileName}
        allFreqPts={state.allFreqPts}
        freqMode={state.freqMode}
        dutyCorrect={state.dutyCorrect}
        onDutyCorrectChange={onDutyCorrectChange}
        onFreqModeChange={onFreqModeChange}
        onFile={onFile}
        onRangeModeChange={onRangeModeChange}
        rangeMode={state.rangeMode}
        onResetZoom={() => resetZoomRef.current()}
        showDerivs={state.showDerivs}
        onToggleDerivView={onToggleDerivView}
      />
      <div className="main-layout">
        <Sidebar
          samplingRate={state.samplingRate}
          pulseCount={state.pulseCount}
          risingCount={risingCount}
          fallingCount={fallingCount}
          duration={dur}
          allFreqPts={state.allFreqPts}
        />
        <div className="chart-area">
          {state.showDerivs ? (
            <DerivView
              freqPts={state.freqPts}
              allFreqPts={state.allFreqPts}
              freqMode={state.freqMode}
              cursorA={state.cursorA}
              cursorB={state.cursorB}
              rangeMode={state.rangeMode}
              rangeStart={state.rangeStart}
              rangeEnd={state.rangeEnd}
              accelSegs={state.accelSegs}
              showFreqChart={state.showFreqChart}
              showAccelChart={state.showAccelChart}
              showJerkChart={state.showJerkChart}
              viewRange={viewRange}
              onToggleChart={onToggleChart}
              onViewRangeChange={setViewRange}
              onCursorChange={onCursorChange}
              onRangeModeChange={onRangeModeChange}
              onRangeChange={onRangeChange}
              onClearRange={onClearRange}
              resetZoomRef={resetZoomRef}
            />
          ) : (
            <FreqChart
              freqPts={state.freqPts}
              allFreqPts={state.allFreqPts}
              freqMode={state.freqMode}
              cursorA={state.cursorA}
              cursorB={state.cursorB}
              rangeMode={state.rangeMode}
              rangeStart={state.rangeStart}
              rangeEnd={state.rangeEnd}
              accelSegs={state.accelSegs}
              viewRange={viewRange}
              onViewRangeChange={setViewRange}
              onCursorChange={onCursorChange}
              onRangeModeChange={onRangeModeChange}
              onRangeChange={onRangeChange}
              onClearRange={onClearRange}
              resetZoomRef={resetZoomRef}
            />
          )}
          <AnalysisPanel
            allFreqPts={state.allFreqPts}
            cursorA={state.cursorA}
            cursorB={state.cursorB}
            freqPts={state.freqPts}
            accelSegs={state.accelSegs}
            risingEdges={state.risingEdges}
            onAccelDetect={onAccelDetect}
            onCursorChange={onCursorChange}
          />
        </div>
      </div>
      <StatusBar left={statusLeft} right={statusRight} />
    </div>
  );
}
