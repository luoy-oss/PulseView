import { useMemo, useRef, useState } from 'react';
import { AppState, AccelSegment, EdgeBase, FreqMode, LogicPolarity } from '../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { FreqChart } from './FreqChart';
import { DerivView, DerivChartKey } from './DerivView';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusBar } from './StatusBar';
import { fmtFreq, fmtTime } from '../utils';
import { computeLowGapMarkers } from '../compute';
import { ViewRange } from '../decimate';

interface Props {
  state: AppState;
  onFile: (file: File) => void;
  onFreqModeChange: (mode: FreqMode) => void;
  onDutyCorrectChange: (on: boolean) => void;
  onEdgeBaseChange: (base: EdgeBase) => void;
  onLogicPolarityChange: (polarity: LogicPolarity) => void;
  onLowGapToleranceChange: (enabled: boolean, pct: number) => void;
  onLowGapAnnotationChange: (enabled: boolean, threshold: number) => void;
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
  onEdgeBaseChange,
  onLogicPolarityChange,
  onLowGapToleranceChange,
  onLowGapAnnotationChange,
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
      : state.freqPts.length >= 2
        ? state.freqPts[state.freqPts.length - 1].time - state.freqPts[0].time
        : 0;

  const lowGapMarkers = useMemo(
    () =>
      state.transTimes && state.transLevels
        ? state.lowGapAnnotationEnabled
          ? computeLowGapMarkers(
            state.transTimes,
            state.transLevels,
            state.lowGapThreshold,
            state.lowGapToleranceEnabled,
            state.lowGapTolerancePct
            )
          : []
        : [],
    [
      state.transTimes,
      state.transLevels,
      state.lowGapThreshold,
      state.lowGapToleranceEnabled,
      state.lowGapTolerancePct,
    ]
  );
  const statusLeft = `分析完成 · ${state.allFreqPts.length.toLocaleString()} 频率点`;
  const statusRight = `${fmtFreq(state.samplingRate)} · ${fmtTime(dur)}`;

  return (
    <div className="app-root">
      <Header
        fileName={state.fileName}
        allFreqPts={state.allFreqPts}
        freqMode={state.freqMode}
        dutyCorrect={state.dutyCorrect}
        edgeBase={state.edgeBase}
        lowGapToleranceEnabled={state.lowGapToleranceEnabled}
        lowGapTolerancePct={state.lowGapTolerancePct}
        canComputeLowGap={Boolean(state.transTimes && state.transLevels)}
        lowGapAnnotationEnabled={state.lowGapAnnotationEnabled}
        lowGapThreshold={state.lowGapThreshold}
        onDutyCorrectChange={onDutyCorrectChange}
        onEdgeBaseChange={onEdgeBaseChange}
        logicPolarity={state.logicPolarity}
        canChangeLogicPolarity={Boolean(state.transTimes && state.transLevels)}
        onLogicPolarityChange={onLogicPolarityChange}
        onLowGapToleranceChange={onLowGapToleranceChange}
        onLowGapAnnotationChange={onLowGapAnnotationChange}
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
          lowGapMode={false}
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
              lowGapMarkers={lowGapMarkers}
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
              lowGapMarkers={lowGapMarkers}
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
