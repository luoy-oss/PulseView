// Saleae Logic 2 导出格式解析
// 支持两种文件：
//   1. 数字通道二进制导出（.bin，logic2-digital 格式）：
//      头部 44 字节：
//        0x00  magic "<SALEAE>" (8B)
//        0x08  version u32 = 0
//        0x0C  type u32 = 0（digital，1=analog）
//        0x10  init_state u32（初始电平）
//        0x14  begin_time f64（起始时刻，秒）
//        0x1C  end_time f64（结束时刻，秒）
//        0x24  transition_count u64（跳变数量）
//        0x2C  之后为 transition_count 个 f64 跳变时刻
//      跳变仅存储时间，电平在 init_state 基础上逐次翻转；
//      与配套 CSV 相比缺少 t=begin 的初始电平行与 t=end 的结束电平行。
//   2. 跳变 CSV 导出（.csv）：
//      首行表头 "Time [s],Channel 0"，其后每行 "时间,电平"。
// 与 libsigrok src/input/saleae.c 的 FMT_LOGIC2_DIGITAL 布局一致。

export interface SaleaeParseResult {
  samplingRate: number;
  sampleCount: number;
  risingEdges: Float64Array;
  fallingEdges: Float64Array;
  transTimes: Float64Array;
  transLevels: Int8Array;
  channels?: SaleaeChannel[];
}

export interface SaleaeChannel {
  id: string;
  name: string;
  samplingRate: number;
  sampleCount: number;
  risingEdges: Float64Array;
  fallingEdges: Float64Array;
  transTimes: Float64Array;
  transLevels: Int8Array;
}

interface BinaryTransitionData {
  initState: number;
  beginTime: number;
  endTime: number;
  times: Float64Array;
}

export function parseSaleaeBinary(u8: Uint8Array): BinaryTransitionData {
  if (u8.length < 44) {
    throw new Error('文件过小，不是有效的 Saleae 二进制导出');
  }
  const magic = new TextDecoder('ascii').decode(u8.subarray(0, 8));
  if (magic !== '<SALEAE>') {
    throw new Error('不是有效的 Saleae 二进制文件（缺少 <SALEAE> 标识）');
  }

  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const version = dv.getUint32(8, true);
  const type = dv.getUint32(12, true);
  if (version !== 0) {
    throw new Error('不支持的 Saleae 二进制版本（' + version + '）');
  }
  if (type !== 0) {
    throw new Error('当前仅支持数字通道（type=' + type + '），模拟通道暂不支持');
  }

  const initState = dv.getUint32(16, true) ? 1 : 0;
  const beginTime = dv.getFloat64(20, true);
  const endTime = dv.getFloat64(28, true);
  const transitionCount = Number(dv.getBigUint64(36, true));

  const needLen = 44 + transitionCount * 8;
  if (u8.length < needLen) {
    throw new Error('文件长度与头部声明的跳变数量不一致');
  }

  const times = new Float64Array(transitionCount);
  for (let i = 0; i < transitionCount; i++) {
    times[i] = dv.getFloat64(44 + i * 8, true);
  }

  return { initState, beginTime, endTime, times };
}

// 解析跳变 CSV：自动识别表头/注释行，逐行读取 (时间, 电平)。
// 兼容多种软件导出的格式：
//   - Saleae：表头 "Time [s],Channel 0"，每行 "时间,电平"（2 列）；
//   - sigrok（跳变导出）：";" 注释 + "SystemTime, Time(s), Channel 0" 表头，
//     每行 "'系统时间戳,相对时间,电平"（3 列，时间在第 2 列）。
// 识别规则：时间列取第一个严格数值列，电平列取其后的 0/1 列；
// 表头/注释行（无可解析数值）自动跳过。
// 与 vcd 解析算法统一：仅保留电平变化点（跳变），连续相同电平的行去重
// （如 Saleae 导出的结束电平行、静默区重复行），保证跳变序列严格 1/0 交替。
export function parseTransitionsCsv(text: string): {
  times: number[];
  levels: number[];
  samplingRate: number | null;
} {
  return parseLegacyTransitionsCsv(text);
}

