import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  Chart,
  ChartData,
  ChartOptions,
  ScatterDataPoint,
  Plugin,
} from 'chart.js/auto';
import { Chart as ReactChart } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import annotationPlugin from 'chartjs-plugin-annotation';
import { FreqPoint, AccelSegment, FreqMode } from '../types';
import { fmtTime, fmtTimeShort, fmtFreq, fmtFreqShort } from '../utils';
import { buildVisibleData, ViewRange } from '../decimate';

Chart.register(zoomPlugin, annotationPlugin);

const DATASET_STYLE = {
  borderColor: 'rgba(212,162,78,0.85)',
  backgroundColor: 'rgba(212,162,78,0.06)',
  borderWidth: 1.5,
  pointRadius: 0,
  pointHoverRadius: 4,
  pointHoverBackgroundColor: '#d4a24e',
  pointHoverBorderColor: '#fff',
  pointHoverBorderWidth: 1.5,
  showLine: true,
  tension: 0.2,
  fill: true,
} as const;

interface Props {
  freqPts: FreqPoint[];
  allFreqPts: FreqPoint[];
  freqMode: FreqMode;
  cursorA: number | null;
  cursorB: number | null;
  rangeMode: boolean;
  rangeStart: number | null;
  rangeEnd: number | null;
  accelSegs: AccelSegment[];
  viewRange: ViewRange | null;
  onViewRangeChange: (r: ViewRange | null) => void;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
  onRangeModeChange: (mode: boolean) => void;
  onRangeChange: (
    start: number | null,
    end: number | null,
    idxStart: number | null,
    idxEnd: number | null
  ) => void;
  onClearRange: () => void;
  resetZoomRef?: React.MutableRefObject<() => void>;
  onResetZoomReady?: (fn: () => void) => void;
  showToolbar?: boolean;
}

