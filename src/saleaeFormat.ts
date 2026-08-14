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

// 解析跳变 CSV：跳过表头，逐行读取 (时间, 电平)
export function parseTransitionsCsv(text: string): { times: number[]; levels: number[] } {
  const times: number[] = [];
  const levels: number[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !/[0-9]/.test(line.charAt(0))) continue;
    const parts = line.split(',');
    if (parts.length < 2) continue;
    const t = parseFloat(parts[0]);
    const v = parseInt(parts[1], 10);
    if (!isFinite(t)) continue;
    times.push(t);
    levels.push(v === 0 ? 0 : 1);
  }
  if (times.length < 3) {
    throw new Error('CSV 中未检测到足够的信号跳变（至少需要 3 个），请检查文件格式');
  }
  return { times, levels };
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

  if (u8.length >= 8 && new TextDecoder('ascii').decode(u8.subarray(0, 8)) === '<SALEAE>') {
    const data = parseSaleaeBinary(u8);
    const expanded = expandBinaryTransitions(data);
    times = expanded.times;
    levels = expanded.levels;
  } else {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    const csv = parseTransitionsCsv(text);
    times = csv.times;
    levels = csv.levels;
  }

  const samplingRate = estimateSamplingRate(times);
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
