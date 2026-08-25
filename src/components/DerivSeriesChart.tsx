import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  Chart,
  ChartData,
  ChartOptions,
  ScatterDataPoint,
} from 'chart.js/auto';
import { Chart as ReactChart } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import annotationPlugin from 'chartjs-plugin-annotation';
import { DerivPoint } from '../types';
import { fmtTime, fmtTimeShort, fmtRateShort } from '../utils';
import { buildVisibleSeries, hasPointsInRange, ViewRange } from '../decimate';
import { ThemeId, THEME_COLORS } from '../theme';

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
  theme: ThemeId;
}

// 加速度图：与频率图共享时间轴缩放/平移与光标，
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
  theme,
}: Props) {
  const colors = THEME_COLORS[theme];
  const chartRef = useRef<Chart<'scatter', ScatterDataPoint[]> | null>(null);
  const [chartWidth, setChartWidth] = useState(1200);

  // Publish the shared range only after a gesture completes, avoiding a
  // Chart.js -> React -> Chart.js feedback loop on every zoom frame.
  const syncViewRange = useCallback((chart: Chart<'scatter', ScatterDataPoint[]>) => {
    const x = chart.scales.x;
    if (typeof x.min === 'number' && typeof x.max === 'number') {
      if (!hasPointsInRange(pts, { min: x.min, max: x.max })) {
        chart.resetZoom();
        onViewRangeChange(null);
        return;
      }
      onViewRangeChange({ min: x.min, max: x.max });
    }
  }, [onViewRangeChange, pts]);

  useEffect(() => {
    const doReset = () => {
      const chart = chartRef.current;
      if (chart) chart.resetZoom();
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
          parsing: false,
          normalized: true,
          borderColor: color,
          backgroundColor: hexToRgba(color, 0.06),
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 1.5,
          showLine: true,
          tension: 0,
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
        borderColor: colors.teal,
        borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: true,
          content: 'A',
          position: 'start',
          backgroundColor: colors.teal,
          color: colors.bg,
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
        borderColor: colors.green,
        borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: true,
          content: 'B',
          position: 'start',
          backgroundColor: colors.green,
          color: colors.bg,
          font: { family: 'DM Sans', size: 10, weight: 700 },
          padding: { x: 5, y: 2 },
          borderRadius: 3,
        },
      };
    }

    return annos;
  }, [cursorA, cursorB, pts, colors]);

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
            color: colors.text3,
            font: { family: 'DM Sans', size: 11, weight: 600 },
            padding: { top: 6 },
          },
          ticks: {
            color: colors.text3,
            font: { family: 'Source Code Pro', size: 10 },
            callback: (v) => fmtTimeShort(v as number),
            maxTicksLimit: 12,
          },
          grid: { color: `${colors.border}99`, lineWidth: 0.8 },
          border: { color: `${colors.border}cc` },
        },
        y: {
          title: {
            display: true,
            text: yTitle,
            color: colors.text3,
            font: { family: 'DM Sans', size: 11, weight: 600 },
            padding: { bottom: 6 },
          },
          ticks: {
            color: colors.text3,
            font: { family: 'Source Code Pro', size: 10 },
            callback: (v) => fmtRateShort(v as number),
            maxTicksLimit: 7,
          },
          grid: { color: `${colors.border}99`, lineWidth: 0.8 },
          border: { color: `${colors.border}cc` },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltip,
          titleColor: colors.tooltipTitle,
          bodyColor: colors.tooltipBody,
          borderColor: `${colors.accent}26`,
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
          // Do not allow an empty x viewport: Chart.js nearest interaction can
          // otherwise inspect a point element while its options are unset.
          pan: {
            enabled: true,
            mode: 'x',
            onPanComplete: ({ chart }) => syncViewRange(chart as Chart<'scatter', ScatterDataPoint[]>),
          },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            onZoomComplete: ({ chart }) => syncViewRange(chart as Chart<'scatter', ScatterDataPoint[]>),
          },
        },
        annotation: {
          annotations: buildAnnotations() as Record<string, never>,
        },
      },
      onClick: handleChartClick as (evt: unknown) => void,
    }),
    [viewRange, handleChartClick, buildAnnotations, formatValue, yTitle, colors, syncViewRange]
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
