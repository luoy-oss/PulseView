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
  format: 'vcd' | 'txt' | 'sr'
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

// 统计光标 A/B 之间的脉冲个数：每个上升沿对应一个脉冲，
// risingEdges 升序排列，二分查找定位 [min(tA,tB), max(tA,tB)] 区间。
export function countPulsesBetween(
  risingEdges: Float64Array,
  tA: number,
  tB: number
): number {
  if (!risingEdges || risingEdges.length === 0) return 0;
  const lo = Math.min(tA, tB);
  const hi = Math.max(tA, tB);

  // 第一个 >= lo 的下标
  let l = 0;
  let r = risingEdges.length;
  while (l < r) {
    const mid = (l + r) >> 1;
    if (risingEdges[mid] < lo) l = mid + 1;
    else r = mid;
  }
  const start = l;

  // 第一个 > hi 的下标
  l = 0;
  r = risingEdges.length;
  while (l < r) {
    const mid = (l + r) >> 1;
    if (risingEdges[mid] <= hi) l = mid + 1;
    else r = mid;
  }
  return l - start;
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

// 平台定位分段（无参数）：
// 频率-时间曲线由"长平台（匀速）+ 急剧过渡（加速/减速）"组成。
// 算法：小窗口相对波动识别平台核心区 → 用平台均值向两侧精确扩展
// （频率偏离平台值超过 2% 即止，边界精确到 1~2 个点）→ 平台之间的
// 过渡区即为加速/减速段（方向由段首尾频率差判定）。
// 停歇间隙会把曲线切成独立块，分段不跨停歇。
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

  // 多尺度滑动窗口相对极差的最大值：
  // 平台（匀速）在任何窗口下波动都很小；单调爬升段在小窗口下波动也小，
  // 但大窗口下波动大 —— 取所有尺度中的最大相对波动即可同时排除爬升与噪声。
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

  const totalDur = pts[n - 1].time - pts[0].time;
  // 最大尺度限制为总时长/32：窗口过大会跨过段边界污染平台（平台必须比窗口长才有核心）
  const base = Math.max(medianGap * 8, totalDur / 16384);
  const maxScale = Math.max(totalDur / 32, base * 2);
  const scales: number[] = [];
  for (let s = base; s <= maxScale; s *= 4) scales.push(s);
  if (scales.length === 0 || scales[scales.length - 1] < maxScale) {
    scales.push(maxScale);
  }
  const maxRel = new Float64Array(n);
  for (const sc of scales) {
    const range = windowRange(sc);
    for (let i = 0; i < n; i++) {
      const r = sm[i] > 0 ? range[i] / sm[i] : 0;
      if (r > maxRel[i]) maxRel[i] = r;
    }
  }

  // 自适应波动阈值（maxRel 的 p10×20，下限 1.5%）
  const sample: number[] = [];
  const step = Math.max(1, Math.floor(n / 8000));
  for (let i = 0; i < n; i += step) sample.push(maxRel[i]);
  sample.sort((a, b) => a - b);
  const T = Math.max(sample[Math.floor(sample.length * 0.1)] * 20, 0.015);

  // 平台核心点：所有尺度下波动都小
  const isCore = new Uint8Array(n);
  for (let i = 0; i < n; i++) isCore[i] = maxRel[i] < T ? 1 : 0;

  // 平台精确扩展：核心区均值作为平台频率，向两侧并入频率接近平台值的帧。
  // 容差 1%（大于平台采样量化噪声 ±0.84%，小于过渡尾帧偏离 1.5%+），
  // 连续 2 帧偏离才停止（跨越平台内单帧噪声，不吞过渡段尾帧，
  // 使过渡段延伸到频率真正到达平台值的帧）。
  const isPlateau = new Uint8Array(n);
  for (let i = 0; i < n; i++) isPlateau[i] = isCore[i];
  let i0 = 0;
  while (i0 < n) {
    while (i0 < n && !isCore[i0]) i0++;
    if (i0 >= n) break;
    let e0 = i0;
    while (e0 < n && isCore[e0]) e0++;
    let sum = 0;
    let cnt = 0;
    for (let j = i0; j < e0; j++) {
      sum += sm[j];
      cnt++;
    }
    const fp = sum / cnt;
    const tol = fp * 0.01;
    let j = i0 - 1;
    while (j >= 0 && !isPlateau[j]) {
      if (Math.abs(sm[j] - fp) < tol) {
        isPlateau[j] = 1;
        j--;
        continue;
      }
      // 偏离平台值：若下一帧仍偏离（连续 2 帧）则停止；单帧尖刺跨越
      if (j - 1 >= 0 && !isPlateau[j - 1] && Math.abs(sm[j - 1] - fp) >= tol) break;
      isPlateau[j] = 1;
      j--;
    }
    j = e0;
    while (j < n && !isPlateau[j]) {
      if (Math.abs(sm[j] - fp) < tol) {
        isPlateau[j] = 1;
        j++;
        continue;
      }
      if (j + 1 < n && !isPlateau[j + 1] && Math.abs(sm[j + 1] - fp) >= tol) break;
      isPlateau[j] = 1;
      j++;
    }
    i0 = e0;
  }

  // 分段：平台 = 匀速段；非平台 = 过渡段；按停歇间隙切分
  type RawSeg = { type: 'chg' | 'const'; start: number; end: number };
  const segs: RawSeg[] = [];
  let s = 0;
  const segType = (i: number) => (isPlateau[i] ? 'const' : 'chg');
  for (let i = 0; i < n; i++) {
    if (segType(i) !== segType(s)) {
      segs.push({ type: segType(s), start: s, end: i - 1 });
      s = i;
    }
  }
  segs.push({ type: segType(s), start: s, end: n - 1 });
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

  // 共享边界帧：过渡段与相邻匀速段共用边界帧（过渡尾帧 = 匀速首帧，频率相同），
  // 使加减速区间的首/尾帧与匀速区间的首帧保持一致，不丢帧
  for (let k = 0; k + 1 < segs.length; k++) {
    const left = segs[k];
    const right = segs[k + 1];
    if (left.type === right.type) continue;
    if (left.type === 'chg') {
      left.end = right.start; // 过渡尾 = 匀速首
    } else {
      right.start = left.end; // 匀速尾 = 过渡首
    }
  }

  // 合并相邻同类型段
  const merged: RawSeg[] = [];
  for (const seg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) last.end = seg.end;
    else merged.push(seg);
  }

  // 噪声碎段（点数极少且时长极短）并入相邻段
  let changed = true;
  while (changed && merged.length > 1) {
    changed = false;
    for (let k = 0; k < merged.length; k++) {
      const dur = pts[merged[k].end].time - pts[merged[k].start].time;
      if (merged[k].end - merged[k].start + 1 < 3 && dur < gapThreshold * 4) {
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

  // 方向：段首尾频率差；变化过小降级为匀速
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
