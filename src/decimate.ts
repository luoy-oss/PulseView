import type { FreqPoint, DerivPoint } from './types';

export interface XYPoint {
  x: number;
  y: number;
  period?: number;
  dutyCycle?: number;
}

export interface VisibleEnvelope {
  lower: XYPoint[];
  upper: XYPoint[];
}

export type RepresentativeMode = 'center' | 'first' | 'last' | 'turns';

export interface ViewRange {
  min: number;
  max: number;
}

/** Returns a zoom range that always contains source data. */
export function normalizeViewRange<T extends { time: number }>(
  pts: T[],
  viewRange: ViewRange | null
): ViewRange | null {
  if (pts.length < 2 || !viewRange) return null;

  const domainMin = pts[0].time;
  const domainMax = pts[pts.length - 1].time;
  const domainSpan = domainMax - domainMin;
  if (!(domainSpan > 0)) return null;

  const requestedMin = Math.min(viewRange.min, viewRange.max);
  const requestedMax = Math.max(viewRange.min, viewRange.max);
  if (requestedMax < domainMin || requestedMin > domainMax) return null;

  let min = Math.max(domainMin, requestedMin);
  let max = Math.min(domainMax, requestedMax);
  let minimumRange = domainSpan;
  for (let i = 1; i < pts.length; i++) {
    const gap = pts[i].time - pts[i - 1].time;
    if (gap > 0 && gap < minimumRange) minimumRange = gap;
  }

  if (max - min < minimumRange) {
    const center = (min + max) / 2;
    min = center - minimumRange / 2;
    max = center + minimumRange / 2;
    if (min < domainMin) {
      min = domainMin;
      max = Math.min(domainMax, min + minimumRange);
    } else if (max > domainMax) {
      max = domainMax;
      min = Math.max(domainMin, max - minimumRange);
    }
  }
  return { min, max };
}

export function getMinimumTimeRange<T extends { time: number }>(pts: T[]): number {
  if (pts.length < 2) return 0;
  const span = pts[pts.length - 1].time - pts[0].time;
  if (!(span > 0)) return 0;
  let minimumRange = span;
  for (let i = 1; i < pts.length; i++) {
    const gap = pts[i].time - pts[i - 1].time;
    if (gap > 0 && gap < minimumRange) minimumRange = gap;
  }
  return minimumRange;
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
interface ExtremumIndex<T> {
  size: number;
  min: Int32Array;
  max: Int32Array;
  values: T[];
  getValue: (p: T) => number;
}

const extremumIndexes = new WeakMap<object, Map<string, ExtremumIndex<unknown>>>();

function getExtremumIndex<T extends { time: number }>(
  pts: T[],
  key: string,
  getValue: (p: T) => number
): ExtremumIndex<T> {
  let bySeries = extremumIndexes.get(pts);
  if (!bySeries) {
    bySeries = new Map();
    extremumIndexes.set(pts, bySeries);
  }

  const cached = bySeries.get(key) as ExtremumIndex<T> | undefined;
  if (cached) return cached;

  let size = 1;
  while (size < pts.length) size <<= 1;
  const min = new Int32Array(size * 2);
  const max = new Int32Array(size * 2);
  for (let i = 0; i < size; i++) {
    const index = size + i;
    min[index] = i < pts.length ? i : -1;
    max[index] = i < pts.length ? i : -1;
  }
  for (let node = size - 1; node > 0; node--) {
    const leftMin = min[node * 2];
    const rightMin = min[node * 2 + 1];
    min[node] = rightMin < 0 || (leftMin >= 0 && getValue(pts[leftMin]) <= getValue(pts[rightMin]))
      ? leftMin
      : rightMin;
    const leftMax = max[node * 2];
    const rightMax = max[node * 2 + 1];
    max[node] = rightMax < 0 || (leftMax >= 0 && getValue(pts[leftMax]) >= getValue(pts[rightMax]))
      ? leftMax
      : rightMax;
  }

  const index = { size, min, max, values: pts, getValue } as ExtremumIndex<T>;
  bySeries.set(key, index as ExtremumIndex<unknown>);
  return index;
}

function queryExtrema<T>(index: ExtremumIndex<T>, start: number, end: number): [number, number] {
  let lo = start + index.size;
  let hi = end + index.size + 1;
  let minIndex = -1;
  let maxIndex = -1;
  while (lo < hi) {
    if (lo & 1) {
      const candidate = index.min[lo++];
      if (candidate >= 0 && (minIndex < 0 || index.getValue(index.values[candidate]) < index.getValue(index.values[minIndex]))) minIndex = candidate;
      const maxCandidate = index.max[lo - 1];
      if (maxCandidate >= 0 && (maxIndex < 0 || index.getValue(index.values[maxCandidate]) > index.getValue(index.values[maxIndex]))) maxIndex = maxCandidate;
    }
    if (hi & 1) {
      const candidate = index.min[--hi];
      if (candidate >= 0 && (minIndex < 0 || index.getValue(index.values[candidate]) < index.getValue(index.values[minIndex]))) minIndex = candidate;
      const maxCandidate = index.max[hi];
      if (maxCandidate >= 0 && (maxIndex < 0 || index.getValue(index.values[maxCandidate]) > index.getValue(index.values[maxIndex]))) maxIndex = maxCandidate;
    }
    lo >>= 1;
    hi >>= 1;
  }
  return [minIndex, maxIndex];
}

// A dense constant section is already a horizontal screen shape. Keep its
// endpoints, but do not hand Chart.js one vertex for every source bucket.
function collapseHorizontalRuns(points: XYPoint[]): XYPoint[] {
  if (points.length < 3) return points;

  const out: XYPoint[] = [points[0]];
  let runY = points[0].y;
  let runEnd = points[0];
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    if (point.y === runY) {
      runEnd = point;
      continue;
    }
    if (out[out.length - 1] !== runEnd) out.push(runEnd);
    out.push(point);
    runY = point.y;
    runEnd = point;
  }
  if (out[out.length - 1] !== runEnd) out.push(runEnd);
  return out;
}

