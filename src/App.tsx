import { useState, useCallback, useRef } from 'react';
import { UploadScreen } from './components/UploadScreen';
import { AppShell } from './components/AppShell';
import { AbChannel, AccelSegment, AppState, EdgeBase, FreqMode, FreqPoint } from './types';
import { computeFreqFromTransitions } from './compute';
import { detectFormat } from './utils';
import VcdWorker from './workers/vcdParser.ts?worker';
import TxtWorker from './workers/txtParser.ts?worker';
import SrWorker from './workers/srParser.ts?worker';
import SaleaeWorker from './workers/saleaeParser.ts?worker';
import { AbAnalysisView } from './components/AbAnalysisView';

const initialState: AppState = {
  samplingRate: 0,
  sampleCount: 0,
  pulseCount: 0,
  risingEdges: null,
  fallingEdges: null,
  transTimes: null,
  transLevels: null,
  allFreqPts: [],
  freqPts: [],
  cursorA: null,
  cursorB: null,
  accelSegs: [],
  rangeMode: false,
  rangeStart: null,
  rangeEnd: null,
  rangeDataIdxStart: null,
  rangeDataIdxEnd: null,
  fileName: '',
  format: 'txt',
  freqMode: 'falling',
  dutyCorrect: false,
  edgeBase: 'falling',
  showDerivs: false,
  showFreqChart: true,
  showAccelChart: false,
  showJerkChart: false,
};

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [abChannels, setAbChannels] = useState<AbChannel[] | null>(null);
  const [abSamplingRate, setAbSamplingRate] = useState(0);
  const [abFileName, setAbFileName] = useState('');
  const workerRef = useRef<Worker | null>(null);

  const handleFile = useCallback((file: File, mode: 'normal' | 'ab' = 'normal') => {
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
          setParsing(false);
          return;
        } else if (d.type === 'done') {
          if (d.freqPts) {
            // PWM 测量导出：频率/占空比/时间直接来自文件测量值（精度最高），
            // 无需边沿重建；transTimes/transLevels 置空使模式切换不重算
            const samplingRate: number = d.samplingRate;
            const freqPts: FreqPoint[] = d.freqPts;
            const fmt: 'vcd' | 'txt' | 'sr' | 'saleae' = d.format;
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

          // 总脉冲数：从第一个 1 开始，每个 "1→0"（一个高电平脉冲）计一个脉冲
          let pulseCount = 0;
          for (let i = 0; i < transLevels.length - 1; i++) {
            if (transLevels[i] === 1 && transLevels[i + 1] === 0) pulseCount++;
          }

          setState((prev) => {
            // 按用户当前选择的频率计算模式、占空比修正与基准边沿生成频率点
            const allPts = computeFreqFromTransitions(
              transTimes,
              transLevels,
              fmt,
              prev.freqMode,
              prev.dutyCorrect,
              prev.edgeBase
            );
            return {
              ...initialState,
              freqMode: prev.freqMode,
              dutyCorrect: prev.dutyCorrect,
              edgeBase: prev.edgeBase,
              samplingRate,
              sampleCount,
              pulseCount,
              risingEdges,
              fallingEdges,
              transTimes,
              transLevels,
              allFreqPts: allPts,
              freqPts: allPts,
              fileName: file.name,
              format: fmt,
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

  const updateFreqMode = useCallback((mode: FreqMode) => {
    setState((prev) => {
      if (!prev.transTimes || !prev.transLevels) return { ...prev, freqMode: mode };
      const allPts = computeFreqFromTransitions(
        prev.transTimes,
        prev.transLevels,
        prev.format,
        mode,
        prev.dutyCorrect,
        prev.edgeBase
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
        prev.edgeBase
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
        base
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
        prev.showFreqChart || prev.showAccelChart || prev.showJerkChart;
      if (!prev.showDerivs || !anyVisible) {
        return {
          ...prev,
          showDerivs: true,
          showFreqChart: true,
          showAccelChart: true,
          showJerkChart: true,
        };
      }
      return {
        ...prev,
        showDerivs: false,
        showFreqChart: true,
        showAccelChart: false,
        showJerkChart: false,
      };
    });
  }, []);

  const toggleChartVisible = useCallback((key: 'freq' | 'accel' | 'jerk') => {
    setState((prev) => ({
      ...prev,
      showFreqChart:
        key === 'freq' ? !prev.showFreqChart : prev.showFreqChart,
      showAccelChart:
        key === 'accel' ? !prev.showAccelChart : prev.showAccelChart,
      showJerkChart: key === 'jerk' ? !prev.showJerkChart : prev.showJerkChart,
    }));
  }, []);

  if (abChannels && !parsing) {
    return <AbAnalysisView channels={abChannels} fileName={abFileName} samplingRate={abSamplingRate} onFile={handleFile} />;
  }

  if (!state.samplingRate && !parsing) {
    return <UploadScreen onFile={handleFile} />;
  }

  if (parsing) {
    return <UploadScreen onFile={handleFile} progress={parseProgress} />;
  }

  return (
    <AppShell
      state={state}
      onFile={handleFile}
      onFreqModeChange={updateFreqMode}
      onDutyCorrectChange={updateDutyCorrect}
      onEdgeBaseChange={updateEdgeBase}
      onAccelDetect={updateAccelSegs}
      onCursorChange={updateCursor}
      onRangeModeChange={setRangeMode}
      onRangeChange={setRange}
      onClearRange={clearRange}
      onToggleDerivView={toggleDerivView}
      onToggleChart={toggleChartVisible}
    />
  );
}
