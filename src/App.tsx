import { useState, useCallback, useRef } from 'react';
import { UploadScreen } from './components/UploadScreen';
import { AppShell } from './components/AppShell';
import { AccelSegment, AppState, FreqMode } from './types';
import { computeFreqFromTransitions } from './compute';
import { detectFormat } from './utils';
import VcdWorker from './workers/vcdParser.ts?worker';
import TxtWorker from './workers/txtParser.ts?worker';
import SrWorker from './workers/srParser.ts?worker';
import SaleaeWorker from './workers/saleaeParser.ts?worker';

const initialState: AppState = {
  samplingRate: 0,
  sampleCount: 0,
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
  freqMode: 'pulse',
};

export function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const workerRef = useRef<Worker | null>(null);

  const handleFile = useCallback((file: File) => {
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
        } else if (d.type === 'done') {
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

          setState((prev) => {
            // 按用户当前选择的频率计算模式生成频率点
            const allPts = computeFreqFromTransitions(
              transTimes,
              transLevels,
              fmt,
              prev.freqMode
            );
            return {
              ...initialState,
              freqMode: prev.freqMode,
              samplingRate,
              sampleCount,
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

      worker.postMessage({ type: 'parse', buffer: buf }, [buf]);
    });
  }, []);

  const updateFreqMode = useCallback((mode: FreqMode) => {
    setState((prev) => {
      if (!prev.transTimes || !prev.transLevels) return { ...prev, freqMode: mode };
      const allPts = computeFreqFromTransitions(
        prev.transTimes,
        prev.transLevels,
        prev.format,
        mode
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
      onAccelDetect={updateAccelSegs}
      onCursorChange={updateCursor}
      onRangeModeChange={setRangeMode}
      onRangeChange={setRange}
      onClearRange={clearRange}
    />
  );
}