function parseCsvNumber(value: string): number {
  const c = value.trim().replace(/^['"]|['"]$/g, '');
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(c) ? parseFloat(c) : NaN;
}

function parseChannelRows(text: string): { name: string; index: number }[] {
  for (const rawLine of text.split(/\r?\n/).slice(0, 100)) {
    const parts = rawLine.split(',');
    const channels: { name: string; index: number }[] = [];
    parts.forEach((part, index) => {
      const match = part.trim().match(/^Channel\s+(.+)$/i);
      if (match) channels.push({ name: match[1].trim(), index });
    });
    if (channels.length) return channels;
  }
  return [];
}

function parseCsvChannels(text: string): { channels: SaleaeChannel[] } {
  const lines = text.split(/\r?\n/);
  const headerChannels = parseChannelRows(text);
  const channels = headerChannels.map((header) => ({
    ...header,
    times: [] as number[],
    levels: [] as number[],
    sampleCount: 0,
    prevLevel: null as number | null,
  }));
  let timeIndex = -1;
  let samplingRate: number | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(';')) {
      const m = line.match(/Sample rate:\s*([0-9.]+)\s*([kMG])?Hz/i);
      if (m) {
        const base = parseFloat(m[1]);
        const unit = m[2]?.toUpperCase();
        samplingRate = unit === 'k' ? base * 1e3 : unit === 'M' ? base * 1e6 : unit === 'G' ? base * 1e9 : base;
      }
      continue;
    }
    const parts = line.split(',');
    if (timeIndex < 0) {
      const headerTime = parts.findIndex((part) => /^Time\s*(?:\(s\)|\[s\])\s*$/i.test(part.trim()));
      if (headerTime < 0) continue;
      timeIndex = headerTime;
      continue;
    }
    const time = parseCsvNumber(parts[timeIndex] ?? '');
    if (!Number.isFinite(time)) continue;
    for (const channel of channels) {
      const level = parseCsvNumber(parts[channel.index] ?? '');
      if (level !== 0 && level !== 1) continue;
      channel.sampleCount++;
      if (channel.prevLevel === level) continue;
      channel.prevLevel = level;
      channel.times.push(time);
      channel.levels.push(level);
    }
  }
  const result = channels
    .filter((channel) => channel.times.length >= 3)
    .map((channel): SaleaeChannel => {
      const rising = channel.times.filter((_, index) => channel.levels[index] === 1);
      const falling = channel.times.filter((_, index) => channel.levels[index] === 0);
      return {
        id: channel.name,
        name: `Channel ${channel.name}`,
        samplingRate: samplingRate ?? estimateSamplingRate(channel.times),
        sampleCount: channel.sampleCount,
        risingEdges: new Float64Array(rising),
        fallingEdges: new Float64Array(falling),
        transTimes: new Float64Array(channel.times),
        transLevels: new Int8Array(channel.levels),
      };
    });
  if (result.length === 0) throw new Error('CSV 中未检测到足够的有效通道跳变（至少需要 3 个），请检查文件格式');
  return { channels: result };
}