function buildVisibleCore<T extends { time: number }>(
  pts: T[],
  seriesKey: string,
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
    return collapseHorizontalRuns(out);
  }

  const bucketCount = width;
  const t0 = pts[lo].time;
  const t1 = pts[hi].time;
  const span = t1 - t0;
  if (span <= 0) return [toPoint(pts[lo]), toPoint(pts[hi])];

  const index = getExtremumIndex(pts, seriesKey, getValue);
  const out: XYPoint[] = new Array(bucketCount * 2);
  let outIndex = 0;
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const bucketStart = t0 + (span * bucket) / bucketCount;
    const bucketEnd = bucket === bucketCount - 1
      ? t1
      : t0 + (span * (bucket + 1)) / bucketCount;
    const bucketLo = Math.max(lo, lowerBoundTime(pts, bucketStart));
    const bucketHi = Math.min(hi, upperBoundTime(pts, bucketEnd));
    if (bucketLo > bucketHi) continue;
    const [minIndex, maxIndex] = queryExtrema(index, bucketLo, bucketHi);
    const first = pts[minIndex].time <= pts[maxIndex].time ? pts[minIndex] : pts[maxIndex];
    const second = first === pts[minIndex] ? pts[maxIndex] : pts[minIndex];
    out[outIndex++] = toPoint(first);
    out[outIndex++] = toPoint(second);
  }
  out.length = outIndex;
  return collapseHorizontalRuns([
    toPoint(pts[lo]),
    ...out,
    toPoint(pts[hi]),
  ]);
}

