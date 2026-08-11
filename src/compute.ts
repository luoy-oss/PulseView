import { FreqPoint, AccelSegment } from './types';

const MAX_DISPLAY_PTS = 50000;
const GAP_THRESHOLD = 0.01; // 10ms gap -> zero Hz marker

export function computeFreqFromEdges(
  risingEdges: Float64Array,
  fallingEdges: Float64Array,
  format: 'vcd' | 'txt'
): FreqPoint[] {
  if (!risingEdges || risingEdges.length < 1) return [];

  if (format === 'vcd') {
    return computeFromRisingEdges(risingEdges);
  }
  return computeFromPulseWidth(risingEdges, fallingEdges);
}

function computeFromRisingEdges(risingEdges: Float64Array): FreqPoint[] {
  if (risingEdges.length < 2) return [];
  const pts: FreqPoint[] = [];
  for (let i = 0; i < risingEdges.length - 1; i++) {
    const period = risingEdges[i + 1] - risingEdges[i];
    if (period <= 0) continue;
    pts.push({
      time: (risingEdges[i] + risingEdges[i + 1]) / 2,
      freq: 1 / period,
      period,
    });
  }
  return pts;
}

function computeFromPulseWidth(
  risingEdges: Float64Array,
  fallingEdges: Float64Array
): FreqPoint[] {
  if (risingEdges.length < 1 || fallingEdges.length < 1) return [];

  const pts: FreqPoint[] = [];
  let fallIdx = 0;

  for (let i = 0; i < risingEdges.length; i++) {
    const riseTime = risingEdges[i];
    while (fallIdx < fallingEdges.length && fallingEdges[fallIdx] <= riseTime) {
      fallIdx++;
    }
    if (fallIdx >= fallingEdges.length) break;

    const fallTime = fallingEdges[fallIdx];
    const pulseWidth = fallTime - riseTime;
    if (pulseWidth <= 0) continue;

    const freq = 1 / (2 * pulseWidth);
    const center = (riseTime + fallTime) / 2;
    pts.push({ time: center, freq, period: 2 * pulseWidth });
  }

  // Add zero-Hz markers for idle gaps
  const withZeros: FreqPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 && pts[i].time > GAP_THRESHOLD) {
      withZeros.push({ time: 0, freq: 0 });
    }
    withZeros.push(pts[i]);
    if (i < pts.length - 1) {
      const gap = pts[i + 1].time - (pts[i].time + (pts[i].period || 0) / 2);
      if (gap > GAP_THRESHOLD) {
        const gapCenter = pts[i].time + (pts[i].period || 0) / 2 + gap / 2;
        withZeros.push({ time: gapCenter, freq: 0 });
      }
    }
  }
  return withZeros;
}

export function applySmoothing(raw: FreqPoint[], win: number): FreqPoint[] {
  if (raw.length === 0) return [];
  const half = Math.floor(win / 2);
  const smoothed: FreqPoint[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(raw.length - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      sum += raw[j].freq;
      count++;
    }
    smoothed[i] = { time: raw[i].time, freq: sum / count, period: raw[i].period };
  }
  return smoothed;
}

export function downsample(pts: FreqPoint[], max = MAX_DISPLAY_PTS): FreqPoint[] {
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  const out: FreqPoint[] = [pts[0]];
  for (let i = 1; i < max - 1; i++) {
    out.push(pts[Math.floor(i * step)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function detectAccelSegments(
  pts: FreqPoint[],
  smoothWin: number,
  minChangeRatio: number
): AccelSegment[] {
  if (pts.length < 3) return [];

  // Smooth
  const out: { time: number; freq: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    let s = 0;
    let c = 0;
    for (
      let j = Math.max(0, i - smoothWin);
      j <= Math.min(pts.length - 1, i + smoothWin);
      j++
    ) {
      s += pts[j].freq;
      c++;
    }
    out.push({ time: pts[i].time, freq: s / c });
  }

  const segs: AccelSegment[] = [];
  let i = 0;
  while (i < out.length - 1) {
    let j = i + 1;
    let dir = 0;
    while (j < out.length) {
      const d = out[j].freq - out[i].freq;
      const dd = d > 0 ? 1 : d < 0 ? -1 : 0;
      if (dd === 0) {
        j++;
        continue;
      }
      if (dir === 0) dir = dd;
      else if (dd !== dir) break;
      j++;
    }
    if (dir !== 0 && j > i + 1) {
      const sf = out[i].freq;
      const ef = out[Math.min(j - 1, out.length - 1)].freq;
      const ratio = Math.abs(ef - sf) / Math.max(sf, 1e-10);
      if (ratio >= minChangeRatio) {
        const st = out[i].time;
        const et = out[Math.min(j - 1, out.length - 1)].time;
        const duration = et - st;
        segs.push({
          type: dir > 0 ? 'accel' : 'decel',
          startTime: st,
          endTime: et,
          duration,
          startFreq: sf,
          endFreq: ef,
          rate: duration > 0 ? (ef - sf) / duration : 0,
        });
      }
    }
    i = Math.max(j - 1, i + 1);
  }
  return segs;
}

export function computeStats(pts: FreqPoint[]): {
  min: number;
  max: number;
  avg: number;
  std: number;
  cv: number;
} | null {
  if (pts.length === 0) return null;
  let fmin = Infinity;
  let fmax = -Infinity;
  let fsum = 0;
  for (let i = 0; i < pts.length; i++) {
    const f = pts[i].freq;
    if (f < fmin) fmin = f;
    if (f > fmax) fmax = f;
    fsum += f;
  }
  const favg = fsum / pts.length;
  if (pts.length > 1) {
    let variance = 0;
    for (let i = 0; i < pts.length; i++) {
      variance += (pts[i].freq - favg) ** 2;
    }
    variance /= pts.length - 1;
    const std = Math.sqrt(variance);
    return { min: fmin, max: fmax, avg: favg, std, cv: (std / favg) * 100 };
  }
  return { min: fmin, max: fmax, avg: favg, std: 0, cv: 0 };
}

export function computeHistogramBins(
  freqs: number[],
  minBins = 10,
  maxBins = 80
): { labels: string[]; bins: number[] } | null {
  if (freqs.length === 0) return null;
  let fmin = Infinity;
  let fmax = -Infinity;
  for (const f of freqs) {
    if (f < fmin) fmin = f;
    if (f > fmax) fmax = f;
  }
  const range = fmax - fmin;
  if (range === 0) return null;

  const binCount = Math.max(
    minBins,
    Math.min(maxBins, Math.ceil(1 + 3.322 * Math.log10(freqs.length)))
  );
  const binW = range / binCount;
  const bins = new Array<number>(binCount).fill(0);
  const labels: string[] = [];
  for (let i = 0; i < binCount; i++) {
    const f = fmin + (i + 0.5) * binW;
    if (f >= 1e9) labels.push((f / 1e9).toFixed(2) + 'G');
    else if (f >= 1e6) labels.push((f / 1e6).toFixed(2) + 'M');
    else if (f >= 1e3) labels.push((f / 1e3).toFixed(2) + 'k');
    else labels.push(f.toFixed(2));
  }
  for (const f of freqs) {
    let idx = Math.floor((f - fmin) / binW);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx]++;
  }
  return { labels, bins };
}
