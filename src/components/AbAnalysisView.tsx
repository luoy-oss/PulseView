import { useCallback, useMemo, useRef, useState } from 'react';
import { AbChannel, AccelSegment, FreqPoint } from '../types';
import { computeAbAnalysis } from '../computeAb';
import { fmtFreq, fmtTime } from '../utils';
import { ViewRange } from '../decimate';
import { FreqChart } from './FreqChart';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusBar } from './StatusBar';

interface Props {
  channels: AbChannel[];
  fileName: string;
  samplingRate: number;
  onFile: (file: File, mode?: 'normal' | 'ab') => void;
}

export function AbAnalysisView({ channels, fileName, samplingRate, onFile }: Props) {
  const [aId, setAId] = useState(channels[0]?.id || '');
  const [bId, setBId] = useState(channels[1]?.id || '');
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [viewRange, setViewRange] = useState<ViewRange | null>(null);
  const [accelSegs, setAccelSegs] = useState<AccelSegment[]>([]);
  const resetZoomRef = useRef<() => void>(() => {});
  const inputRef = useRef<HTMLInputElement>(null);

  const a = channels.find((channel) => channel.id === aId) || channels[0];
  const b = channels.find((channel) => channel.id === bId) || channels[1];
  const result = useMemo(() => a && b ? computeAbAnalysis(a, b) : null, [a, b]);
  const freqPts = useMemo<FreqPoint[]>(
    () => result?.freqPoints.map((point) => ({ time: point.time, freq: point.freq })) || [],
    [result]
  );
  const aRisingEdges = useMemo(
    () => new Float64Array(Array.from(a?.transitions || []).filter((_, index) => index > 0 && a?.levels[index] === 1)),
    [a]
  );
  const duration = freqPts.length > 1 ? freqPts[freqPts.length - 1].time - freqPts[0].time : 0;

  const resetAnalysis = useCallback(() => {
    setCursorA(null);
    setCursorB(null);
    setRangeStart(null);
    setRangeEnd(null);
    setRangeMode(false);
    setViewRange(null);
    setAccelSegs([]);
  }, []);

  const setChannels = useCallback((nextA: string, nextB: string) => {
    setAId(nextA);
    setBId(nextB);
    resetAnalysis();
  }, [resetAnalysis]);

  const handleCursor = useCallback((which: 'A' | 'B', index: number | null) => {
    if (which === 'A') setCursorA(index);
    else setCursorB(index);
  }, []);

  const clearRange = useCallback(() => {
    setRangeStart(null);
    setRangeEnd(null);
    setRangeMode(false);
  }, []);

  return (
    <div className="app-root ab-analysis-root">
      <header className="app-header">
        <div className="header-l">
          <div className="logo-mark">⚡</div>
          <span className="title">PulseView · AB 相分析</span>
          <span className="fname">{fileName}</span>
        </div>
        <div className="header-r">
          <div className="freq-mode-group ab-channel-group">
            <label className="ctrl-label" htmlFor="ab-a-channel">A 相</label>
            <select
              id="ab-a-channel"
              value={aId}
              onChange={(e) => {
                const nextA = e.target.value;
                setChannels(nextA, nextA === bId ? channels.find((c) => c.id !== nextA)?.id || '' : bId);
              }}
            >
              {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} [{channel.id}]</option>)}
            </select>
            <label className="ctrl-label" htmlFor="ab-b-channel">B 相</label>
            <select id="ab-b-channel" value={bId} onChange={(e) => setChannels(aId, e.target.value)}>
              {channels.map((channel) => <option key={channel.id} value={channel.id} disabled={channel.id === aId}>{channel.name} [{channel.id}]</option>)}
            </select>
          </div>
          <button className={`btn ${rangeMode ? 'btn-p' : ''}`} onClick={() => setRangeMode((enabled) => !enabled)}>{rangeMode ? '取消框选' : '框选范围'}</button>
          <button className="btn" onClick={() => resetZoomRef.current()}>重置视图</button>
          <button className="btn" onClick={() => inputRef.current?.click()}>打开 AB 文件</button>
          <button className="btn" onClick={() => window.location.reload()}>返回</button>
          <input ref={inputRef} type="file" accept=".vcd" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file, 'ab'); e.currentTarget.value = ''; }} />
        </div>
      </header>
      {a && b && result && (
        <>
          <div className="ab-info-strip">
            <span>A: {a.name} [{a.id}]</span>
            <span>B: {b.name} [{b.id}]</span>
            <span>A 脉冲 {result.aPulses.toLocaleString()}</span>
            <span>B 脉冲 {result.bPulses.toLocaleString()}</span>
            <span className="positive">正向 {result.forwardCycles.toLocaleString()}</span>
            <span className="negative">反向 {result.reverseCycles.toLocaleString()}</span>
            <span>平均周期 {fmtTime(result.meanPeriod)}</span>
            <span>相位差 {fmtTime(result.meanPhase)}</span>
            <span className={result.invalidTransitions ? 'negative' : 'positive'}>非法跳变 {result.invalidTransitions.toLocaleString()}</span>
          </div>
          <div className="chart-area ab-chart-area">
            <FreqChart
              freqPts={freqPts}
              allFreqPts={freqPts}
              freqMode="falling"
              cursorA={cursorA}
              cursorB={cursorB}
              rangeMode={rangeMode}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              accelSegs={accelSegs}
              viewRange={viewRange}
              onViewRangeChange={setViewRange}
              onCursorChange={handleCursor}
              onRangeModeChange={setRangeMode}
              onRangeChange={(start, end) => { setRangeStart(start); setRangeEnd(end); }}
              onClearRange={clearRange}
              resetZoomRef={resetZoomRef}
            />
            <AnalysisPanel
              allFreqPts={freqPts}
              freqPts={freqPts}
              cursorA={cursorA}
              cursorB={cursorB}
              accelSegs={accelSegs}
              risingEdges={aRisingEdges}
              onAccelDetect={setAccelSegs}
              onCursorChange={handleCursor}
            />
          </div>
        </>
      )}
      <StatusBar left={`AB 解码完成 · ${freqPts.length.toLocaleString()} 带符号频率点 · 左键 A / Ctrl+左键 B`} right={`${fmtFreq(samplingRate)} · ${fmtTime(duration)}`} />
    </div>
  );
}
