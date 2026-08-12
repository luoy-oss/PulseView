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

// 按 df（绝对频率差阈值，Hz）把频率曲线分为 加速/减速/匀速 三段。
// 对每个点，以 winTime（默认 100ms）为时间窗口计算窗口内频率累计变化：
// |Δf| <= df 视为匀速，Δf > df 为加速，Δf < -df 为减速；连续相同状态合并为段。
// 信号停歇（相邻点时间间隔异常大）会把曲线切成独立块，分段不跨停歇。
export function detectAccelSegments(
  pts: FreqPoint[],
  df: number,
  smoothWin = 5,
  winTime = 0.1
): AccelSegment[] {
  const n = pts.length;
  if (n < 3 || !(df > 0)) return [];

  // 停歇间隙阈值 = 中位时间间隔 × 50
  const dts: number[] = [];
  for (let i = 1; i < n; i++) {
    const dt = pts[i].time - pts[i - 1].time;
    if (dt > 0) dts.push(dt);
  }
  const gapThreshold =
    dts.length > 1 ? quickselect(dts.slice(), dts.length >> 1) * 50 : Infinity;

  // 轻量平滑，仅用于方向判定（不改变显示数据）
  const sm: number[] = new Array(n);
  const half = Math.floor(smoothWin / 2);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      s += pts[j].freq;
      c++;
    }
    sm[i] = s / c;
  }

  // 时间窗口内的频率累计变化 → 方向
  const dir = new Int8Array(n);
  for (let i = 0; i < n; i++) {
    const tTarget = pts[i].time - winTime;
    let lo = 0;
    let hi = i;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].time < tTarget) lo = mid + 1;
      else hi = mid;
    }
    const k = lo - 1; // 窗口起点（最后一个 time < tTarget 的点）
    if (k < 0) {
      dir[i] = 0;
      continue;
    }
    const d = sm[i] - sm[k];
    dir[i] = d > df ? 1 : d < -df ? -1 : 0;
  }

  // 合并连续相同方向 → 段
  type RawSeg = { type: 'accel' | 'decel' | 'const'; start: number; end: number };
  const segs: RawSeg[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (dir[i] !== dir[s]) {
      segs.push({ type: dirToType(dir[s]), start: s, end: i - 1 });
      s = i;
    }
  }
  segs.push({ type: dirToType(dir[s]), start: s, end: n - 1 });

  // 跨停歇间隙的段按块切分（停歇处强制分段）
  for (let i = 1; i < n; i++) {
    if (pts[i].time - pts[i - 1].time > gapThreshold) {
      // 找出包含该间隙的段并一分为二
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

  // 合并相邻同类型段
  const merged: RawSeg[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) last.end = seg.end;
    else merged.push(seg);
  }

  // 短段（噪声产生）并入相邻段，保证分段连续完整
  const minPts = 5;
  let changed = true;
  while (changed && merged.length > 1) {
    changed = false;
    for (let k = 0; k < merged.length; k++) {
      if (merged[k].end - merged[k].start + 1 < minPts) {
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

  // 段内累计变化 < df 的加速/减速段降级为匀速（消除平台噪声抖动产生的碎段）
  for (const seg of merged) {
    if (seg.type !== 'const') {
      const delta = Math.abs(pts[seg.end].freq - pts[seg.start].freq);
      if (delta < df) seg.type = 'const';
    }
  }

  // 降级/合并后再次合并相邻同类型段
  const final: RawSeg[] = [];
  for (const seg of merged) {
    const last = final[final.length - 1];
    if (last && last.type === seg.type) last.end = seg.end;
    else final.push(seg);
  }

  return final.map(({ type, start, end }) => {
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

function dirToType(dir: number): 'accel' | 'decel' | 'const' {
  return dir > 0 ? 'accel' : dir < 0 ? 'decel' : 'const';
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
