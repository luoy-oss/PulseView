import { useState, useCallback, useRef, useEffect } from 'react';
import { UploadScreen } from './components/UploadScreen';
import { AppShell } from './components/AppShell';
import { AbChannel, AccelSegment, AppState, CsvChannel, CursorMarker, DefaultLevel, EdgeBase, FreqMode, FreqPoint, PulseLevel, SidebarStatVisibility } from './types';
import {
  computeFreqFromTransitions,
  countPulsesFromTransitions,
  deriveEdgesFromTransitions,
  invertTransitionLevels,
  computeLowGapMarkers,
  LOW_GAP_DEFAULT_THRESHOLD,
  LOW_GAP_MIN_THRESHOLD,
} from './compute';
import { detectFormat } from './utils';
import VcdWorker from './workers/vcdParser.ts?worker';
import TxtWorker from './workers/txtParser.ts?worker';
import SrWorker from './workers/srParser.ts?worker';
import SaleaeWorker from './workers/saleaeParser.ts?worker';
import { AbAnalysisView } from './components/AbAnalysisView';
import { getInitialTheme, ThemeId } from './theme';
import { disableWasm, initializeWasm } from './wasm/runtime.ts';

const initialState: AppState = {
  samplingRate: 0,
  sampleCount: 0,
  pulseCount: 0,
  risingEdges: null,
  fallingEdges: null,
  transTimes: null,
  transLevels: null,
  sourceTransLevels: null,
  allFreqPts: [],
  freqPts: [],
  cursorA: null,
  cursorB: null,
  cursorMarkers: [
    { id: 'cursor-1', label: 'A', index: null, color: 'var(--teal)' },
    { id: 'cursor-2', label: 'B', index: null, color: 'var(--green)' },
  ],
  activeCursorId: 'cursor-1',
  cursorPair: ['cursor-1', 'cursor-2'],
  accelSegs: [],
  rangeMode: false,
  rangeStart: null,
  rangeEnd: null,
  rangeDataIdxStart: null,
  rangeDataIdxEnd: null,
  fileName: '',
  format: 'txt',
  channels: [],
  activeChannelId: null,
  freqMode: 'falling',
  dutyCorrect: false,
  edgeBase: 'falling',
  pulseLevel: 'high',
  defaultLevel: 0,
  lowGapToleranceEnabled: false,
  lowGapTolerancePct: 0.01,
  lowGapAnnotationEnabled: true,
  lowGapThreshold: LOW_GAP_DEFAULT_THRESHOLD,
  showDerivs: false,
  showFreqChart: true,
  showAccelChart: false,
};

const defaultSidebarStats: SidebarStatVisibility = {
  samplingRate: true,
  risingCount: true,
  fallingCount: true,
  pulseCount: true,
  duration: true,
  pointCount: true,
  minimum: true,
  maximum: true,
  average: true,
  standardDeviation: true,
  coefficientOfVariation: true,
};

