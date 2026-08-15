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
import { DerivPoint } from '../types';
import { fmtTime, fmtTimeShort, fmtRateShort } from '../utils';
import { buildVisibleSeries, ViewRange } from '../decimate';

Chart.register(zoomPlugin, annotationPlugin);

interface Props {
  pts: DerivPoint[];
  color: string;
  yTitle: string;
  viewRange: ViewRange | null;
  onViewRangeChange: (r: ViewRange | null) => void;
  onResetZoomReady?: (fn: () => void) => void;
  cursorA: number | null;
  cursorB: number | null;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
  formatValue: (v: number) => string;
}

// 导数图（加速度 / 加加速度）：与频率图共享时间轴缩放/平移与光标，
// 仅支持缩放、平移与光标放置，不参与框选与加减速分段标注。
export function DerivSeriesChart({
  pts,
  color,
  yTitle,
  viewRange,
  onViewRangeChange,
  onResetZoomReady,
  cursorA,
  cursorB,
  onCursorChange,
  formatValue,
}: Props) {
  const chartRef = useRef<Chart<'scatter', ScatterDataPoint[]> | null>(null);
  const [chartWidth, setChartWidth] = useState(1200);

  // 与 FreqChart 相同的可见范围同步机制：无实质变化时不通知父级，
  // 避免受控状态下的循环重渲染
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

  // 数据变化（重新载入文件 / 切换频率模式）时清空本地判等缓存，
  // 视图重置由父级（DerivView）统一触发
  useEffect(() => {
    lastViewRef.current = null;
  }, [pts]);

  useEffect(() => {
    const doReset = () => {
      const chart = chartRef.current;
      if (chart) chart.resetZoom();
      lastViewRef.current = null;
      onViewRangeChange(null);
    };
    if (onResetZoomReady) onResetZoomReady(doReset);
  }, [onResetZoomReady, onViewRangeChange]);

  const visibleData = useMemo(
    () => buildVisibleSeries(pts, viewRange, chartWidth),
    [pts, viewRange, chartWidth]
  );

  const data: ChartData<'scatter', ScatterDataPoint[]> = useMemo(
    () => ({
      datasets: [
        {
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.06),
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 1.5,
          showLine: true,
          tension: 0.2,
          fill: true,
          data: visibleData,
        },
      ],
    }),
    [visibleData, color]
  );

  const buildAnnotations = useCallback(() => {
    const annos: Record<string, unknown> = {};

    if (cursorA !== null && pts[cursorA]) {
      annos.cursorA = {
        type: 'line',
        xMin: pts[cursorA].time,
        xMax: pts[cursorA].time,
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

    if (cursorB !== null && pts[cursorB]) {
      annos.cursorB = {
        type: 'line',
        xMin: pts[cursorB].time,
        xMax: pts[cursorB].time,
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

    return annos;
  }, [cursorA, cursorB, pts]);

  const handleChartClick = useCallback(
    (evt: { native?: Event }) => {
      const chart = chartRef.current;
      if (!chart || pts.length === 0) return;

      const native = evt.native as MouseEvent | undefined;
      const rect = chart.canvas.getBoundingClientRect();
      const cx = (native?.clientX ?? 0) - rect.left;
      const dataX = chart.scales.x.getValueForPixel(cx);
      if (dataX === undefined) return;

      let lo = 0;
      let hi = pts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].time < dataX) lo = mid + 1;
        else hi = mid;
      }
      if (
        lo > 0 &&
        Math.abs(pts[lo].time - dataX) > Math.abs(pts[lo - 1].time - dataX)
      )
        lo--;

      if (native?.ctrlKey || native?.metaKey) onCursorChange('B', lo);
      else onCursorChange('A', lo);
    },
    [pts, onCursorChange]
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
            padding: { top: 6 },
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
            text: yTitle,
            color: '#5c5668',
            font: { family: 'DM Sans', size: 11, weight: 600 },
            padding: { bottom: 6 },
          },
          ticks: {
            color: '#5c5668',
            font: { family: 'Source Code Pro', size: 10 },
            callback: (v) => fmtRateShort(v as number),
            maxTicksLimit: 7,
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
            label: (item) => yTitle + '  ' + formatValue(item.parsed.y ?? 0),
          },
        },
        zoom: {
          pan: { enabled: true, mode: 'x' },
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
    [viewRange, handleChartClick, buildAnnotations, formatValue, yTitle]
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

  return (
    <div className="chart-wrap">
      <ReactChart
        ref={chartRef as never}
        type="scatter"
        data={data}
        options={options}
        plugins={[viewSyncPlugin]}
      />
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
