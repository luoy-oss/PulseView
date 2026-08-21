/// <reference lib="webworker" />

import { isTxtEdgeList, parseTxtEdgeList } from '../txtFormat';

// sigrok PulseView "PWM 测量"导出格式（每区间三行，测量类型分组排列）：
//   223191-24224567 PWM: Duty cycles: 50.000008%
//   223191-24224567 PWM: Periods: 1.0 s
//   223191-24224567 PWM: Frequencies: 1.000 Hz
// start/end 为采样点序号，频率/占空比/周期为仪器直接测量值（精度高于
// 边沿推算），时间由反推采样率换算：samplingRate ≈ (end - start) / period。
// 解析产物为现成的频率点序列（freqPts），不再做边沿重建。
const PWM_PAT =
  /^(\d+)-(\d+)\s+PWM:\s+(Duty cycles|Periods|Frequencies):\s+([\d.]+)\s*([%a-zA-Zµμ]*)/i;

const FREQ_MULT: Record<string, number> = {
  hz: 1,
  khz: 1e3,
  mhz: 1e6,
  ghz: 1e9,
};

const PERIOD_MULT: Record<string, number> = {
  s: 1,
  ms: 1e-3,
  us: 1e-6,
  µs: 1e-6,
  μs: 1e-6,
  ns: 1e-9,
};

// 频率/周期单位换算：PulseView 可能用 "Hz/kHz/MHz" 或 "s/ms/µs/ns"
function toSec(val: number, unit: string): number {
  return val * (PERIOD_MULT[unit.toLowerCase()] ?? 1);
}

function toHz(val: number, unit: string): number {
  return val * (FREQ_MULT[unit.toLowerCase()] ?? 1);
}

function parsePwmMeasurements(lines: string[]): void {
  // 按区间 (start-end) 聚合三种测量
  const segs = new Map<string, { start: number; end: number; duty: number; period: number; freq: number }>();
  for (const line of lines) {
    const m = line.match(PWM_PAT);
    if (!m) continue;
    const key = m[1] + '-' + m[2];
    let seg = segs.get(key);
    if (!seg) {
      seg = { start: parseInt(m[1]), end: parseInt(m[2]), duty: NaN, period: NaN, freq: NaN };
      segs.set(key, seg);
    }
    const val = parseFloat(m[4]);
    const unit = m[5] || '';
    if (/duty/i.test(m[3])) seg.duty = val; // 百分比
    else if (/period/i.test(m[3])) seg.period = toSec(val, unit);
    else if (/freq/i.test(m[3])) seg.freq = toHz(val, unit);
  }
  const sorted = [...segs.values()].sort((a, b) => a.start - b.start);
  if (sorted.length === 0) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: '未解析到 PWM 测量行（期望 "<start>-<end> PWM: ..." 格式）',
    });
    return;
  }

  // 反推采样率：samplingRate ≈ (end - start) / period，多区间取中位数
  const rates: number[] = [];
  for (const s of sorted) {
    if (s.period > 0 && s.end > s.start) rates.push((s.end - s.start) / s.period);
  }
  if (rates.length === 0) {
    // 无 Periods 行时用 Frequencies 反推：采样率 ≈ (end - start) × freq
    for (const s of sorted) {
      if (s.freq > 0 && s.end > s.start) rates.push((s.end - s.start) * s.freq);
    }
  }
  rates.sort((a, b) => a - b);
  const samplingRate = rates.length > 0 ? rates[rates.length >> 1] : 0;
  if (!samplingRate || !isFinite(samplingRate)) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: '无法从 PWM 测量中反推采样频率（缺少 Periods/Frequencies 测量行）',
    });
    return;
  }

  // 直接使用文件测量值生成频率点：freq/period/dutyCycle 原样，时间为区间中点
  const pts: { time: number; freq: number; period?: number; dutyCycle?: number }[] = [];
  for (const s of sorted) {
    const freq = s.freq > 0 ? s.freq : s.period > 0 ? 1 / s.period : 0;
    if (freq <= 0) continue;
    pts.push({
      time: ((s.start + s.end) / 2) / samplingRate,
      freq,
      period: s.period > 0 ? s.period : undefined,
      dutyCycle: s.duty > 0 ? s.duty / 100 : undefined,
    });
  }
  pts.sort((a, b) => a.time - b.time);

  // 总脉冲数：该导出格式按 PWM 周期逐行输出测量，每个测量区间 (start-end)
  // 恰好对应一个 PWM 周期（区间跨度 ≈ period × samplingRate），
  // 因此唯一区间数即脉冲数——不依赖行数，因为测量种类可多可少
  // （p.txt 含 Duty/Period/Freq 三组，pwm.txt 仅 Frequencies）
  const pulseCount = segs.size;

  const re = new Float64Array(0);
  const fe = new Float64Array(0);
  (self as unknown as Worker).postMessage({
    type: 'done',
    samplingRate,
    sampleCount: pts.length,
    pulseCount,
    risingEdges: re,
    fallingEdges: fe,
    transTimes: null,
    transLevels: null,
    freqPts: pts,
    format: 'txt',
  });
}