function parseLegacyTransitionsCsv(text: string): {
  times: number[];
  levels: number[];
  samplingRate: number | null;
} {
  const times: number[] = [];
  const levels: number[] = [];
  let prevLevel: number | null = null;
  let samplingRate: number | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // 注释行：";"（sigrok 头部，含采样率声明）、"#" 等
    if (line.startsWith(';')) {
      const m = line.match(/Sample rate:\s*([0-9.]+)\s*([kMG])?Hz/i);
      if (m) {
        const base = parseFloat(m[1]);
        const unit = m[2]?.toUpperCase();
        samplingRate =
          unit === 'k' ? base * 1e3 : unit === 'M' ? base * 1e6 : unit === 'G' ? base * 1e9 : base;
      }
      continue;
    }
    if (line.startsWith('#')) continue;
    const parts = line.split(',');
    // 严格数值解析：剥离引号后整列必须是合法数字，
    // 避免把 "2026-08-17 09:07:32..." 系统时间戳误解析为数值列
    const nums = parts.map((p) => {
      const c = p.trim().replace(/^['"]|['"]$/g, '');
      return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(c) ? parseFloat(c) : NaN;
    });
    // 时间列 = 第一个数值列；电平列 = 其后第一个 0/1 列
    let tIdx = -1;
    for (let i = 0; i < nums.length; i++) {
      if (isFinite(nums[i])) {
        tIdx = i;
        break;
      }
    }
    if (tIdx < 0) continue; // 表头或非数据行
    let lvlIdx = -1;
    for (let i = tIdx + 1; i < nums.length; i++) {
      if (nums[i] === 0 || nums[i] === 1) {
        lvlIdx = i;
        break;
      }
    }
    if (lvlIdx < 0) continue;
    const t = nums[tIdx];
    const lvl = nums[lvlIdx] === 0 ? 0 : 1;
    if (prevLevel !== null && lvl === prevLevel) continue; // 与 vcd 去重一致
    prevLevel = lvl;
    times.push(t);
    levels.push(lvl);
  }
  if (times.length < 3) {
    throw new Error('CSV 中未检测到足够的信号跳变（至少需要 3 个），请检查文件格式');
  }
  return { times, levels, samplingRate };
}

// 二进制跳变时间 → 完整跳变序列（补上 begin 初始电平与 end 结束电平，
// 与配套 CSV 导出的内容一致）
function expandBinaryTransitions(data: BinaryTransitionData): { times: number[]; levels: number[] } {
  const times: number[] = [];
  const levels: number[] = [];
  let level = data.initState;
  times.push(data.beginTime);
  levels.push(level);
  for (let i = 0; i < data.times.length; i++) {
    level = 1 - level;
    times.push(data.times[i]);
    levels.push(level);
  }
  if (data.endTime > data.times[data.times.length - 1]) {
    times.push(data.endTime);
    levels.push(level);
  }
  return { times, levels };
}

// 采样率估计：文件头未声明采样率，取前 1000 个跳变的最短间隔按
// 双采样重建（与 vcd 解析的兜底策略一致）
function estimateSamplingRate(times: number[]): number {
  let minDt = Infinity;
  const n = Math.min(times.length, 1000);
  for (let i = 1; i < n; i++) {
    const dt = times[i] - times[i - 1];
    if (dt > 0 && dt < minDt) minDt = dt;
  }
  if (minDt < Infinity) return 1 / (minDt * 2);
  return 24e6;
}

// 顶层入口：自动识别二进制（<SALEAE> 魔数）或 CSV
export function parseSaleaeFile(u8: Uint8Array): SaleaeParseResult {
  let times: number[];
  let levels: number[];
  let headerRate: number | null = null;

  if (u8.length >= 8 && new TextDecoder('ascii').decode(u8.subarray(0, 8)) === '<SALEAE>') {
    const data = parseSaleaeBinary(u8);
    const expanded = expandBinaryTransitions(data);
    times = expanded.times;
    levels = expanded.levels;
  } else {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    const csvChannels = parseChannelRows(text).length ? parseCsvChannels(text).channels : [];
    if (csvChannels.length) {
      const firstChannel = csvChannels[0];
      return {
        samplingRate: firstChannel.samplingRate,
        sampleCount: firstChannel.sampleCount,
        risingEdges: firstChannel.risingEdges,
        fallingEdges: firstChannel.fallingEdges,
        transTimes: firstChannel.transTimes,
        transLevels: firstChannel.transLevels,
        channels: csvChannels,
      };
    }
    const csv = parseLegacyTransitionsCsv(text);
    times = csv.times;
    levels = csv.levels;
    headerRate = csv.samplingRate;
  }

  // 优先采用文件头声明的采样率（如 sigrok 的 "; Sample rate: 1 MHz"），
  // 否则按跳变最短间隔兜底估计
  const samplingRate = headerRate ?? estimateSamplingRate(times);
  const sampleCount = times.length;

  const risingArr: number[] = [];
  const fallingArr: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] === 1) risingArr.push(times[i]);
    else fallingArr.push(times[i]);
  }

  const risingEdges = new Float64Array(risingArr);
  const fallingEdges = new Float64Array(fallingArr);
  const transTimes = new Float64Array(times);
  const transLevels = new Int8Array(levels);

  return { samplingRate, sampleCount, risingEdges, fallingEdges, transTimes, transLevels };
}
