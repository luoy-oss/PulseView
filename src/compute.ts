import { FreqPoint, AccelSegment } from './types';

export function computeFreqFromTransitions(
  transTimes: Float64Array,
  transLevels: Int8Array,
  format: 'vcd' | 'txt'
): FreqPoint[] {
  if (!transTimes || transTimes.length < 3) return [];

  // 从所有跳变中提取上升沿，用连续上升沿计算频率
  // 这样每个完整周期（高电平+低电平）得到一个频率值
  const risingTimes: number[] = [];
  for (let i = 0; i < transLevels.length; i++) {
    if (transLevels[i] === 1) {
      risingTimes.push(transTimes[i]);
    }
  }

  if (risingTimes.length < 2) return [];

  const pts: FreqPoint[] = [];
  for (let i = 0; i < risingTimes.length - 1; i++) {
    const period = risingTimes[i + 1] - risingTimes[i];
    if (period <= 0) continue;
    pts.push({
      time: risingTimes[i + 1], // 频率点时间 = 第二个上升沿时刻
      freq: 1 / period,
      period,
    });
  }

  return pts;
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

export function detectAccelSegments(
  pts: FreqPoint[],
  smoothWin: number,
  minChangeRatio: number
): AccelSegment[] {
  if (pts.length < 3) return [];

  // Smooth for detection only (not for display)
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