self.onmessage = function (e: MessageEvent) {
  if (e.data.type !== 'parse') return;
  const buf: ArrayBuffer = e.data.buffer;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
  const lines = text.split(/\r?\n/);

  if (isTxtEdgeList(lines)) {
    const parsed = parseTxtEdgeList(lines);
    if (parsed.transTimes.length < 2 || !parsed.samplingRate) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        message: '未解析到有效的 Time[s], 电平边沿数据。',
      });
      return;
    }
    (self as unknown as Worker).postMessage(
      {
        type: 'done',
        samplingRate: parsed.samplingRate,
        sampleCount: parsed.sampleCount,
        risingEdges: parsed.risingEdges,
        fallingEdges: parsed.fallingEdges,
        transTimes: parsed.transTimes,
        transLevels: parsed.transLevels,
        format: 'txt',
      },
      [
        parsed.risingEdges.buffer,
        parsed.fallingEdges.buffer,
        parsed.transTimes.buffer,
        parsed.transLevels.buffer,
      ]
    );
    return;
  }

  // 前 200 行内出现 PWM 测量行即按该格式解析
  let isPwm = false;
  for (let k = 0; k < Math.min(200, lines.length); k++) {
    if (PWM_PAT.test(lines[k])) {
      isPwm = true;
      break;
    }
  }
  if (isPwm) {
    parsePwmMeasurements(lines);
    return;
  }

  const ratePat =
    /Acquisition\s+with\s+\d+\/\d+\s+channels\s+at\s+([0-9]+(?:\.[0-9]+)?)\s*([kMGT]?Hz)/i;
  const mult: Record<string, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9, thz: 1e12 };
  let samplingRate: number | null = null;
  let sampleCount = 0;
  let prevLevel: number | null = null;
  const risingArr: number[] = [];
  const fallingArr: number[] = [];
  const transSamplesArr: number[] = [];
  const transLevelsArr: number[] = [];
  let lineStart = 0;
  let lastReport = 0;

  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== '\n' && text[i] !== '\r') continue;
    const line = text.substring(lineStart, i).trim();
    lineStart = i + 1;
    if (!line) continue;

    if (samplingRate === null) {
      const m = line.match(ratePat);
      if (m) samplingRate = parseFloat(m[1]) * (mult[m[2].toLowerCase()] || 1);
    }

    if (line.substring(0, 3) !== 'D0:') continue;
    const payload = line.substring(3);
    for (let j = 0; j < payload.length; j++) {
      const ch = payload[j];
      if (ch === '"' || ch === '1') {
        if (prevLevel === 0) {
          risingArr.push(sampleCount);
          transSamplesArr.push(sampleCount);
          transLevelsArr.push(1);
        }
        prevLevel = 1;
      } else if (ch === '.' || ch === '0') {
        if (prevLevel === 1) {
          fallingArr.push(sampleCount);
          transSamplesArr.push(sampleCount);
          transLevelsArr.push(0);
        }
        prevLevel = 0;
      } else if (ch === '/') {
        if (prevLevel === 0) {
          risingArr.push(sampleCount);
          transSamplesArr.push(sampleCount);
          transLevelsArr.push(1);
        }
        prevLevel = 1;
      } else if (ch === '\\') {
        if (prevLevel === 1) {
          fallingArr.push(sampleCount);
          transSamplesArr.push(sampleCount);
          transLevelsArr.push(0);
        }
        prevLevel = 0;
      } else {
        continue;
      }
      sampleCount++;
    }

    if (sampleCount - lastReport >= 2000000) {
      lastReport = sampleCount;
      (self as unknown as Worker).postMessage({ type: 'progress', sampleCount });
    }
  }

  if (samplingRate) {
    for (let i = 0; i < risingArr.length; i++) risingArr[i] = risingArr[i] / samplingRate;
    for (let i = 0; i < fallingArr.length; i++) fallingArr[i] = fallingArr[i] / samplingRate;
    for (let i = 0; i < transSamplesArr.length; i++)
      transSamplesArr[i] = transSamplesArr[i] / samplingRate;
  }

  const re = new Float64Array(risingArr);
  const fe = new Float64Array(fallingArr);
  const tt = new Float64Array(transSamplesArr);
  const tl = new Int8Array(transLevelsArr);

  (self as unknown as Worker).postMessage(
    {
      type: 'done',
      samplingRate,
      sampleCount,
      risingEdges: re,
      fallingEdges: fe,
      transTimes: tt,
      transLevels: tl,
      format: 'txt',
    },
    [re.buffer, fe.buffer, tt.buffer, tl.buffer]
  );
};
