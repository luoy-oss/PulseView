import type { FreqPoint, AccelSegment } from './types';

// 查找第 k 小元素（原地修改数组），用于计算中位数
function quickselect(arr: number[], k: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const pivot = arr[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (arr[i] < pivot) i++;
      while (arr[j] > pivot) j--;
      if (i <= j) {
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return arr[k];
  }
  return arr[k];
}

export function computeFreqFromTransitions(
  transTimes: Float64Array,
  transLevels: Int8Array,
  format: 'vcd' | 'txt'
): FreqPoint[] {
  if (!transTimes || transTimes.length < 3) return [];

  // 每个高电平脉冲生成一个频率点：跳变对 [t[i], t[i+1]] 为高电平
  // （transLevels[i] === 1）时，其持续时间 dt 就是脉冲宽度，
  // freq = 1/(2×dt)，与 PulseView 逻辑分析仪的测量一致。
  // 低电平区间（脉冲间隔/停歇）不生成频率点 —— 一个脉冲就是一个
  // 数据点，避免把每个脉冲拆成两个半周期点造成阶梯状曲线。
  // 初始状态/信号停歇产生的异常大间隔识别为间隙并跳过。
  const dts: number[] = [];
  for (let i = 1; i < transTimes.length; i++) {
    const dt = transTimes[i] - transTimes[i - 1];
    if (dt > 0) dts.push(dt);
  }
  if (dts.length < 2) return [];

  // 间隙阈值 = 跳变间隔中位数的 50 倍
  const gapThreshold = quickselect(dts, dts.length >> 1) * 50;

  const pts: FreqPoint[] = [];
  for (let i = 0; i < transTimes.length - 1; i++) {
    if (transLevels[i] !== 1) continue; // 只处理高电平（脉冲）跳变对
    const dt = transTimes[i + 1] - transTimes[i];
    if (dt <= 0 || dt > gapThreshold) continue;
    pts.push({
      time: (transTimes[i] + transTimes[i + 1]) / 2, // 脉冲中点
      freq: 1 / (2 * dt),
      period: dt, // 脉冲持续时间（高电平宽度）
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

// 收敛式多尺度波动分段（无参数）：
// 匀速段在任意时间窗口内频率波动（极差）都很小，加速/减速段波动大。
// 算法自行多轮验证：滑动窗口从大尺度开始逐轮减半重分段，每轮验证类型结构，
// 两轮结构一致即收敛（取更细的一轮）；随后扩充合并噪声碎段。
// 收敛尺度由信号自身决定（短平台需要小尺度才能分辨），不依赖外部参数。
export function detectAccelSegments(pts: FreqPoint[]): AccelSegment[] {
  const n = pts.length;
  if (n < 3) return [];

  // 停歇间隙阈值 = 中位时间间隔 × 50
  const dts: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = pts[i].time - pts[i - 1].time;
    if (d > 0) dts.push(d);
  }
  const medianGap = dts.length > 1 ? quickselect(dts.slice(), dts.length >> 1) : 0;
  const gapThreshold = medianGap * 50;

  // 轻量平滑，仅用于检测（不改变显示数据）
  const sm: number[] = new Array(n);
  const half = 2;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      s += pts[j].freq;
      c++;
    }
    sm[i] = s / c;
  }

  // 滑动窗口频率极差（单调队列 O(n)）
  const windowRange = (winDt: number): Float64Array => {
    const range = new Float64Array(n);
    const maxQ = new Int32Array(n);
    const minQ = new Int32Array(n);
    let hMax = 0;
    let tMax = 0;
    let hMin = 0;
    let tMin = 0;
    let left = 0;
    for (let right = 0; right < n; right++) {
      while (hMax < tMax && sm[maxQ[tMax - 1]] <= sm[right]) tMax--;
      maxQ[tMax++] = right;
      while (hMin < tMin && sm[minQ[tMin - 1]] >= sm[right]) tMin--;
      minQ[tMin++] = right;
      while (left <= right && pts[right].time - pts[left].time > winDt) left++;
      while (hMax < tMax && maxQ[hMax] < left) hMax++;
      while (hMin < tMin && minQ[hMin] < left) hMin++;
      range[right] = sm[maxQ[hMax]] - sm[minQ[hMin]];
    }
    return range;
  };

  // 自适应波动阈值（相对波动 = 极差/频率，平台噪声 ∝ 频率；p10×20，下限 1.5%）
  const relThreshold = (range: Float64Array): number => {
    const sample: number[] = [];
    const step = Math.max(1, Math.floor(n / 8000));
    for (let i = 0; i < n; i += step) {
      sample.push(sm[i] > 0 ? range[i] / sm[i] : 0);
    }
    sample.sort((a, b) => a - b);
    return Math.max(sample[Math.floor(sample.length * 0.1)] * 20, 0.015);
  };

  type RawSeg = { type: 'chg' | 'const'; start: number; end: number };

  // 单尺度分段：波动超阈值 → 变化段，否则匀速段；按停歇间隙切分
  const segmentAtScale = (scale: number): RawSeg[] => {
    const range = windowRange(scale);
    const T = relThreshold(range);
    const st = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      st[i] = sm[i] > 0 && range[i] / sm[i] > T ? 1 : 0;
    }
    const segs: RawSeg[] = [];
    let s = 0;
    for (let i = 0; i < n; i++) {
      if (st[i] !== st[s]) {
        segs.push({ type: st[s] ? 'chg' : 'const', start: s, end: i - 1 });
        s = i;
      }
    }
    segs.push({ type: st[s] ? 'chg' : 'const', start: s, end: n - 1 });
    for (let i = 1; i < n; i++) {
      if (pts[i].time - pts[i - 1].time > gapThreshold) {
        for (const seg of segs) {
          if (seg.start < i && i <= seg.end) {
            segs.push({ type: seg.type, start: i, end: seg.end });
            seg.end = i - 1;
            break;
          }
        }
      }
    }
    segs.sort((a, b) => a.start - b.start);
    return segs;
  };

  // ---- 多轮收敛：尺度从大逐轮减半，类型结构连续两轮一致即收敛 ----
  const totalDur = pts[n - 1].time - pts[0].time;
  const maxScale = Math.max(totalDur / 4, gapThreshold * 16);
  const minScale = Math.max(medianGap * 40, totalDur / 2048);
  let scale = maxScale;
  let prevStructure = '';
  let result: RawSeg[] = segmentAtScale(scale);
  while (scale > minScale) {
    scale = Math.max(scale / 2, minScale);
    const segs = segmentAtScale(scale);
    const structure = segs.map((sg) => sg.type).join('|');
    if (structure === prevStructure) {
      result = segs; // 收敛：取更细的一轮
      break;
    }
    result = segs;
    prevStructure = structure;
  }

  // ---- 扩充：合并相邻同类型段 ----
  const merged: RawSeg[] = [];
  for (const seg of result) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) last.end = seg.end;
    else merged.push(seg);
  }

  // ---- 扩充：噪声碎段（点数少且时长极短）并入相邻段 ----
  let changed = true;
  while (changed && merged.length > 1) {
    changed = false;
    for (let k = 0; k < merged.length; k++) {
      const dur = pts[merged[k].end].time - pts[merged[k].start].time;
      if (merged[k].end - merged[k].start + 1 < 5 && dur < gapThreshold * 8) {
        if (k === 0) {
          merged[1].start = merged[0].start;
          merged.splice(0, 1);
        } else {
          merged[k - 1].end = merged[k].end;
          merged.splice(k, 1);
        }
        changed = true;
        break;
      }
    }
  }

  // ---- 方向：按段首尾频率差判定；变化过小降级为匀速 ----
  type DirSeg = { type: 'accel' | 'decel' | 'const'; start: number; end: number };
  const final: DirSeg[] = [];
  for (const seg of merged) {
    if (seg.type === 'const') {
      final.push({ type: 'const', start: seg.start, end: seg.end });
      continue;
    }
    const dfSeg = pts[seg.end].freq - pts[seg.start].freq;
    if (Math.abs(dfSeg) < sm[seg.start] * 0.005) {
      final.push({ type: 'const', start: seg.start, end: seg.end });
    } else {
      final.push({ type: dfSeg > 0 ? 'accel' : 'decel', start: seg.start, end: seg.end });
    }
  }

  // 方向分配后再次合并相邻同类型段
  const resultFinal: DirSeg[] = [];
  for (const seg of final) {
    const last = resultFinal[resultFinal.length - 1];
    if (last && last.type === seg.type) last.end = seg.end;
    else resultFinal.push(seg);
  }

  return resultFinal.map(({ type, start, end }) => {
    const st = pts[start].time;
    const et = pts[end].time;
    const duration = et - st;
    return {
      type,
      startTime: st,
      endTime: et,
      duration,
      startFreq: pts[start].freq,
      endFreq: pts[end].freq,
      rate: duration > 0 ? (pts[end].freq - pts[start].freq) / duration : 0,
    };
  });
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
