import { useCallback, useMemo, useRef, useState } from 'react';
import { AbChannel, AccelSegment, CursorMarker, DirectionMapping, EdgeBase, EncoderMode, FreqMode, FreqPoint, SidebarStatVisibility } from '../types';
import { computeAbAnalysis } from '../computeAb';
import { computeDirectionAnalysis, computeDirectionPulsePoints, DIRECTION_PRESETS, suggestDirectionChannels } from '../computeDirection';
import { fmtFreq, fmtTime } from '../utils';
import { ViewRange } from '../decimate';
import { FreqChart } from './FreqChart';
import { AnalysisPanel } from './AnalysisPanel';
import { StatusBar } from './StatusBar';
import { ThemeId } from '../theme';
import { ThemeSwitcher } from './ThemeSwitcher';
import { Sidebar } from './Sidebar';
import { DerivView, DerivChartKey } from './DerivView';

interface Props {
  channels: AbChannel[];
  fileName: string;
  samplingRate: number;
  initialMode?: EncoderMode;
  onFile: (file: File, mode?: 'normal' | 'ab' | 'direction') => void;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  sidebarStats: SidebarStatVisibility;
  onSidebarStatsChange: (visibility: SidebarStatVisibility) => void;
}

export function AbAnalysisView({ channels, fileName, samplingRate, initialMode = 'ab', onFile, theme, onThemeChange, sidebarStats, onSidebarStatsChange }: Props) {
  const suggestion = useMemo(() => suggestDirectionChannels(channels), [channels]);
  const [mode, setMode] = useState<EncoderMode>(initialMode);
  const [aId, setAId] = useState(channels[0]?.id || '');
  const [bId, setBId] = useState(channels[1]?.id || '');
  const [pulseId, setPulseId] = useState(suggestion?.pulse.id || channels[0]?.id || '');
  const [directionId, setDirectionId] = useState(suggestion?.direction.id || channels[1]?.id || '');
  const [pulseLevel, setPulseLevel] = useState<0 | 1>(1);
  const [freqMode, setFreqMode] = useState<FreqMode>('rising');
  const [dutyCorrect, setDutyCorrect] = useState(false);
  const [edgeBase, setEdgeBase] = useState<EdgeBase>('rising');
  const [mapping, setMapping] = useState<DirectionMapping>(DIRECTION_PRESETS[0]);
  const [cursorA, setCursorA] = useState<number | null>(null);
  const [cursorB, setCursorB] = useState<number | null>(null);
  const [cursorMarkers, setCursorMarkers] = useState<CursorMarker[]>([
    { id: 'cursor-1', label: 'A', index: null, color: 'var(--teal)' },
    { id: 'cursor-2', label: 'B', index: null, color: 'var(--green)' },
  ]);
  const [activeCursorId, setActiveCursorId] = useState('cursor-1');
  const [cursorPair, setCursorPair] = useState<[string, string]>(['cursor-1', 'cursor-2']);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [rangeEnd, setRangeEnd] = useState<number | null>(null);
  const [viewRange, setViewRange] = useState<ViewRange | null>(null);
  const [accelSegs, setAccelSegs] = useState<AccelSegment[]>([]);
  const [showDerivs, setShowDerivs] = useState(false);
  const [showFreqChart, setShowFreqChart] = useState(true);
  const [showAccelChart, setShowAccelChart] = useState(false);
  const resetZoomRef = useRef<() => void>(() => {});
  const inputRef = useRef<HTMLInputElement>(null);

  const a = channels.find((channel) => channel.id === aId) || channels[0];
  const b = channels.find((channel) => channel.id === bId) || channels[1];
  const pulse = channels.find((channel) => channel.id === pulseId) || channels[0];
  const direction = channels.find((channel) => channel.id === directionId) || channels[1];
  const statsChannel = mode === 'direction' ? pulse : a;
  const abResult = useMemo(() => a && b ? computeAbAnalysis(a, b) : null, [a, b]);
  const directionResult = useMemo(
    () => pulse && direction && pulse.id !== direction.id ? computeDirectionAnalysis(pulse, direction, mapping, pulseLevel, freqMode, dutyCorrect, edgeBase) : null,
    [pulse, direction, mapping, pulseLevel, freqMode, dutyCorrect, edgeBase]
  );
  const result = mode === 'ab' ? abResult : directionResult;
  const freqPts = useMemo<FreqPoint[]>(
    () => mode === 'direction' && pulse && direction
      ? computeDirectionPulsePoints(pulse, direction, mapping, pulseLevel, freqMode, dutyCorrect, edgeBase)
      : result?.freqPoints.map((point) => ({ time: point.time, freq: point.freq })) || [],
    [result, mode, pulse, direction, mapping, pulseLevel, freqMode, dutyCorrect, edgeBase]
  );
  const aRisingEdges = useMemo(
    () => mode === 'ab'
      ? new Float64Array(Array.from(a?.transitions || []).filter((_, index) => index > 0 && a?.levels[index] === 1))
      : new Float64Array(Array.from(pulse?.transitions || []).filter((_, index) => index > 0 && pulse?.levels[index] === pulseLevel)),
    [a, mode, pulse, pulseLevel]
  );
  const duration = freqPts.length > 1 ? freqPts[freqPts.length - 1].time - freqPts[0].time : 0;
  const pulseRisingCount = statsChannel ? Array.from(statsChannel.levels).filter((level, index) => index > 0 && level === pulseLevel && statsChannel.levels[index - 1] !== pulseLevel).length : 0;
  const pulseFallingLevel = pulseLevel === 1 ? 0 : 1;
  const pulseFallingCount = statsChannel ? Array.from(statsChannel.levels).filter((level, index) => index > 0 && level === pulseFallingLevel && statsChannel.levels[index - 1] !== pulseFallingLevel).length : 0;
  const pulseCount = mode === 'direction' ? directionResult?.pulseEdges ?? pulseRisingCount : abResult?.aPulses ?? pulseRisingCount;
  const pulseDuration = statsChannel && statsChannel.transitions.length > 1
    ? statsChannel.transitions[statsChannel.transitions.length - 1] - statsChannel.transitions[0]
    : duration;

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

  const toggleChart = useCallback((key: DerivChartKey) => {
    if (key === 'freq') setShowFreqChart((value) => !value);
    if (key === 'accel') setShowAccelChart((value) => !value);
  }, []);

  const toggleDerivView = useCallback(() => {
    setShowDerivs((enabled) => {
      const next = !enabled;
      if (next) {
        setShowFreqChart(true);
        setShowAccelChart(true);
      }
      return next;
    });
  }, []);

  const handleExport = useCallback(() => {
    if (!freqPts.length) return;
    const rows = mode === 'direction'
      ? ['time_s,frequency_hz,direction', ...freqPts.map((point) => `${point.time.toPrecision(10)},${point.freq.toPrecision(10)},${point.freq >= 0 ? 'forward' : 'reverse'}`)]
      : ['time_s,frequency_hz', ...freqPts.map((point) => `${point.time.toPrecision(10)},${point.freq.toPrecision(10)}`)];
    const csv = rows.join('\n') + '\n';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = 'direction_frequency_data.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }, [freqPts]);

  return (
    <div className="app-root ab-analysis-root">
      <header className="app-header">
        <div className="header-l">
          <div className="logo-mark">⚡</div>
          <span className="title">PulseView · {mode === 'direction' ? '脉冲 + 方向分析' : 'AB 相分析'}</span>
          <span className="fname">{fileName}</span>
        </div>
        <div className="header-r">
          <ThemeSwitcher theme={theme} onChange={onThemeChange} compact />
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
              <label className="ctrl-label" htmlFor="direction-freq-mode">频率</label>
              <select id="direction-freq-mode" value={freqMode} onChange={(e) => { setFreqMode(e.target.value as FreqMode); resetAnalysis(); }}>
                <option value="pulse">脉宽</option><option value="rising">上升沿</option><option value="falling">下降沿</option>
              </select>
              <label><input type="checkbox" checked={dutyCorrect} onChange={(e) => setDutyCorrect(e.target.checked)} /> 占空比修正</label>
              <label className="ctrl-label" htmlFor="direction-edge-base">基准</label>
              <select id="direction-edge-base" value={edgeBase} onChange={(e) => setEdgeBase(e.target.value as EdgeBase)}><option value="rising">上升沿</option><option value="falling">下降沿</option></select>
            </>}
          </div>
          <button className={`btn ${rangeMode ? 'btn-p' : ''}`} onClick={() => setRangeMode((enabled) => !enabled)}>{rangeMode ? '取消框选' : '框选范围'}</button>
          <button className={`btn ${showDerivs ? 'btn-p' : ''}`} title="同步显示频率与加速度图" onClick={toggleDerivView}>导数视图</button>
          <button className="btn" onClick={() => resetZoomRef.current()}>重置视图</button>
          <button className="btn" onClick={handleExport} disabled={!freqPts.length}>导出 CSV</button>
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
            <span>未知方向 {directionResult.unknownCycles.toLocaleString()}</span><span>平均周期 {fmtTime(directionResult.meanPeriod)}</span><span>方向延时 {fmtTime(directionResult.meanDelay)}</span>
          </div> : null}
          <div className="main-layout ab-main-layout">
            <Sidebar
              samplingRate={samplingRate}
              pulseCount={pulseCount}
              risingCount={pulseRisingCount}
              fallingCount={pulseFallingCount}
              duration={pulseDuration}
              allFreqPts={freqPts}
              lowGapMode={false}
              visibility={sidebarStats}
              onVisibilityChange={onSidebarStatsChange}
            />
            <div className="chart-area ab-chart-area">
            {showDerivs ? <DerivView
              freqPts={freqPts}
              allFreqPts={freqPts}
              freqMode="falling"
              cursorA={cursorA}
              cursorB={cursorB}
              rangeMode={rangeMode}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              accelSegs={accelSegs}
              showFreqChart={showFreqChart}
              showAccelChart={showAccelChart}
              viewRange={viewRange}
              onToggleChart={toggleChart}
              onViewRangeChange={setViewRange}
              onCursorChange={handleCursor}
              cursorMarkers={cursorMarkers}
              activeCursorId={activeCursorId}
              onCursorMarkersChange={(markers, active) => { setCursorMarkers(markers); setActiveCursorId(active); }}
              onRangeModeChange={setRangeMode}
              onRangeChange={(start, end) => { setRangeStart(start); setRangeEnd(end); }}
              onClearRange={clearRange}
              resetZoomRef={resetZoomRef}
              theme={theme}
            /> : <>
            <FreqChart
              freqPts={freqPts}
              theme={theme}
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
              cursorMarkers={cursorMarkers}
              activeCursorId={activeCursorId}
              onCursorMarkersChange={(markers, active) => { setCursorMarkers(markers); setActiveCursorId(active); }}
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
              cursorMarkers={cursorMarkers}
              activeCursorId={activeCursorId}
              onCursorMarkersChange={(markers, active) => { setCursorMarkers(markers); setActiveCursorId(active); }}
              cursorPair={cursorPair}
              onCursorPairChange={setCursorPair}
              theme={theme}
            />
            </>}
            </div>
          </div>
        </>
      )}
      <StatusBar left={`${mode === 'ab' ? 'AB' : '脉冲 + 方向'} 解码完成 · ${freqPts.length.toLocaleString()} 带符号频率点 · 左键 A / Ctrl+左键 B`} right={`${fmtFreq(samplingRate)} · ${fmtTime(duration)}`} />
    </div>
  );
}