function buildEnvelopeCore<T extends { time: number }>(
  pts: T[],
  getValue: (p: T) => number,
  toPoint: (p: T) => XYPoint,
  viewRange: ViewRange | null,
  widthPx: number
): VisibleEnvelope {
  if (pts.length === 0) return { lower: [], upper: [] };

  let lo = 0;
  let hi = pts.length - 1;
  if (viewRange) {
    lo = lowerBoundTime(pts, viewRange.min);
    hi = upperBoundTime(pts, viewRange.max);
    if (lo > hi) {
      lo = 0;
      hi = pts.length - 1;
    }
  }

  const count = hi - lo + 1;
  const width = Math.max(1, Math.round(widthPx));
  const maxRender = Math.max(width * 2, 2000);
  if (count <= maxRender) {
    const raw = new Array<XYPoint>(count);
    for (let i = 0; i < count; i++) raw[i] = toPoint(pts[lo + i]);
    return { lower: raw, upper: raw };
  }

  const t0 = pts[lo].time;
  const t1 = pts[hi].time;
  const span = t1 - t0;
  if (span <= 0) {
    const point = toPoint(pts[lo]);
    return { lower: [point], upper: [point] };
  }

  const index = getExtremumIndex(pts, 'envelope', getValue);
  const lower: XYPoint[] = [];
  const upper: XYPoint[] = [];
  for (let bucket = 0; bucket < width; bucket++) {
    const bucketStart = t0 + (span * bucket) / width;
    const bucketEnd = bucket === width - 1 ? t1 : t0 + (span * (bucket + 1)) / width;
    const bucketLo = Math.max(lo, lowerBoundTime(pts, bucketStart));
    const bucketHi = Math.min(hi, upperBoundTime(pts, bucketEnd));
    if (bucketLo > bucketHi) continue;
    const [minIndex, maxIndex] = queryExtrema(index, bucketLo, bucketHi);
    lower.push(toPoint(pts[minIndex]));
    upper.push(toPoint(pts[maxIndex]));
  }
  return { lower, upper };
}

export function buildVisibleData(
  pts: FreqPoint[],
  viewRange: ViewRange | null,
  widthPx: number
): XYPoint[] {
  return buildVisibleCore(pts, 'freq', (p) => p.freq, toFreqXY, viewRange, widthPx);
}

export function buildVisibleSeries(
  pts: DerivPoint[],
  viewRange: ViewRange | null,
  widthPx: number
): XYPoint[] {
  return buildVisibleCore(pts, 'deriv', (p) => p.value, toDerivXY, viewRange, widthPx);
}

export function buildVisibleEnvelope(
  pts: FreqPoint[],
  viewRange: ViewRange | null,
  widthPx: number
): VisibleEnvelope {
  return buildEnvelopeCore(pts, (p) => p.freq, toFreqXY, viewRange, widthPx);
}

/** Selects one real source point per screen bucket, never synthesizing values. */
export function buildVisibleRepresentative(
  pts: FreqPoint[],
  viewRange: ViewRange | null,
  widthPx: number,
  mode: RepresentativeMode
): XYPoint[] {
  if (pts.length === 0) return [];
  let lo = 0;
  let hi = pts.length - 1;
  if (viewRange) {
    lo = lowerBoundTime(pts, viewRange.min);
    hi = upperBoundTime(pts, viewRange.max);
    if (lo > hi) { lo = 0; hi = pts.length - 1; }
  }
  const count = hi - lo + 1;
  const width = Math.max(1, Math.round(widthPx));
  if (count <= Math.max(width * 2, 2000)) {
    const raw = new Array<XYPoint>(count);
    for (let i = 0; i < count; i++) raw[i] = toFreqXY(pts[lo + i]);
    return raw;
  }

  const t0 = pts[lo].time;
  const span = pts[hi].time - t0;
  if (span <= 0) return [toFreqXY(pts[lo])];
  const out: XYPoint[] = [];
  let previousIndex = lo;
  for (let bucket = 0; bucket < width; bucket++) {
    const start = t0 + (span * bucket) / width;
    const end = bucket === width - 1 ? pts[hi].time : t0 + (span * (bucket + 1)) / width;
    const startIndex = Math.max(lo, lowerBoundTime(pts, start));
    const endIndex = Math.min(hi, upperBoundTime(pts, end));
    if (startIndex > endIndex) continue;
    let selected = startIndex;
    if (mode === 'center') selected = (startIndex + endIndex) >> 1;
    else if (mode === 'last') selected = endIndex;
    else if (mode === 'turns' && endIndex - startIndex >= 2) {
      let bestScore = -1;
      for (let i = startIndex; i <= endIndex; i++) {
        const left = pts[Math.max(lo, i - 1)].freq;
        const right = pts[Math.min(hi, i + 1)].freq;
        const score = Math.abs(2 * pts[i].freq - left - right);
        if (score > bestScore) { bestScore = score; selected = i; }
      }
    }
    if (selected !== previousIndex || out.length === 0) {
      out.push(toFreqXY(pts[selected]));
      previousIndex = selected;
    }
  }
  if (out.length === 0 || out[out.length - 1].x !== pts[hi].time) out.push(toFreqXY(pts[hi]));
  return out;
}