function loadSidebarStats(): SidebarStatVisibility {
  try {
    const saved = window.localStorage.getItem('pulseview-sidebar-stats');
    if (!saved) return defaultSidebarStats;
    const parsed = JSON.parse(saved) as Partial<SidebarStatVisibility>;
    return Object.keys(defaultSidebarStats).reduce((result, key) => {
      const statKey = key as keyof SidebarStatVisibility;
      result[statKey] = typeof parsed[statKey] === 'boolean'
        ? parsed[statKey] as boolean
        : defaultSidebarStats[statKey];
      return result;
    }, {} as SidebarStatVisibility);
  } catch {
    return defaultSidebarStats;
  }
}

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [sidebarStats, setSidebarStats] = useState<SidebarStatVisibility>(loadSidebarStats);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [abChannels, setAbChannels] = useState<AbChannel[] | null>(null);
  const [abSamplingRate, setAbSamplingRate] = useState(0);
  const [abFileName, setAbFileName] = useState('');
  const [encoderMode, setEncoderMode] = useState<'ab' | 'direction'>('ab');
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme);
  const [experimentalAccelerationEnabled, setExperimentalAccelerationEnabled] = useState(false);
  const [experimentalAccelerationStatus, setExperimentalAccelerationStatus] = useState<'off' | 'loading' | 'ready' | 'error'>('off');
  const workerRef = useRef<Worker | null>(null);
  const wasmRequestRef = useRef(0);

  const updateExperimentalAcceleration = useCallback((enabled: boolean) => {
    const requestId = ++wasmRequestRef.current;
    if (!enabled) {
      disableWasm();
      setExperimentalAccelerationEnabled(false);
      setExperimentalAccelerationStatus('off');
      return;
    }
    setExperimentalAccelerationEnabled(true);
    setExperimentalAccelerationStatus('loading');
    void initializeWasm().then((loaded) => {
      if (wasmRequestRef.current !== requestId) return;
      if (loaded) {
        setExperimentalAccelerationStatus('ready');
      } else {
        setExperimentalAccelerationEnabled(false);
        setExperimentalAccelerationStatus('error');
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('pulseview-theme', theme);
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem('pulseview-sidebar-stats', JSON.stringify(sidebarStats));
    } catch {
      // Storage may be disabled or unavailable; keep the preference in memory.
    }
  }, [sidebarStats]);

  const handleFile = useCallback((file: File, mode: 'normal' | 'ab' | 'direction' = 'normal') => {
    const format = detectFormat(file);
    setParsing(true);
    setParseProgress('读取文件…');

    file.arrayBuffer().then((buf) => {
      setParseProgress('解析数据中…');

      if (workerRef.current) {
        workerRef.current.terminate();
      }

      const worker =
        format === 'vcd'
          ? new VcdWorker()
          : format === 'sr'
            ? new SrWorker()
            : format === 'saleae'
              ? new SaleaeWorker()
              : new TxtWorker();
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'progress') {
          setParseProgress(`已解析 ${d.sampleCount.toLocaleString()} 个采样点…`);
        } else if (d.type === 'error') {
          alert('解析出错：' + d.message);
          setParsing(false);
        } else if (d.type === 'done-ab') {
          setAbChannels(d.channels as AbChannel[]);
          setAbSamplingRate(d.samplingRate);
          setAbFileName(file.name);
          setEncoderMode(mode === 'direction' ? 'direction' : 'ab');
          setParsing(false);
          return;
        } else if (d.type === 'done') {
          if (d.freqPts) {
            // PWM 测量导出：频率/占空比/时间直接来自文件测量值（精度最高），
            // 无需边沿重建；transTimes/transLevels 置空使模式切换不重算
            const samplingRate: number = d.samplingRate;
            const freqPts: FreqPoint[] = d.freqPts;
            const fmt: 'vcd' | 'txt' | 'sr' | 'saleae' = d.format;
            const channels: CsvChannel[] = d.channels ?? [];
            if (!samplingRate || freqPts.length === 0) {
              alert('文件中未找到可用的 PWM 频率测量，请检查文件格式。');
              setParsing(false);
              return;
            }
            setState({
              ...initialState,
              samplingRate,
              sampleCount: d.sampleCount,
              pulseCount: d.pulseCount ?? 0,
              allFreqPts: freqPts,
              freqPts,
              fileName: file.name,
              format: fmt,
              channels,
              activeChannelId: channels[0]?.id ?? null,
            });
            setParsing(false);
            return;
          }
          const risingEdges: Float64Array = d.risingEdges;
          const fallingEdges: Float64Array = d.fallingEdges;
          const transTimes: Float64Array = d.transTimes;
          const transLevels: Int8Array = d.transLevels;
          const samplingRate: number = d.samplingRate;
          const sampleCount: number = d.sampleCount;
          const fmt: 'vcd' | 'txt' | 'sr' | 'saleae' = d.format;
          const channels: CsvChannel[] = d.channels ?? [];

          if (!samplingRate) {
            alert('文件头中未找到采样频率，请检查文件格式。');
            setParsing(false);
            return;
          }
          if (!transTimes || transTimes.length < 3) {
            alert('未检测到足够的信号跳变（至少需要 3 个跳变），请检查文件格式。');
            setParsing(false);
            return;
          }

          setState((prev) => {
            const defaultLevel = transLevels[0] as DefaultLevel;
            const logicalLevels = prev.pulseLevel === 'low'
              ? invertTransitionLevels(transLevels)
              : transLevels;
            const logicalEdges = deriveEdgesFromTransitions(transTimes, logicalLevels);

            const logicalDefaultLevel = prev.pulseLevel === 'low'
              ? (defaultLevel === 1 ? 0 : 1)
              : defaultLevel;
            const pulseCount = countPulsesFromTransitions(logicalLevels);

            // 按用户当前选择的频率计算模式、占空比修正与基准边沿生成频率点
            const allPts = computeFreqFromTransitions(
              transTimes,
              logicalLevels,
              fmt,
              prev.freqMode,
              prev.dutyCorrect,
              prev.edgeBase,
              prev.lowGapToleranceEnabled,
              prev.lowGapTolerancePct,
              logicalDefaultLevel
            );
            return {
              ...initialState,
              freqMode: prev.freqMode,
              dutyCorrect: prev.dutyCorrect,
              edgeBase: prev.edgeBase,
              lowGapToleranceEnabled: prev.lowGapToleranceEnabled,
              lowGapTolerancePct: prev.lowGapTolerancePct,
              lowGapAnnotationEnabled: prev.lowGapAnnotationEnabled,
              lowGapThreshold: prev.lowGapThreshold,
              samplingRate,
              sampleCount,
              pulseCount,
              risingEdges: logicalEdges.risingEdges,
              fallingEdges: logicalEdges.fallingEdges,
              transTimes,
              transLevels: logicalLevels,
              sourceTransLevels: transLevels,
              allFreqPts: allPts,
              freqPts: allPts,
              fileName: file.name,
              format: fmt,
              channels,
              activeChannelId: channels[0]?.id ?? null,
              pulseLevel: prev.pulseLevel,
              defaultLevel,
            };
          });
          setParsing(false);
        }
      };

      worker.onerror = (err) => {
        alert('解析出错：' + err.message);
        setParsing(false);
      };

      worker.postMessage({ type: 'parse', buffer: buf, mode }, [buf]);
    });
  }, []);

  const selectChannel = useCallback((channelId: string) => {
    setState((prev) => {
      const channel = prev.channels.find((candidate) => candidate.id === channelId);
      if (!channel || channel.id === prev.activeChannelId) return prev;
      const defaultLevel = channel.transLevels[0] as DefaultLevel;
      const transLevels = prev.pulseLevel === 'low' ? invertTransitionLevels(channel.transLevels) : channel.transLevels;
      const edges = deriveEdgesFromTransitions(channel.transTimes, transLevels);
      const logicalDefaultLevel = prev.pulseLevel === 'low' ? (defaultLevel === 1 ? 0 : 1) : defaultLevel;
      const allPts = computeFreqFromTransitions(channel.transTimes, transLevels, prev.format, prev.freqMode, prev.dutyCorrect, prev.edgeBase, prev.lowGapToleranceEnabled, prev.lowGapTolerancePct, logicalDefaultLevel);
      return {
        ...prev,
        samplingRate: channel.samplingRate,
        sampleCount: channel.sampleCount,
        pulseCount: countPulsesFromTransitions(transLevels),
        risingEdges: edges.risingEdges,
        fallingEdges: edges.fallingEdges,
        transTimes: channel.transTimes,
        transLevels,
        sourceTransLevels: channel.transLevels,
        allFreqPts: allPts,
        freqPts: allPts,
        defaultLevel,
        activeChannelId: channel.id,
        cursorA: null,
        cursorB: null,
        accelSegs: [],
        rangeMode: false,
        rangeStart: null,
        rangeEnd: null,
        rangeDataIdxStart: null,
        rangeDataIdxEnd: null,
      };
    });
  }, []);

  const updateWaveformInterpretation = useCallback((pulseLevel: PulseLevel, defaultLevel: DefaultLevel) => {
    setState((prev) => {
      if (!prev.transTimes || !prev.sourceTransLevels) {
        return { ...prev, pulseLevel, defaultLevel };
      }
      const transLevels = pulseLevel === 'low'
        ? invertTransitionLevels(prev.sourceTransLevels)
        : prev.sourceTransLevels;
      const edges = deriveEdgesFromTransitions(prev.transTimes, transLevels);
      const allPts = computeFreqFromTransitions(
        prev.transTimes,
        transLevels,
        prev.format,
        prev.freqMode,
        prev.dutyCorrect,
        prev.edgeBase,
        prev.lowGapToleranceEnabled,
        prev.lowGapTolerancePct,
        pulseLevel === 'low' ? (defaultLevel === 1 ? 0 : 1) : defaultLevel
      );
      const pulseCount = countPulsesFromTransitions(transLevels);
      return {
        ...prev,
        pulseLevel,
        defaultLevel,
        transLevels,
        risingEdges: edges.risingEdges,
        fallingEdges: edges.fallingEdges,
        pulseCount,
        allFreqPts: allPts,
        freqPts: allPts,
        cursorA: null,
        cursorB: null,
        accelSegs: [],
        rangeMode: false,
        rangeStart: null,
        rangeEnd: null,
        rangeDataIdxStart: null,
        rangeDataIdxEnd: null,
      };
    });
  }, []);

  const updateFreqMode = useCallback((mode: FreqMode) => {
    setState((prev) => {
      // 旧的 low-gap 独立图改为主图标注；保留当前频率模式。
      if (mode === 'low-gap') return prev;
      if (!prev.transTimes || !prev.transLevels) return { ...prev, freqMode: mode };
      const allPts = computeFreqFromTransitions(
        prev.transTimes,
        prev.transLevels,
        prev.format,
        mode,
        prev.dutyCorrect,
        prev.edgeBase,
        prev.lowGapToleranceEnabled,
        prev.lowGapTolerancePct,
        prev.pulseLevel === 'low' ? (prev.defaultLevel === 1 ? 0 : 1) : prev.defaultLevel
      );
      return {
        ...prev,
        freqMode: mode,
        allFreqPts: allPts,
        freqPts: allPts,
        // 频率点序列变化后，光标索引/分段/框选索引均失效，重置分析状态
        cursorA: null,
        cursorB: null,
        accelSegs: [],
        rangeDataIdxStart: null,
        rangeDataIdxEnd: null,
        // 低电平间隔不是频率，不能把它送入频率导数/加减速分析。
      };
    });
  }, []);

  // 占空比修正开关：勾选后脉冲宽度模式按实际占空比修正频率（freq = 1/周期）
  const updateDutyCorrect = useCallback((on: boolean) => {
    setState((prev) => {
      if (!prev.transTimes || !prev.transLevels) return { ...prev, dutyCorrect: on };
      const allPts = computeFreqFromTransitions(
        prev.transTimes,
        prev.transLevels,
        prev.format,
        prev.freqMode,
        on,
        prev.edgeBase,
        prev.lowGapToleranceEnabled,
        prev.lowGapTolerancePct,
        prev.pulseLevel === 'low' ? (prev.defaultLevel === 1 ? 0 : 1) : prev.defaultLevel
      );
      return {
        ...prev,
        dutyCorrect: on,
        allFreqPts: allPts,
        freqPts: allPts,
        cursorA: null,
        cursorB: null,
        accelSegs: [],
        rangeDataIdxStart: null,
        rangeDataIdxEnd: null,
      };
    });
  }, []);

  // 基准边沿切换：占空比与占空比修正的周期计算采用下降沿（默认）或上升沿
  const updateEdgeBase = useCallback((base: EdgeBase) => {
    setState((prev) => {
      if (!prev.transTimes || !prev.transLevels) return { ...prev, edgeBase: base };
      const allPts = computeFreqFromTransitions(
        prev.transTimes,
        prev.transLevels,
        prev.format,
        prev.freqMode,
        prev.dutyCorrect,
        base,
        prev.lowGapToleranceEnabled,
        prev.lowGapTolerancePct,
        prev.pulseLevel === 'low' ? (prev.defaultLevel === 1 ? 0 : 1) : prev.defaultLevel
      );
      return {
        ...prev,
        edgeBase: base,
        allFreqPts: allPts,
        freqPts: allPts,
        cursorA: null,
        cursorB: null,
        accelSegs: [],
        rangeDataIdxStart: null,
        rangeDataIdxEnd: null,
      };
    });
  }, []);

  const updateLowGapTolerance = useCallback((enabled: boolean, pct: number) => {
    setState((prev) => {
      const normalizedPct = Number.isFinite(pct)
        ? Math.max(0, pct)
        : prev.lowGapTolerancePct;
      if (!prev.transTimes || !prev.transLevels) {
        return {
          ...prev,
          lowGapToleranceEnabled: enabled,
          lowGapTolerancePct: normalizedPct,
        };
      }
      const allPts = computeFreqFromTransitions(
        prev.transTimes,
        prev.transLevels,
        prev.format,
        prev.freqMode,
        prev.dutyCorrect,
        prev.edgeBase,
        enabled,
        normalizedPct,
        prev.pulseLevel === 'low' ? (prev.defaultLevel === 1 ? 0 : 1) : prev.defaultLevel
      );
      return {
        ...prev,
        lowGapToleranceEnabled: enabled,
        lowGapTolerancePct: normalizedPct,
        allFreqPts: allPts,
        freqPts: allPts,
        cursorA: null,
        cursorB: null,
        accelSegs: [],
        rangeDataIdxStart: null,
        rangeDataIdxEnd: null,
      };
    });
  }, []);

  const updateLowGapAnnotation = useCallback((enabled: boolean, threshold: number) => {
    setState((prev) => ({
      ...prev,
      lowGapAnnotationEnabled: enabled,
      lowGapThreshold: Number.isFinite(threshold)
        ? Math.max(LOW_GAP_MIN_THRESHOLD, threshold)
        : prev.lowGapThreshold,
    }));
  }, []);

  const updateAccelSegs = useCallback((segs: AccelSegment[]) => {
    setState((prev) => ({ ...prev, accelSegs: segs }));
  }, []);

  const updateCursor = useCallback(
    (which: 'A' | 'B', idx: number | null) => {
      setState((prev) => ({
        ...prev,
        [which === 'A' ? 'cursorA' : 'cursorB']: idx,
      }));
    },
    []
  );

  const updateCursorMarkers = useCallback((markers: CursorMarker[], activeCursorId: string) => {
    setState((prev) => ({
      ...prev,
      cursorMarkers: markers,
      activeCursorId,
      cursorA: markers[0]?.index ?? null,
      cursorB: markers[1]?.index ?? null,
      cursorPair: prev.cursorPair && prev.cursorPair.every((id) => markers.some((marker) => marker.id === id))
        ? prev.cursorPair
        : markers.length >= 2 ? [markers[0].id, markers[1].id] : null,
    }));
  }, []);

  const updateCursorPair = useCallback((pair: [string, string]) => {
    setState((prev) => ({ ...prev, cursorPair: pair }));
  }, []);

  const setRangeMode = useCallback((mode: boolean) => {
    setState((prev) => ({ ...prev, rangeMode: mode }));
  }, []);

  const setRange = useCallback(
    (
      start: number | null,
      end: number | null,
      idxStart: number | null,
      idxEnd: number | null
    ) => {
      setState((prev) => ({
        ...prev,
        rangeStart: start,
        rangeEnd: end,
        rangeDataIdxStart: idxStart,
        rangeDataIdxEnd: idxEnd,
      }));
    },
    []
  );

  const clearRange = useCallback(() => {
    setState((prev) => ({
      ...prev,
      rangeStart: null,
      rangeEnd: null,
      rangeDataIdxStart: null,
      rangeDataIdxEnd: null,
      rangeMode: false,
    }));
  }, []);

  // 导数视图开关：单图模式或全部图被关闭时点击 → 开启并全部显示；
  // 多图模式且至少一个图可见时点击 → 退出回到仅频率图
  const toggleDerivView = useCallback(() => {
    setState((prev) => {
      const anyVisible =
        prev.showFreqChart || prev.showAccelChart;
      if (!prev.showDerivs || !anyVisible) {
        return {
          ...prev,
          showDerivs: true,
          showFreqChart: true,
          showAccelChart: true,
        };
      }
      return {
        ...prev,
        showDerivs: false,
        showFreqChart: true,
        showAccelChart: false,
      };
    });
  }, []);

  const toggleChartVisible = useCallback((key: 'freq' | 'accel') => {
    setState((prev) => ({
      ...prev,
      showFreqChart:
        key === 'freq' ? !prev.showFreqChart : prev.showFreqChart,
      showAccelChart:
        key === 'accel' ? !prev.showAccelChart : prev.showAccelChart,
    }));
  }, []);

  if (abChannels && !parsing) {
    return <AbAnalysisView channels={abChannels} fileName={abFileName} samplingRate={abSamplingRate} initialMode={encoderMode} onFile={handleFile} theme={theme} onThemeChange={setTheme} sidebarStats={sidebarStats} onSidebarStatsChange={setSidebarStats} />;
  }

  if (!state.samplingRate && !parsing) {
    return <UploadScreen onFile={handleFile} theme={theme} onThemeChange={setTheme} experimentalAccelerationEnabled={experimentalAccelerationEnabled} experimentalAccelerationStatus={experimentalAccelerationStatus} onExperimentalAccelerationChange={updateExperimentalAcceleration} />;
  }

  if (parsing) {
    return <UploadScreen onFile={handleFile} progress={parseProgress} theme={theme} onThemeChange={setTheme} experimentalAccelerationEnabled={experimentalAccelerationEnabled} experimentalAccelerationStatus={experimentalAccelerationStatus} onExperimentalAccelerationChange={updateExperimentalAcceleration} />;
  }

  return (
    <AppShell
      state={state}
      theme={theme}
      onThemeChange={setTheme}
      sidebarStats={sidebarStats}
      onSidebarStatsChange={setSidebarStats}
      onFile={handleFile}
      onFreqModeChange={updateFreqMode}
      channels={state.channels}
      activeChannelId={state.activeChannelId}
      onChannelChange={selectChannel}
      onDutyCorrectChange={updateDutyCorrect}
      onEdgeBaseChange={updateEdgeBase}
      onPulseLevelChange={(pulseLevel) => updateWaveformInterpretation(pulseLevel, state.defaultLevel)}
      onDefaultLevelChange={(defaultLevel) => updateWaveformInterpretation(state.pulseLevel, defaultLevel)}
      onLowGapToleranceChange={updateLowGapTolerance}
      onLowGapAnnotationChange={updateLowGapAnnotation}
      onAccelDetect={updateAccelSegs}
      onCursorChange={updateCursor}
      onCursorMarkersChange={updateCursorMarkers}
      onCursorPairChange={updateCursorPair}
      onRangeModeChange={setRangeMode}
      onRangeChange={setRange}
      onClearRange={clearRange}
      onToggleDerivView={toggleDerivView}
      onToggleChart={toggleChartVisible}
    />
  );
}
