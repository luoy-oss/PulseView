import { useRef } from 'react';
import { AppState, AccelSegment } from '../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { FreqChart } from './FreqChart';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusBar } from './StatusBar';
import { fmtFreq, fmtTime } from '../utils';

interface Props {
  state: AppState;
  onFile: (file: File) => void;
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
}

export function AppShell({
  state,
  onFile,
  onAccelDetect,
  onCursorChange,
  onRangeModeChange,
  onRangeChange,
  onClearRange,
}: Props) {
  const resetZoomRef = useRef<() => void>(() => {});

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
        onFile={onFile}
        onRangeModeChange={onRangeModeChange}
        rangeMode={state.rangeMode}
        onResetZoom={() => resetZoomRef.current()}
      />
      <div className="main-layout">
        <Sidebar
          samplingRate={state.samplingRate}
          risingCount={risingCount}
          fallingCount={fallingCount}
          duration={dur}
          allFreqPts={state.allFreqPts}
        />
        <div className="chart-area">
          <FreqChart
            freqPts={state.freqPts}
            allFreqPts={state.allFreqPts}
            cursorA={state.cursorA}
            cursorB={state.cursorB}
            rangeMode={state.rangeMode}
            rangeStart={state.rangeStart}
            rangeEnd={state.rangeEnd}
            accelSegs={state.accelSegs}
            onCursorChange={onCursorChange}
            onRangeModeChange={onRangeModeChange}
            onRangeChange={onRangeChange}
            onClearRange={onClearRange}
            resetZoomRef={resetZoomRef}
          />
          <AnalysisPanel
            allFreqPts={state.allFreqPts}
            cursorA={state.cursorA}
            cursorB={state.cursorB}
            freqPts={state.freqPts}
            accelSegs={state.accelSegs}
            onAccelDetect={onAccelDetect}
            onCursorChange={onCursorChange}
          />
        </div>
      </div>
      <StatusBar left={statusLeft} right={statusRight} />
    </div>
  );
}