export function FreqChart({
  freqPts,
  allFreqPts,
  freqMode,
  cursorA,
  cursorB,
  rangeMode,
  rangeStart,
  rangeEnd,
  accelSegs,
  viewRange,
  onViewRangeChange,
  onCursorChange,
  onRangeModeChange,
  onRangeChange,
  onClearRange,
  resetZoomRef,
  onResetZoomReady,
  showToolbar = true,
}: Props) {
  const chartRef = useRef<Chart<'scatter', ScatterDataPoint[]> | null>(null);
  const dragRef = useRef({ dragging: false, startX: 0 });

  // 图表实际像素宽度，用于按像素列做 min/max 抽稀
  const [chartWidth, setChartWidth] = useState(1200);

  // 每次图表更新后同步可见范围，覆盖滚轮缩放、平移、重置等所有路径；
  // 该值同时用于：1) 写回 options.scales.x.min/max 使缩放状态在 React 重渲染后不丢失
  // 2) 定位可见数据区间做抽稀。多个导数图共享同一 viewRange，实现同步缩放；
  // 与上次记录比较，无实质变化时不通知父级，避免受控状态下的循环重渲染
  const lastViewRef = useRef<ViewRange | null>(null);
  const viewSyncRef = useRef<(min: number, max: number) => void>(() => {});
  useEffect(() => {
    viewSyncRef.current = (min, max) => {
      const prev = lastViewRef.current;
      if (prev) {
        const tol = (Math.abs(min) + Math.abs(max) + 1) * 1e-9;
        if (Math.abs(prev.min - min) < tol && Math.abs(prev.max - max) < tol) return;
      }
      lastViewRef.current = { min, max };
      onViewRangeChange({ min, max });
    };
  });
  const viewSyncPlugin = useMemo<Plugin<'scatter'>>(
    () => ({
      id: 'view-sync',
      afterUpdate(chart) {
        const x = chart.scales.x;
        if (typeof x.min === 'number' && typeof x.max === 'number') {
          viewSyncRef.current(x.min, x.max);
        }
      },
    }),
    []
  );

  // 数据变化（重新载入文件 / 切换频率模式）时重置可见范围
  useEffect(() => {
    lastViewRef.current = null;
    onViewRangeChange(null);
  }, [freqPts]);

  // Register resetZoom callback
  useEffect(() => {
    const doReset = () => {
      const chart = chartRef.current;
      if (chart) chart.resetZoom();
      lastViewRef.current = null;
      onViewRangeChange(null);
    };
    if (onResetZoomReady) {
      onResetZoomReady(doReset);
    } else if (resetZoomRef) {
      resetZoomRef.current = doReset;
    }
  }, [resetZoomRef, onResetZoomReady, onViewRangeChange]);

  // 开发环境暴露图表实例，便于自动化验证
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __pvChart?: Chart<'scatter', ScatterDataPoint[]> }).__pvChart =
        chartRef.current ?? undefined;
    }
  }, []);

  // 当前可见窗口的渲染数据：超过阈值时按像素列 min/max 抽稀
  const visibleData = useMemo(
    () => buildVisibleData(freqPts, viewRange, chartWidth),
    [freqPts, viewRange, chartWidth]
  );

  const data: ChartData<'scatter', ScatterDataPoint[]> = useMemo(
    () => ({
      datasets: [{ ...DATASET_STYLE, data: visibleData }],
    }),
    [visibleData]
  );

  const buildAnnotations = useCallback(() => {
    const annos: Record<string, unknown> = {};

    if (cursorA !== null && freqPts[cursorA]) {
      annos.cursorA = {
        type: 'line',
        xMin: freqPts[cursorA].time,
        xMax: freqPts[cursorA].time,
        borderColor: '#4ecdc4',
        borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: true,
          content: 'A',
          position: 'start',
          backgroundColor: '#4ecdc4',
          color: '#0c0b0f',
          font: { family: 'DM Sans', size: 10, weight: 700 },
          padding: { x: 5, y: 2 },
          borderRadius: 3,
        },
      };
    }

    if (cursorB !== null && freqPts[cursorB]) {
      annos.cursorB = {
        type: 'line',
        xMin: freqPts[cursorB].time,
        xMax: freqPts[cursorB].time,
        borderColor: '#7ec699',
        borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: true,
          content: 'B',
          position: 'start',
          backgroundColor: '#7ec699',
          color: '#0c0b0f',
          font: { family: 'DM Sans', size: 10, weight: 700 },
          padding: { x: 5, y: 2 },
          borderRadius: 3,
        },
      };
    }

    if (rangeStart !== null && rangeEnd !== null) {
      annos.rangeBox = {
        type: 'box',
        xMin: Math.min(rangeStart, rangeEnd),
        xMax: Math.max(rangeStart, rangeEnd),
        backgroundColor: 'rgba(212,162,78,.05)',
        borderColor: 'rgba(212,162,78,.2)',
        borderWidth: 1,
      };
    }

    accelSegs.forEach((seg, i) => {
      annos['seg_' + i] = {
        type: 'box',
        xMin: seg.startTime,
        xMax: seg.endTime,
        backgroundColor:
          seg.type === 'accel'
            ? 'rgba(126,198,153,.04)'
            : seg.type === 'decel'
              ? 'rgba(224,108,117,.04)'
              : 'rgba(156,150,168,.05)',
        borderColor:
          seg.type === 'accel'
            ? 'rgba(126,198,153,.15)'
            : seg.type === 'decel'
              ? 'rgba(224,108,117,.15)'
              : 'rgba(156,150,168,.2)',
        borderWidth: 1,
      };
    });

    return annos;
  }, [cursorA, cursorB, rangeStart, rangeEnd, accelSegs, freqPts]);

  const handleChartClick = useCallback(
    (evt: { native?: Event }) => {
      if (rangeMode) return;
      const chart = chartRef.current;
      if (!chart || freqPts.length === 0) return;

      const native = evt.native as MouseEvent | undefined;
      const rect = chart.canvas.getBoundingClientRect();
      const cx = (native?.clientX ?? 0) - rect.left;
      const dataX = chart.scales.x.getValueForPixel(cx);
      if (dataX === undefined) return;

      let lo = 0;
      let hi = freqPts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (freqPts[mid].time < dataX) lo = mid + 1;
        else hi = mid;
      }
      if (
        lo > 0 &&
        Math.abs(freqPts[lo].time - dataX) > Math.abs(freqPts[lo - 1].time - dataX)
      )
        lo--;

      if (native?.ctrlKey || native?.metaKey) onCursorChange('B', lo);
      else onCursorChange('A', lo);
    },
    [rangeMode, freqPts, onCursorChange]
  );

  const options = useMemo<ChartOptions<'scatter'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      onResize: (_chart, size) =>
        setChartWidth(Math.max(1, Math.round(size.width))),
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      scales: {
        x: {
          type: 'linear',
          ...(viewRange ? { min: viewRange.min, max: viewRange.max } : {}),
          title: {
            display: true,
            text: '时间',
            color: '#5c5668',
            font: { family: 'DM Sans', size: 11, weight: 600 },
            padding: { top: 8 },
          },
          ticks: {
            color: '#5c5668',
            font: { family: 'Source Code Pro', size: 10 },
            callback: (v) => fmtTimeShort(v as number),
            maxTicksLimit: 12,
          },
          grid: { color: 'rgba(42,39,53,0.6)', lineWidth: 0.8 },
          border: { color: 'rgba(42,39,53,0.8)' },
        },
        y: {
          title: {
            display: true,
            text: freqMode === 'low-gap' ? '低电平间隔' : '频率',
            color: '#5c5668',
            font: { family: 'DM Sans', size: 11, weight: 600 },
            padding: { bottom: 8 },
          },
          ticks: {
            color: '#5c5668',
            font: { family: 'Source Code Pro', size: 10 },
            callback: (v) =>
              freqMode === 'low-gap'
                ? fmtTimeShort(v as number)
                : fmtFreqShort(v as number),
            maxTicksLimit: 8,
          },
          grid: { color: 'rgba(42,39,53,0.6)', lineWidth: 0.8 },
          border: { color: 'rgba(42,39,53,0.8)' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(23,21,28,0.96)',
          titleColor: '#e8e4f0',
          bodyColor: '#9a93a8',
          borderColor: 'rgba(212,162,78,.15)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          cornerRadius: 8,
          titleFont: { family: 'DM Sans', size: 12, weight: 600 },
          bodyFont: { family: 'Source Code Pro', size: 11 },
          callbacks: {
            title: (items) =>
              items.length ? '时间  ' + fmtTime(items[0].parsed.x ?? 0) : '',
            label: (item) => {
              const raw = item.raw as
                | { period?: number; dutyCycle?: number }
                | undefined;
              const text =
                freqMode === 'low-gap'
                  ? '低电平间隔  ' + fmtTime(item.parsed.y ?? 0)
                  : '频率  ' + fmtFreq(item.parsed.y ?? 0);
              if (!raw) return text;
              let suffix = '';
              if (raw.period) {
                suffix +=
                  ' · ' +
                    (freqMode === 'low-gap'
                      ? '周期 '
                      : freqMode === 'pulse'
                        ? '脉宽 '
                        : '周期 ') +
                  fmtTime(raw.period);
              }
              if (raw.dutyCycle !== undefined) {
                suffix += ' · 占空比 ' + (raw.dutyCycle * 100).toFixed(1) + '%';
              }
              return text + suffix;
            },
          },
        },
        zoom: {
          pan: { enabled: !rangeMode, mode: 'x' },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
          },
        },
        annotation: {
          annotations: buildAnnotations() as Record<string, never>,
        },
      },
      onClick: handleChartClick as (evt: unknown) => void,
    }),
    [viewRange, rangeMode, handleChartClick, buildAnnotations, freqMode]
  );

  // Range drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!rangeMode || e.button !== 0) return;
      dragRef.current = { dragging: true, startX: e.clientX };
      const chart = chartRef.current;
      if (!chart) return;
      const rect = chart.canvas.getBoundingClientRect();
      const dataX = chart.scales.x.getValueForPixel(e.clientX - rect.left);
      if (dataX !== undefined) onRangeChange(dataX, dataX, null, null);
    },
    [rangeMode, onRangeChange]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragRef.current.dragging) return;
      const chart = chartRef.current;
      if (!chart) return;
      const rect = chart.canvas.getBoundingClientRect();
      const dataX = chart.scales.x.getValueForPixel(e.clientX - rect.left);
      if (dataX !== undefined) onRangeChange(rangeStart, dataX, null, null);
    },
    [rangeStart, onRangeChange]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      const chart = chartRef.current;
      if (!chart) return;
      const rect = chart.canvas.getBoundingClientRect();
      const dataX = chart.scales.x.getValueForPixel(e.clientX - rect.left);
      if (dataX === undefined) return;

      const rs = Math.min(rangeStart ?? dataX, dataX);
      const re = Math.max(rangeStart ?? dataX, dataX);

      if (re - rs < 1e-12) {
        onClearRange();
        return;
      }

      let idxS = 0;
      let idxE = allFreqPts.length - 1;
      for (let i = 0; i < allFreqPts.length; i++) {
        if (allFreqPts[i].time >= rs) {
          idxS = i;
          break;
        }
      }
      for (let i = allFreqPts.length - 1; i >= 0; i--) {
        if (allFreqPts[i].time <= re) {
          idxE = i;
          break;
        }
      }
      onRangeChange(rs, re, idxS, idxE);
      onRangeModeChange(false);
    },
    [rangeStart, allFreqPts, onRangeChange, onRangeModeChange, onClearRange]
  );

  // Update annotations when deps change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    (chart.options.plugins as Record<string, unknown>).annotation = {
      annotations: buildAnnotations(),
    };
    chart.update('none');
  }, [buildAnnotations]);

  const rangeCount =
    rangeStart !== null && rangeEnd !== null
      ? Math.abs(
          allFreqPts.filter((p) => p.time >= Math.min(rangeStart, rangeEnd)).length -
            allFreqPts.filter((p) => p.time > Math.max(rangeStart, rangeEnd)).length
        )
      : 0;

  return (
    <>
      {showToolbar && (
        <div className="chart-toolbar">
          <div className="chart-toolbar-l">
            {rangeStart !== null && rangeEnd !== null && (
              <span className="range-badge">
                <span className="dot" />
                选区 {fmtTimeShort(Math.min(rangeStart, rangeEnd))} →{' '}
                {fmtTimeShort(Math.max(rangeStart, rangeEnd))} ({rangeCount.toLocaleString()}点)
              </span>
            )}
          </div>
          <div className="chart-toolbar-r">
            {rangeStart !== null && rangeEnd !== null && (
              <>
                <button className="btn btn-sm" onClick={onClearRange}>
                  清除选区
                </button>
                <button
                  className="btn btn-p btn-sm"
                  onClick={() => {
                    const rs = Math.min(rangeStart, rangeEnd);
                    const re = Math.max(rangeStart, rangeEnd);
                    const idxS = allFreqPts.findIndex((p) => p.time >= rs);
                    const idxE = (() => {
                      for (let i = allFreqPts.length - 1; i >= 0; i--) {
                        if (allFreqPts[i].time <= re) return i;
                      }
                      return 0;
                    })();
                    exportCSV(
                      allFreqPts.slice(idxS, idxE + 1),
                      freqMode === 'low-gap' ? 'low_level_gap_range.csv' : 'frequency_range.csv',
                      freqMode === 'low-gap'
                    );
                  }}
                >
                  导出选区
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="chart-wrap">
        <ReactChart
          ref={chartRef as never}
          type="scatter"
          data={data}
          options={options}
          plugins={[viewSyncPlugin]}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </div>
    </>
  );
}

function exportCSV(pts: FreqPoint[], filename: string, lowGap = false) {
  if (!pts.length) return;
  const parts: string[] = [lowGap ? 'time_s,low_level_gap_s\n' : 'time_s,frequency_hz\n'];
  for (const p of pts) {
    parts.push(p.time.toPrecision(10) + ',' + p.freq.toPrecision(10) + '\n');
  }
  const blob = new Blob(parts, { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
