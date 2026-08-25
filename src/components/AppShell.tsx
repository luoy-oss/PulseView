import { useMemo, useRef, useState } from 'react';
import { AppState, AccelSegment, CsvChannel, CursorMarker, DefaultLevel, EdgeBase, FreqMode, PulseLevel, SidebarStatVisibility } from '../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { FreqChart } from './FreqChart';
import { DerivView, DerivChartKey } from './DerivView';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusBar } from './StatusBar';
import { fmtFreq, fmtTime } from '../utils';
import { computeLowGapMarkers } from '../compute';
import { ViewRange } from '../decimate';
import { ThemeId } from '../theme';

interface Props {
  state: AppState;
  onFile: (file: File) => void;
  onFreqModeChange: (mode: FreqMode) => void;
  channels: CsvChannel[];
  activeChannelId: string | null;
  onChannelChange: (channelId: string) => void;
  onDutyCorrectChange: (on: boolean) => void;
  onEdgeBaseChange: (base: EdgeBase) => void;
  onPulseLevelChange: (pulseLevel: PulseLevel) => void;
  onDefaultLevelChange: (defaultLevel: DefaultLevel) => void;
  onLowGapToleranceChange: (enabled: boolean, pct: number) => void;
  onLowGapAnnotationChange: (enabled: boolean, threshold: number) => void;
  onAccelDetect: (segs: AccelSegment[]) => void;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
  onCursorMarkersChange: (markers: CursorMarker[], activeCursorId: string) => void;
  onCursorPairChange: (pair: [string, string]) => void;
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
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  sidebarStats: SidebarStatVisibility;
  onSidebarStatsChange: (visibility: SidebarStatVisibility) => void;
}

export function AppShell({
  state,
  onFile,
  onFreqModeChange,
  channels,
  activeChannelId,
  onChannelChange,
  onDutyCorrectChange,
  onEdgeBaseChange,
  onPulseLevelChange,
  onDefaultLevelChange,
  onLowGapToleranceChange,
  onLowGapAnnotationChange,
  onAccelDetect,
  onCursorChange,
  onCursorMarkersChange,
  onCursorPairChange,
  onRangeModeChange,
  onRangeChange,
  onClearRange,
  onToggleDerivView,
  onToggleChart,
  theme,
  onThemeChange,
  sidebarStats,
  onSidebarStatsChange,
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
      state.lowGapAnnotationEnabled,
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
        pulseLevel={state.pulseLevel}
        defaultLevel={state.defaultLevel}
        canChangeWaveformInterpretation={Boolean(state.transTimes && state.sourceTransLevels)}
        onPulseLevelChange={onPulseLevelChange}
        onDefaultLevelChange={onDefaultLevelChange}
        onLowGapToleranceChange={onLowGapToleranceChange}
        onLowGapAnnotationChange={onLowGapAnnotationChange}
        onFreqModeChange={onFreqModeChange}
        channels={channels}
        activeChannelId={activeChannelId}
        onChannelChange={onChannelChange}
        onFile={onFile}
        onRangeModeChange={onRangeModeChange}
        rangeMode={state.rangeMode}
        onResetZoom={() => resetZoomRef.current()}
        showDerivs={state.showDerivs}
        onToggleDerivView={onToggleDerivView}
        theme={theme}
        onThemeChange={onThemeChange}
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
          visibility={sidebarStats}
          onVisibilityChange={onSidebarStatsChange}
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
              viewRange={viewRange}
              onToggleChart={onToggleChart}
              onViewRangeChange={setViewRange}
              onCursorChange={onCursorChange}
              cursorMarkers={state.cursorMarkers}
              activeCursorId={state.activeCursorId}
              onCursorMarkersChange={onCursorMarkersChange}
              onRangeModeChange={onRangeModeChange}
              onRangeChange={onRangeChange}
              onClearRange={onClearRange}
              resetZoomRef={resetZoomRef}
              theme={theme}
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
              cursorMarkers={state.cursorMarkers}
              activeCursorId={state.activeCursorId}
              onCursorMarkersChange={onCursorMarkersChange}
              onRangeModeChange={onRangeModeChange}
              onRangeChange={onRangeChange}
              onClearRange={onClearRange}
              resetZoomRef={resetZoomRef}
              theme={theme}
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
              cursorMarkers={state.cursorMarkers}
              activeCursorId={state.activeCursorId}
              onCursorMarkersChange={onCursorMarkersChange}
              cursorPair={state.cursorPair}
              onCursorPairChange={onCursorPairChange}
              theme={theme}
          />
        </div>
      </div>
      <StatusBar left={statusLeft} right={statusRight} />
    </div>
  );
}
