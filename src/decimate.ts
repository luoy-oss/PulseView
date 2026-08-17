import type { FreqPoint, DerivPoint } from './types';

export interface XYPoint {
  x: number;
  y: number;
  period?: number;
  dutyCycle?: number;
}

export interface ViewRange {
  min: number;
  max: number;
}

// 第一个 time >= t 的下标
function lowerBoundTime(pts: Array<{ time: number }>, t: number): number {
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// 最后一个 time <= t 的下标
function upperBoundTime(pts: Array<{ time: number }>, t: number): number {
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].time <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function toFreqXY(p: FreqPoint): XYPoint {
  return { x: p.time, y: p.freq, period: p.period, dutyCycle: p.dutyCycle };
}

function toDerivXY(p: DerivPoint): XYPoint {
  return { x: p.time, y: p.value };
}

/**
 * 构建当前可见时间窗口内用于渲染的数据点（通用实现）。
 * 可见点数超过渲染阈值时，按像素列做 min/max 抽稀，
 * 每个像素列保留该列纵坐标最小值与最大值两个点，包络形状与原图一致。
 */
function buildVisibleCore<T extends { time: number }>(
  pts: T[],
  getValue: (p: T) => number,
  toPoint: (p: T) => XYPoint,
  viewRange: ViewRange | null,
  widthPx: number
): XYPoint[] {
  const n = pts.length;
  if (n === 0) return [];

  let lo = 0;
  let hi = n - 1;
  if (viewRange) {
    lo = lowerBoundTime(pts, viewRange.min);
    hi = upperBoundTime(pts, viewRange.max);
    if (lo > hi) {
      // 可见区间与数据无交集（如更换文件后旧区间失效），回退到全量
      lo = 0;
      hi = n - 1;
    }
  }

  const count = hi - lo + 1;
  const width = Math.max(1, Math.round(widthPx));
  // 每个像素列最多渲染 2 个点，低于该阈值时直接使用原始点
  const maxRender = Math.max(width * 2, 2000);
  if (count <= maxRender) {
    const out = new Array<XYPoint>(count);
    for (let i = 0; i < count; i++) {
      out[i] = toPoint(pts[lo + i]);
    }
    return out;
  }

  const bucketCount = width;
  const t0 = pts[lo].time;
  const t1 = pts[hi].time;
  const span = t1 - t0;
  if (span <= 0) return [toPoint(pts[lo]), toPoint(pts[hi])];

  const out: XYPoint[] = [];
  let bMin = pts[lo];
  let bMax = pts[lo];
  let curBucket = 0;
  const flush = () => {
    const first = bMin.time <= bMax.time ? bMin : bMax;
    const second = bMin.time <= bMax.time ? bMax : bMin;
    out.push(toPoint(first), toPoint(second));
  };
  for (let i = lo; i <= hi; i++) {
    const p = pts[i];
    const b = Math.min(
      bucketCount - 1,
      Math.floor(((p.time - t0) / span) * bucketCount)
    );
    if (b !== curBucket) {
      flush();
      curBucket = b;
      bMin = p;
      bMax = p;
    } else {
      if (getValue(p) < getValue(bMin)) bMin = p;
      if (getValue(p) > getValue(bMax)) bMax = p;
    }
  }
  flush();
  return out;
}

export function buildVisibleData(
  pts: FreqPoint[],
  viewRange: ViewRange | null,
  widthPx: number
): XYPoint[] {
  return buildVisibleCore(pts, (p) => p.freq, toFreqXY, viewRange, widthPx);
}

export function buildVisibleSeries(
  pts: DerivPoint[],
  viewRange: ViewRange | null,
  widthPx: number
): XYPoint[] {
  return buildVisibleCore(pts, (p) => p.value, toDerivXY, viewRange, widthPx);
}
