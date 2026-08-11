import { useState, useCallback, useRef } from 'react';
import { UploadScreen } from './components/UploadScreen';
import { AppShell } from './components/AppShell';
import { AccelSegment, AppState } from './types';
import { computeFreqFromEdges, applySmoothing, downsample } from './compute';
import { detectFormat } from './utils';

const vcdWorkerUrl = new URL('./workers/vcdParser.ts', import.meta.url);
const txtWorkerUrl = new URL('./workers/txtParser.ts', import.meta.url);

const initialState: AppState = {
  samplingRate: 0,
  sampleCount: 0,
  risingEdges: null,
  fallingEdges: null,
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

      const workerUrl = format === 'vcd' ? vcdWorkerUrl : txtWorkerUrl;
      const worker = new Worker(workerUrl, { type: 'module' });
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'progress') {
          setParseProgress(`已解析 ${d.sampleCount.toLocaleString()} 个采样点…`);
        } else if (d.type === 'done') {
          const risingEdges: Float64Array = d.risingEdges;
          const fallingEdges: Float64Array = d.fallingEdges;
          const samplingRate: number = d.samplingRate;
          const sampleCount: number = d.sampleCount;
          const fmt: 'vcd' | 'txt' = d.format;

          if (!samplingRate) {
            alert('文件头中未找到采样频率，请检查文件格式。');
            setParsing(false);
            return;
          }
          if (!risingEdges || risingEdges.length < 1) {
            alert('未检测到足够的信号跳变，请检查文件格式。');
            setParsing(false);
            return;
          }

          const allPts = computeFreqFromEdges(risingEdges, fallingEdges, fmt);
          const smoothed = applySmoothing(allPts, 5);
          const displayPts = downsample(smoothed);

          setState({
            ...initialState,
            samplingRate,
            sampleCount,
            risingEdges,
            fallingEdges,
            allFreqPts: allPts,
            freqPts: displayPts,
            fileName: file.name,
            format: fmt,
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

  const updateSmoothing = useCallback(
    (win: number) => {
      setState((prev) => {
        const smoothed = applySmoothing(prev.allFreqPts, win);
        const displayPts = downsample(smoothed);
        return { ...prev, freqPts: displayPts };
      });
    },
    []
  );

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
      onSmoothingChange={updateSmoothing}
      onAccelDetect={updateAccelSegs}
      onCursorChange={updateCursor}
      onRangeModeChange={setRangeMode}
      onRangeChange={setRange}
      onClearRange={clearRange}
    />
  );
}
