import type { FreqPoint, DerivPoint, AccelSegment, FreqMode } from './types';
import type { LowGapMarker } from './types';

export const LOW_GAP_MIN_THRESHOLD = 0.0009;
export const LOW_GAP_DEFAULT_THRESHOLD = 0.001;

export function deriveEdgesFromTransitions(
  transTimes: Float64Array,
  transLevels: Int8Array
): { risingEdges: Float64Array; fallingEdges: Float64Array } {
  const rises: number[] = [];
  const falls: number[] = [];
  for (let i = 1; i < transTimes.length; i++) {
    if (transLevels[i] === 1 && transLevels[i - 1] === 0) rises.push(transTimes[i]);
    else if (transLevels[i] === 0 && transLevels[i - 1] === 1) falls.push(transTimes[i]);
  }
  return {
    risingEdges: new Float64Array(rises),
    fallingEdges: new Float64Array(falls),
  };
}

export function invertTransitionLevels(transLevels: Int8Array): Int8Array {
  const inverted = new Int8Array(transLevels.length);
  for (let i = 0; i < transLevels.length; i++) inverted[i] = transLevels[i] === 1 ? 0 : 1;
  return inverted;
}

export function computeLowGapMarkers(
  transTimes: Float64Array,
  transLevels: Int8Array,
  threshold = LOW_GAP_DEFAULT_THRESHOLD,
  toleranceEnabled = false,
  tolerancePct = 0
): LowGapMarker[] {
  if (!transTimes || transTimes.length < 3) return [];
  const rises: number[] = [];
  const falls: number[] = [];
  for (let i = 1; i < transTimes.length; i++) {
    if (transLevels[i] === 1 && transLevels[i - 1] === 0) rises.push(i);
    else if (transLevels[i] === 0 && transLevels[i - 1] === 1) falls.push(i);
  }
  if (rises.length === 0) return [];
  let firstFall = -1;
  for (let i = 0; i < falls.length; i++) {
    if (falls[i] > rises[0]) {
      firstFall = i;
      break;
    }
  }
  if (firstFall < 0) return [];

  const minThreshold = Math.max(
    LOW_GAP_MIN_THRESHOLD,
    Number.isFinite(threshold) ? threshold : LOW_GAP_DEFAULT_THRESHOLD
  );
  const tolerance = Math.max(0, tolerancePct) / 100;
  const markers: LowGapMarker[] = [];
  for (let k = firstFall + 1; k < falls.length; k++) {
    const previousFall = falls[k - 1];
    const currentFall = falls[k];
    const rise = rises[k - firstFall];
    if (rise >= currentFall) continue;
    const period = transTimes[currentFall] - transTimes[previousFall];
    const width = transTimes[currentFall] - transTimes[rise];
    const lowStart = transTimes[previousFall];
    const lowEnd = transTimes[rise];
    if (period <= 0 || width <= 0 || lowEnd <= lowStart) continue;
    const dutyCycle = width / period;
    const rawGap = period - 2 * width;
    const gap =
      toleranceEnabled && Math.abs(dutyCycle - 0.5) <= tolerance ? 0 : rawGap;
    if (gap >= minThreshold) {
      markers.push({ startTime: lowStart, endTime: lowEnd, gap, dutyCycle });
    }
  }
  return markers;
}

// 停歇间隙判定（仅用于加减速分段切块）：间隔分布中出现 >= GAP_MIN_RATIO 倍的
// "断层"（如 0.7s 停歇 vs 正常 2.5ms 间隔）时，取断层两值的几何均值作为阈值，
// 把真实停歇两侧的曲线切成独立块，避免分段跨停歇。
// 频率点计算不做任何间隙过滤：各格式跳变均为严格 1/0 交替的方波，
// 脉宽/周期由边沿时间直接界定，过滤只会误伤扫频末端的低速脉冲
// （固定"中位数×50"在扫频范围宽时会把 316 Hz 慢速脉冲误判为停歇，已弃用）。
const GAP_MIN_RATIO = 30;

// sorted 为升序间隔数组，返回停歇阈值；分布无断层时返回 Infinity（不过滤）
function gapThresholdFromSorted(sorted: number[]): number {
  if (sorted.length < 2) return Infinity;
  let threshold = Infinity;
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev) continue;
    if (cur / prev >= GAP_MIN_RATIO) {
      threshold = Math.min(threshold, Math.sqrt(prev * cur));
    }
    prev = cur;
  }
  return threshold;
}

