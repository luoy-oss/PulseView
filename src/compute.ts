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

// 多尺度滑动窗口波动检测：
// 匀速段在任意时间窗口内频率波动（极差）都很小，加速/减速段波动大。
// 第一级用大窗口 dt 粗分（波动超过自适应阈值 → 变化段），
// 第二级在变化段上用更小窗口 dt/4 细分，切出段内平台并精化分段。
// 参数 dt 为第一级滑动窗口的时间宽度；信号停歇会把曲线切成独立块。
export function detectAccelSegments(
  pts: FreqPoint[],
  dt: number,
  smoothWin = 5
): AccelSegment[] {
  const n = pts.length;
  if (n < 3 || !(dt > 0)) return [];

  // 停歇间隙阈值 = 中位时间间隔 × 50
  const dts: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = pts[i].time - pts[i - 1].time;
    if (d > 0) dts.push(d);
  }
  const gapThreshold =
    dts.length > 1 ? quickselect(dts.slice(), dts.length >> 1) * 50 : Infinity;

  // 轻量平滑，仅用于检测（不改变显示数据）
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

  // 滑动窗口统计：range = 窗口内频率极差（波动），delta = 窗口首尾差（方向）
  // 窗口为时间 [t[i]-winDt, t[i]]，用单调队列 O(n) 计算
  const windowStat = (winDt: number) => {
    const range = new Float64Array(n);
    const delta = new Float64Array(n);
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
      delta[right] = sm[right] - sm[left];
    }
    return { range, delta };
  };

  // 自适应波动阈值（相对波动）：最低波动区（p10）× 20，至少 1.5%
  // 平台波动源于采样量化（噪声 ∝ 频率），相对波动使阈值对高低频平台通用；
  // p10 代表曲线最平稳处的典型波动，对窗口大小不敏感
  const percentileThreshold = (v: Float64Array, p: number, mult: number) => {
    const sample: number[] = [];
    const step = Math.max(1, Math.floor(v.length / 8000));
    for (let i = 0; i < v.length; i += step) sample.push(v[i]);
    sample.sort((a, b) => a - b);
    return sample[Math.min(sample.length - 1, Math.floor(sample.length * p))] * mult;
  };
  const relThreshold = (v: Float64Array) => Math.max(percentileThreshold(v, 0.1, 20), 0.015);

  type RawSeg = { type: 'accel' | 'decel' | 'const' | 'chg'; start: number; end: number };

  // ---- 第一级：大窗口 dt 粗分（只分 变化/平稳，方向留到最终用段首尾差判定） ----
  const { range: r1, delta: d1 } = windowStat(dt);
  const rel1 = new Float64Array(n);
  for (let i = 0; i < n; i++) rel1[i] = sm[i] > 0 ? r1[i] / sm[i] : 0;
  const T1 = relThreshold(rel1);
  void d1;
  const st1 = new Uint8Array(n); // 1 变化 / 0 平稳
  for (let i = 0; i < n; i++) st1[i] = rel1[i] > T1 ? 1 : 0;
  const segs: RawSeg[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (st1[i] !== st1[s]) {
      segs.push({ type: st1[s] ? 'chg' : 'const', start: s, end: i - 1 });
      s = i;
    }
  }
  segs.push({ type: st1[s] ? 'chg' : 'const', start: s, end: n - 1 });
  // 跨停歇间隙的段按块切分（停歇处强制分段）
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

  // ---- 第二级：对变化段用小窗口 dt/4 细分（切出段内平台） ----
  const dt2 = Math.max(dt / 4, gapThreshold * 2);
  const { range: r2 } = windowStat(dt2);
  const rel2 = new Float64Array(n);
  for (let i = 0; i < n; i++) rel2[i] = sm[i] > 0 ? r2[i] / sm[i] : 0;
  const refined: RawSeg[] = [];
  for (const seg of segs) {
    if (seg.type === 'const' || seg.end - seg.start < 2) {
      refined.push(seg);
      continue;
    }
    // 段内自适应阈值（上限约束为全局阈值 3 倍，避免全变化段误判为平台）
    const segRel: number[] = [];
    for (let i = seg.start; i <= seg.end; i++) segRel.push(rel2[i]);
    segRel.sort((a, b) => a - b);
    const T2 = Math.min(
      Math.max(
        segRel[Math.min(segRel.length - 1, Math.floor(segRel.length * 0.1))] * 20,
        0.015
      ),
      T1 * 3
    );
    let runStart = seg.start;
    let prev: 'chg' | 'const' = rel2[seg.start] > T2 ? 'chg' : 'const';
    for (let i = seg.start + 1; i <= seg.end; i++) {
      const cur: 'chg' | 'const' = rel2[i] > T2 ? 'chg' : 'const';
      if (cur !== prev) {
        refined.push({ type: prev, start: runStart, end: i - 1 });
        runStart = i;
        prev = cur;
      }
    }
    refined.push({ type: prev, start: runStart, end: seg.end });
  }
  refined.sort((a, b) => a.start - b.start);

  // ---- 合并相邻同类型段（chg/const） ----
  const merged: RawSeg[] = [];
  for (const seg of refined) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) last.end = seg.end;
    else merged.push(seg);
  }

  // ---- 短段（噪声产生）并入相邻段 ----
  // 阈值取点数与时长较小的一侧：真实变化段（如 50k→4k 快速减速）只有几 ms，不能被吞
  const minDur = Math.max(gapThreshold * 4, dt / 50);
  let changed = true;
  while (changed && merged.length > 1) {
    changed = false;
    for (let k = 0; k < merged.length; k++) {
      const dur = pts[merged[k].end].time - pts[merged[k].start].time;
      if (dur < minDur && merged[k].end - merged[k].start + 1 < 20) {
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

  // ---- 最终方向：按段首尾频率差判定；变化过小降级为匀速 ----
  const final: RawSeg[] = [];
  for (const seg of merged) {
    if (seg.type === 'const') {
      final.push(seg);
      continue;
    }
    const dfSeg = pts[seg.end].freq - pts[seg.start].freq;
    const thresh = Math.max(sm[seg.start] * T1, sm[seg.start] * 0.005);
    if (Math.abs(dfSeg) < thresh) {
      final.push({ type: 'const', start: seg.start, end: seg.end });
    } else {
      final.push({ type: dfSeg > 0 ? 'accel' : 'decel', start: seg.start, end: seg.end });
    }
  }

  // 方向分配后再次合并相邻同类型段
  const result: RawSeg[] = [];
  for (const seg of final) {
    const last = result[result.length - 1];
    if (last && last.type === seg.type) last.end = seg.end;
    else result.push(seg);
  }

  return result.map(({ type, start, end }) => {
    const st = pts[start].time;
    const et = pts[end].time;
    const duration = et - st;
    return {
      type: type === 'chg' ? 'const' : type,
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
