// sigrok .sr 文件格式解析（zip 容器）
// .sr 是 zip 包，内含 version / metadata / capturefile 数据块；
// 逻辑数据中每个采样点占 unitsize 字节，probe1 位于采样点最低位的 bit0。

export interface SrZipEntry {
  name: string;
  method: number; // 0=store, 8=deflate
  compSize: number;
  dataOffset: number;
}

export interface SrMeta {
  samplerate: number;
  totalProbes: number;
  unitsize: number;
  capturefile: string;
  probeNames: string[];
}

export interface SrScanResult {
  risingEdges: Float64Array;
  fallingEdges: Float64Array;
  transTimes: Float64Array;
  transLevels: Int8Array;
  sampleCount: number;
}

function u16(u8: Uint8Array, off: number): number {
  return u8[off] | (u8[off + 1] << 8);
}

function u32(u8: Uint8Array, off: number): number {
  return (u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16) | (u8[off + 3] << 24)) >>> 0;
}

// 从 zip 字节流解析中央目录，返回全部条目及其数据偏移
export function readZipEntries(u8: Uint8Array): SrZipEntry[] {
  // 从文件末尾向前搜索 End of Central Directory 签名 0x504b0506
  let eocd = -1;
  const minOff = Math.max(0, u8.length - 22 - 65535);
  for (let i = u8.length - 22; i >= minOff; i--) {
    if (
      u8[i] === 0x50 &&
      u8[i + 1] === 0x4b &&
      u8[i + 2] === 0x05 &&
      u8[i + 3] === 0x06
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 .sr 文件（未找到 zip 目录）');

  const entryCount = u16(u8, eocd + 10);
  const cdOffset = u32(u8, eocd + 16);
  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    throw new Error('暂不支持 zip64 格式的 .sr 文件');
  }

  const decoder = new TextDecoder('utf-8');
  const entries: SrZipEntry[] = [];
  let off = cdOffset;
  for (let n = 0; n < entryCount; n++) {
    if (u32(u8, off) !== 0x02014b50) break;
    const method = u16(u8, off + 10);
    const compSize = u32(u8, off + 20);
    const nameLen = u16(u8, off + 28);
    const extraLen = u16(u8, off + 30);
    const commentLen = u16(u8, off + 32);
    const localOff = u32(u8, off + 42);
    const name = decoder.decode(u8.subarray(off + 46, off + 46 + nameLen));

    // 数据偏移由本地文件头（local file header）计算
    const lhNameLen = u16(u8, localOff + 26);
    const lhExtraLen = u16(u8, localOff + 28);
    const dataOffset = localOff + 30 + lhNameLen + lhExtraLen;

    entries.push({ name, method, compSize, dataOffset });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function parseSamplerateString(value: string): number {
  const m = value.trim().match(/^([0-9.]+)\s*([kMGT]?Hz)?$/i);
  if (!m) return 0;
  const mult: Record<string, number> = { '': 1, hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9, thz: 1e12 };
  const unit = m[2] ? m[2].toLowerCase() : '';
  return parseFloat(m[1]) * (mult[unit] ?? 1);
}

// 解析 metadata 的 [device ...] 小节
export function parseSrMetadata(text: string): SrMeta {
  let samplerate = 0;
  let totalProbes = 0;
  let unitsize = 0;
  let capturefile = '';
  const probeNames: string[] = [];
  let inDevice = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inDevice = /^\[device/i.test(line);
      continue;
    }
    if (!inDevice || !line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === 'samplerate') {
      samplerate = parseSamplerateString(value);
    } else if (key === 'total probes' || key === 'total logic') {
      totalProbes = parseInt(value) || 0;
    } else if (key === 'unitsize') {
      unitsize = parseInt(value) || 0;
    } else if (key === 'capturefile') {
      capturefile = value;
    } else {
      const pm = key.match(/^probe(\d+)$/);
      if (pm) probeNames[parseInt(pm[1], 10) - 1] = value;
    }
  }

  if (!unitsize) unitsize = Math.max(1, Math.ceil(totalProbes / 8));
  return { samplerate, totalProbes, unitsize, capturefile, probeNames };
}

// 解压单个 zip 条目（stored 直接取数据，deflate 用原生流解压）
export async function inflateBlock(entry: SrZipEntry, u8: Uint8Array): Promise<Uint8Array> {
  const data = u8.slice(entry.dataOffset, entry.dataOffset + entry.compSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error('不支持的 zip 压缩方式（' + entry.method + '）');
}

// 扫描解压后的逻辑数据块，提取 probe1（采样点最低位）的跳变序列
export function scanLogicBlocks(
  raws: Uint8Array[],
  unitsize: number,
  samplerate: number
): SrScanResult {
  let sampleCount = 0;
  for (const raw of raws) sampleCount += Math.floor(raw.length / unitsize);

  // 第一遍统计跳变数量，确定数组大小
  let transCount = 0;
  let prev = -1;
  for (const raw of raws) {
    if (!raw.length) continue;
    if (prev < 0) prev = raw[0] & 1;
    for (let i = 1; i < raw.length; i += unitsize) {
      const cur = raw[i] & 1;
      if (cur !== prev) {
        transCount++;
        prev = cur;
      }
    }
  }

  const maxTransitions = 50000000;
  if (transCount > maxTransitions) {
    throw new Error(
      '信号跳变过多（' + transCount.toLocaleString() + ' 次），超出 ' + maxTransitions.toLocaleString() + ' 次的分析上限'
    );
  }

  // 第二遍填充
  const risingEdges = new Float64Array(transCount);
  const fallingEdges = new Float64Array(transCount);
  const transTimes = new Float64Array(transCount);
  const transLevels = new Int8Array(transCount);
  const invRate = 1 / samplerate;
  let idx = 0;
  prev = -1;
  let baseSample = 0;
  for (const raw of raws) {
    if (!raw.length) continue;
    if (prev < 0) prev = raw[0] & 1;
    for (let i = 1; i < raw.length; i += unitsize) {
      const cur = raw[i] & 1;
      if (cur !== prev) {
        const t = (baseSample + i) * invRate;
        if (cur) risingEdges[idx] = t;
        else fallingEdges[idx] = t;
        transTimes[idx] = t;
        transLevels[idx] = cur;
        idx++;
        prev = cur;
      }
    }
    baseSample += Math.floor(raw.length / unitsize);
  }

  return { risingEdges, fallingEdges, transTimes, transLevels, sampleCount };
}