export function computeFreqFromTransitions(
  transTimes: Float64Array,
  transLevels: Int8Array,
  format: 'vcd' | 'txt' | 'sr' | 'saleae',
  freqMode: FreqMode = 'pulse',
  dutyCorrect = false,
  edgeBase: 'falling' | 'rising' = 'falling',
  lowGapToleranceEnabled = false,
  lowGapTolerancePct = 0,
  defaultLevel: 0 | 1 = 0
): FreqPoint[] {
  if (!transTimes || transTimes.length < 3) return [];

  // 各格式导出的跳变均为严格 1/0 交替的方波：每个高电平脉冲由相邻的
  // 上升沿 + 下降沿显式界定，周期由相邻同向边（上升沿对 / 下降沿对）
  // 显式界定。边沿时间即数据本身，直接计算即可，无需任何间隙过滤。
  // pulse 模式：每个高电平脉冲生成一个频率点，横坐标取该脉冲的上升沿时刻；
  // rising 模式：相邻两个上升沿的间隔 dt 即周期（方波交替时与
  // 相邻下降沿间隔相等），freq = 1/dt，频率点按周期终点上升沿时刻绘制；
  // falling 模式（默认）：以相邻下降沿为周期边界，freq = 1/(fall[n] - fall[n-1])，
  // 时间点取相邻两下降沿的中点；首个脉冲无前序下降沿，以第一个上升沿为
  // 时间起点并默认 50% 占空比（VCD 数据从有效上升沿开始具体时间，
  // 上升沿时刻方案会使首个频率点贴住曲线起点造成显示异常）。
  const rises: number[] = [];
  const falls: number[] = [];
  // 只收集真实的跳变边沿（0→1 上升沿、1→0 下降沿），
  // 避免把初始电平（levels[0]）误当作边沿，保证 rises/falls 与脉冲一一对应
  for (let i = 1; i < transTimes.length; i++) {
    if (transLevels[i] === 1 && transLevels[i - 1] === 0) rises.push(i);
    else if (transLevels[i] === 0 && transLevels[i - 1] === 1) falls.push(i);
  }

  const pts: FreqPoint[] = [];
  if (freqMode === 'low-gap') {
    // 测试模式：严格 50% 占空比方波在无额外低电平停顿时满足 period = 2 × width。
    // 可选容差只把接近 50% 的硬件误差归零，不删除其余正值或负值。
    if (rises.length === 0) return pts;
    let f0 = -1;
    for (let k = 0; k < falls.length; k++) {
      if (falls[k] > rises[0]) {
        f0 = k;
        break;
      }
    }
    if (f0 < 0) return pts;

    const tolerance = Math.max(0, lowGapTolerancePct) / 100;
    for (let k = f0 + 1; k < falls.length; k++) {
      const period = transTimes[falls[k]] - transTimes[falls[k - 1]];
      const riseIdx = rises[k - f0];
      if (period <= 0 || riseIdx >= falls[k]) continue;
      const width = transTimes[falls[k]] - transTimes[riseIdx];
      if (width <= 0) continue;
      const dutyCycle = width / period;
      const rawGap = period - 2 * width;
      const gap =
        lowGapToleranceEnabled && Math.abs(dutyCycle - 0.5) <= tolerance
          ? 0
          : rawGap;
      pts.push({
        time: (transTimes[falls[k - 1]] + transTimes[falls[k]]) / 2,
        freq: gap,
        period,
        dutyCycle,
      });
    }
    return pts;
  }

  if (freqMode === 'rising') {
    // 上升沿周期模式：相邻上升沿构成一个周期，freq = 1/dt；
    // 横坐标取该周期终点上升沿时刻。
    // VCD 数据从有效上升沿开始具体时间，首脉冲（第一份数据 R0→F0）之前
    // 无前序上升沿可参照，R0→R1 周期会混入首脉冲的宽脉冲而失真
    // （如 4.vcd 中 R0→R1=502µs 使首个频率点低至 1991Hz，偏离真实扫频
    // 起点 ~3400Hz），必须抛开：首脉冲固定按 50% 占空比口径计算
    // （freq = 1/(2×脉宽)，period = 2×脉宽），周期从第二个上升沿对开始。
    if (rises.length === 0) return pts;
    if (rises[0] + 1 < transTimes.length) {
      const w0 = transTimes[rises[0] + 1] - transTimes[rises[0]]; // 首脉冲脉宽
      if (w0 > 0) {
        pts.push({
          time: transTimes[rises[0]], // 首脉冲上升沿时刻
          freq: 1 / (2 * w0), // 默认 50% 占空比
          period: 2 * w0,
          dutyCycle: 0.5,
        });
      }
    }
    for (let k = 2; k < rises.length; k++) {
      const i = rises[k - 1];
      const j = rises[k];
      const dt = transTimes[j] - transTimes[i];
      if (dt <= 0) continue;
      pts.push({
        time: transTimes[j], // 周期终点上升沿时刻
        freq: 1 / dt,
        period: dt, // 周期（上升沿间隔）
      });
    }
    const lastRise = rises[rises.length - 1];
    const terminalFall = lastRise + 1;
    if (
      terminalFall < transTimes.length &&
      terminalFall === transTimes.length - 1 &&
      transLevels[terminalFall] === defaultLevel
    ) {
      const width = transTimes[terminalFall] - transTimes[lastRise];
      if (width > 0) {
        const terminalPoint: FreqPoint = {
          time: transTimes[lastRise],
          freq: 1 / (2 * width),
          period: 2 * width,
          dutyCycle: 0.5,
        };
        const previous = pts.length > 0 ? pts[pts.length - 1] : undefined;
        if (previous?.time === terminalPoint.time) pts[pts.length - 1] = terminalPoint;
        else pts.push(terminalPoint);
      }
    }
    return pts;
  }

  if (freqMode === 'falling') {
    // 下降沿周期模式：以相邻下降沿为周期边界，freq = 1/(fall[n] - fall[n-1])，
    // 时间点取相邻两下降沿的中点（代表该周期发生的时刻，避免上升沿时刻方案
    // 让频率点贴住曲线起点/边沿造成显示异常）；每个周期内含一个高电平脉冲，
    // 实测占空比 = 该脉冲脉宽 / 周期。
    // 首个脉冲无前序下降沿可参照（起始段不完整），以第一个上升沿为时间起点，
    // 固定按 50% 占空比口径计算（period = 2 × 脉宽，freq = 1/(2×脉宽)）。
    if (rises.length === 0) return pts;
    // 第一个真实下降沿 = 首个上升沿之后的首个下降沿：信号以高电平开头时
    // （如 VCD 初始电平为 1），首个下降沿结束的是记录起点之前就已开始的
    // 不完整脉冲，不能作为周期边界，必须跳过
    let f0 = -1;
    for (let k = 0; k < falls.length; k++) {
      if (falls[k] > rises[0]) {
        f0 = k;
        break;
      }
    }
    if (f0 < 0) return pts; // 无下降沿，无法构成周期

    // 首个脉冲：以上升沿为时间起点，默认 50% 占空比
    const w0 = transTimes[falls[f0]] - transTimes[rises[0]];
    if (w0 > 0) {
      pts.push({
        time: transTimes[rises[0]],
        freq: 1 / (2 * w0),
        period: 2 * w0,
        dutyCycle: 0.5,
      });
    }

    // 后续脉冲：相邻下降沿间隔为周期，时间点取两下降沿中点
    for (let k = f0 + 1; k < falls.length; k++) {
      const period = transTimes[falls[k]] - transTimes[falls[k - 1]];
      if (period <= 0) continue;
      const riseIdx = rises[k - f0]; // 该周期内含的高电平脉冲上升沿
      const w = riseIdx < falls[k] ? transTimes[falls[k]] - transTimes[riseIdx] : 0;
      const isTerminalBoundaryPulse =
        k === falls.length - 1 &&
        falls[k] === transTimes.length - 1 &&
        transLevels[falls[k]] === defaultLevel;
      pts.push({
        time: (transTimes[falls[k - 1]] + transTimes[falls[k]]) / 2,
        freq: isTerminalBoundaryPulse && w > 0 ? 1 / (2 * w) : 1 / period,
        period: isTerminalBoundaryPulse && w > 0 ? 2 * w : period,
        dutyCycle: isTerminalBoundaryPulse ? 0.5 : w > 0 ? w / period : 0.5,
      });
    }
    return pts;
  }

  // pulse 模式：每个高电平跳变对生成一个频率点，横坐标取上升沿时刻。
  // 默认频率口径 freq = 1/(2×脉宽)（等价于假设占空比 50%，与逻辑分析仪
  // 测量一致）；低电平区间不生成频率点，避免把每个脉冲拆成两个半周期点
  // 造成阶梯状曲线。
  // 占空比 dutyCycle = 脉宽/周期，周期按基准边沿（默认下降沿，可切换
  // 上升沿）的相邻脉冲间隔计算；dutyCorrect 开启时改用占空比修正频率：
  // freq = 1/(2×脉宽) × (占空比/50%) = 1/周期，对窄脉冲/占空比变化的信号
  // （如 sigrok 导出的 PWM、占空比扫掠）给出真实周期频率，否则 22µs 窄脉冲
  // 会被算成 22.7kHz 而真实周期频率仅约 500Hz。
  // 首脉冲（第一个上升沿）之前无完整周期可参照（信号先发低电平后发高电平，
  // 起始段不可靠），固定按 50% 占空比口径计算，不参与占空比修正。
  for (let k = 0; k < rises.length; k++) {
    const i = rises[k];
    if (i + 1 >= transTimes.length) continue; // 缺下降沿（悬空高电平结尾）
    const w = transTimes[i + 1] - transTimes[i]; // 高电平脉宽
    if (w <= 0) continue;
    let period: number;
    let duty: number;
    if (k === 0) {
      period = 2 * w; // 首脉冲默认 50% 占空比
      duty = 0.5;
    } else {
      period =
        edgeBase === 'falling'
          ? transTimes[falls[k]] - transTimes[falls[k - 1]]
          : transTimes[rises[k]] - transTimes[rises[k - 1]];
      duty = period > 0 ? w / period : 0.5;
    }
    const isTerminalBoundaryPulse =
      i + 1 === transTimes.length - 1 && transLevels[i + 1] === defaultLevel;
    if (isTerminalBoundaryPulse) {
      period = 2 * w;
      duty = 0.5;
    }
    pts.push({
      time: transTimes[i], // 上升沿时刻
      freq: dutyCorrect || isTerminalBoundaryPulse ? 1 / period : 1 / (2 * w),
      period: isTerminalBoundaryPulse ? period : w, // 常规点为高电平脉宽；边界点为推定周期
      dutyCycle: duty,
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

// 从频率-时间曲线计算加速度（一阶导数）与加加速度（二阶导数）。
// 频率即速度（扫频场景），a = df/dt，j = d²f/dt²。
// 频率点本身带有测量抖动（高频区相邻点频率差可达 ±0.9%），直接差分会把
// 抖动放大成远大于真实变化的加速度尖峰，因此先对频率做时间窗移动平均
// 平滑（窗口取总时长的 0.05%，远小于加减速过渡段，不模糊真实结构；
// 按时间而非点数取窗，天然不会跨越停歇间隙），再在平滑序列上做中心差分，
// 端点用前向/后向差分。点数与频率点一一对应（时间轴相同），
// 便于三个图共享缩放与光标。
export function computeDerivatives(
  pts: FreqPoint[]
): { accel: DerivPoint[]; jerk: DerivPoint[] } {
  const n = pts.length;
  if (n < 3) return { accel: [], jerk: [] };

  const totalDur = pts[n - 1].time - pts[0].time;
  const meanDt = totalDur / n;
  const tau = Math.max(totalDur / 2000, meanDt * 5);
  const sm = new Float64Array(n);
  let lo = 0;
  let hi = -1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t0 = pts[i].time - tau;
    const t1 = pts[i].time + tau;
    while (hi + 1 < n && pts[hi + 1].time <= t1) {
      hi++;
      sum += pts[hi].freq;
    }
    while (lo <= hi && pts[lo].time < t0) {
      sum -= pts[lo].freq;
      lo++;
    }
    sm[i] = sum / (hi - lo + 1);
  }

  const accel = new Array<DerivPoint>(n);
  for (let i = 0; i < n; i++) {
    const ip = Math.min(n - 1, i + 1);
    const im = Math.max(0, i - 1);
    const dt = pts[ip].time - pts[im].time;
    accel[i] = {
      time: pts[i].time,
      value: dt > 0 ? (sm[ip] - sm[im]) / dt : 0,
    };
  }

  const jerk = new Array<DerivPoint>(n);
  for (let i = 0; i < n; i++) {
    const ip = Math.min(n - 1, i + 1);
    const im = Math.max(0, i - 1);
    const dt = pts[ip].time - pts[im].time;
    jerk[i] = {
      time: pts[i].time,
      value: dt > 0 ? (accel[ip].value - accel[im].value) / dt : 0,
    };
  }

  return { accel, jerk };
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

  // 停歇间隙阈值：时间间隔分布中的最大断层
  const dts: number[] = [];
  for (let i = 1; i < n; i++) {
    const d = pts[i].time - pts[i - 1].time;
    if (d > 0) dts.push(d);
  }
  const sorted = dts.sort((a, b) => a - b);
  const medianGap = sorted.length > 1 ? sorted[sorted.length >> 1] : 0;
  const gapThreshold = gapThresholdFromSorted(sorted);

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
