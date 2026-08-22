import { useCallback, useMemo, useRef, useState } from 'react';
import { AbChannel, AccelSegment, DirectionMapping, EncoderMode, FreqPoint } from '../types';
import { computeAbAnalysis } from '../computeAb';
import { computeDirectionAnalysis, DIRECTION_PRESETS, suggestDirectionChannels } from '../computeDirection';
import { fmtFreq, fmtTime } from '../utils';
import { ViewRange } from '../decimate';
import { FreqChart } from './FreqChart';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusBar } from './StatusBar';

interface Props {
  channels: AbChannel[];
  fileName: string;
  samplingRate: number;
  initialMode?: EncoderMode;
  onFile: (file: File, mode?: 'normal' | 'ab' | 'direction') => void;
}

export function AbAnalysisView({ channels, fileName, samplingRate, initialMode = 'ab', onFile }: Props) {
  const suggestion = useMemo(() => suggestDirectionChannels(channels), [channels]);
  const [mode, setMode] = useState<EncoderMode>(initialMode);
  const [aId, setAId] = useState(channels[0]?.id || '');
  const [bId, setBId] = useState(channels[1]?.id || '');
  const [pulseId, setPulseId] = useState(suggestion?.pulse.id || channels[0]?.id || '');
  const [directionId, setDirectionId] = useState(suggestion?.direction.id || channels[1]?.id || '');
  const [pulseLevel, setPulseLevel] = useState<0 | 1>(1);
  const [mapping, setMapping] = useState<DirectionMapping>(DIRECTION_PRESETS[0]);
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
  const pulse = channels.find((channel) => channel.id === pulseId) || channels[0];
  const direction = channels.find((channel) => channel.id === directionId) || channels[1];
  const abResult = useMemo(() => a && b ? computeAbAnalysis(a, b) : null, [a, b]);
  const directionResult = useMemo(
    () => pulse && direction && pulse.id !== direction.id ? computeDirectionAnalysis(pulse, direction, mapping, pulseLevel) : null,
    [pulse, direction, mapping, pulseLevel]
  );
  const result = mode === 'ab' ? abResult : directionResult;
  const freqPts = useMemo<FreqPoint[]>(
    () => result?.freqPoints.map((point) => ({ time: point.time, freq: point.freq })) || [],
    [result]
  );
  const aRisingEdges = useMemo(
    () => mode === 'ab'
      ? new Float64Array(Array.from(a?.transitions || []).filter((_, index) => index > 0 && a?.levels[index] === 1))
      : new Float64Array(Array.from(pulse?.transitions || []).filter((_, index) => index > 0 && pulse?.levels[index] === pulseLevel)),
    [a, mode, pulse, pulseLevel]
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

  const setDirectionChannels = useCallback((nextPulse: string, nextDirection: string) => {
    setPulseId(nextPulse);
    setDirectionId(nextDirection);
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
            <label className="ctrl-label" htmlFor="encoder-mode">解码</label>
            <select id="encoder-mode" value={mode} onChange={(e) => { setMode(e.target.value as EncoderMode); resetAnalysis(); }}>
              <option value="ab">AB 相</option>
              <option value="direction">脉冲 + 方向</option>
            </select>
            {mode === 'ab' ? <>
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
            </> : <>
              <label className="ctrl-label" htmlFor="direction-pulse-channel">脉冲源</label>
              <select id="direction-pulse-channel" value={pulseId} onChange={(e) => setDirectionChannels(e.target.value, e.target.value === directionId ? channels.find((c) => c.id !== e.target.value)?.id || '' : directionId)}>
                {channels.map((channel) => <option key={channel.id} value={channel.id} disabled={channel.id === directionId}>{channel.name} [{channel.id}]</option>)}
              </select>
              <label className="ctrl-label" htmlFor="direction-source-channel">方向源</label>
              <select id="direction-source-channel" value={directionId} onChange={(e) => setDirectionChannels(pulseId, e.target.value)}>
                {channels.map((channel) => <option key={channel.id} value={channel.id} disabled={channel.id === pulseId}>{channel.name} [{channel.id}]</option>)}
              </select>
              <label className="ctrl-label" htmlFor="direction-map">映射</label>
              <select id="direction-map" value={mapping.preset} onChange={(e) => {
                const selected = e.target.value as DirectionMapping['preset'];
                const preset = DIRECTION_PRESETS.find((item) => item.preset === selected);
                if (preset) setMapping(preset);
                else setMapping({ ...mapping, preset: 'custom' });
              }}>
                <option value="idle-high-forward-low">无输出高 / 正向低</option>
                <option value="idle-low-forward-low">无输出低 / 正向低</option>
                <option value="idle-low-forward-high">无输出低 / 正向高</option>
                <option value="idle-high-forward-high">无输出高 / 正向高</option>
                <option value="custom">自定义</option>
              </select>
              {mapping.preset === 'custom' && <>
                <label className="ctrl-label" htmlFor="direction-forward-level">正向</label>
                <select id="direction-forward-level" value={mapping.forwardLevel} onChange={(e) => setMapping({ ...mapping, forwardLevel: Number(e.target.value) as 0 | 1 })}>
                  <option value="0">低电平</option><option value="1">高电平</option>
                </select>
              </>}
              <label className="ctrl-label" htmlFor="pulse-level">脉冲</label>
              <select id="pulse-level" value={pulseLevel} onChange={(e) => { setPulseLevel(Number(e.target.value) as 0 | 1); resetAnalysis(); }}>
                <option value="1">高电平</option><option value="0">低电平</option>
              </select>
            </>}
          </div>
          <button className={`btn ${rangeMode ? 'btn-p' : ''}`} onClick={() => setRangeMode((enabled) => !enabled)}>{rangeMode ? '取消框选' : '框选范围'}</button>
          <button className="btn" onClick={() => resetZoomRef.current()}>重置视图</button>
          <button className="btn" onClick={() => inputRef.current?.click()}>打开编码器文件</button>
          <button className="btn" onClick={() => window.location.reload()}>返回</button>
          <input ref={inputRef} type="file" accept=".vcd" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file, mode === 'direction' ? 'direction' : 'ab'); e.currentTarget.value = ''; }} />
        </div>
      </header>
      {((mode === 'ab' && a && b && abResult) || (mode === 'direction' && pulse && direction && directionResult)) && (
        <>
          {mode === 'ab' && abResult ? <div className="ab-info-strip">
            <span>A: {a!.name} [{a!.id}]</span><span>B: {b!.name} [{b!.id}]</span>
            <span>A 脉冲 {abResult.aPulses.toLocaleString()}</span><span>B 脉冲 {abResult.bPulses.toLocaleString()}</span>
            <span className="positive">正向 {abResult.forwardCycles.toLocaleString()}</span><span className="negative">反向 {abResult.reverseCycles.toLocaleString()}</span>
            <span>平均周期 {fmtTime(abResult.meanPeriod)}</span><span>相位差 {fmtTime(abResult.meanPhase)}</span>
            <span className={abResult.invalidTransitions ? 'negative' : 'positive'}>非法跳变 {abResult.invalidTransitions.toLocaleString()}</span>
          </div> : directionResult ? <div className="ab-info-strip">
            <span>脉冲: {pulse!.name} [{pulse!.id}]</span><span>方向: {direction!.name} [{direction!.id}]</span>
            <span className="positive">正向 {directionResult.forwardCycles.toLocaleString()}</span><span className="negative">反向 {directionResult.reverseCycles.toLocaleString()}</span>
            <span>未知方向 {directionResult.unknownCycles.toLocaleString()}</span><span>平均周期 {fmtTime(directionResult.meanPeriod)}</span>
          </div> : null}
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
      <StatusBar left={`${mode === 'ab' ? 'AB' : '脉冲 + 方向'} 解码完成 · ${freqPts.length.toLocaleString()} 带符号频率点 · 左键 A / Ctrl+左键 B`} right={`${fmtFreq(samplingRate)} · ${fmtTime(duration)}`} />
    </div>
  );
}
