export interface FreqPoint {
  time: number;
  freq: number;
  period?: number;
}

// 导数曲线点：value 为加速度（Hz/s）或加加速度（Hz/s²）
export interface DerivPoint {
  time: number;
  value: number;
}

export interface Transition {
  time_s: number;
  level: 0 | 1;
}

// 频率计算模式：pulse = 高电平脉冲宽度（freq=1/(2×脉宽)，默认）；
// rising = 相邻两个上升沿的周期（freq=1/周期）
export type FreqMode = 'pulse' | 'rising';

export interface AccelSegment {
  type: 'accel' | 'decel' | 'const';
  startTime: number;
  endTime: number;
  duration: number;
  startFreq: number;
  endFreq: number;
  rate: number;
}

export interface ParseResult {
  samplingRate: number;
  sampleCount: number;
  risingEdges: Float64Array;
  fallingEdges: Float64Array;
  format: 'vcd' | 'txt' | 'sr' | 'saleae';
}

export interface AppState {
  samplingRate: number;
  sampleCount: number;
  pulseCount: number;
  risingEdges: Float64Array | null;
  fallingEdges: Float64Array | null;
  transTimes: Float64Array | null;
  transLevels: Int8Array | null;
  allFreqPts: FreqPoint[];
  freqPts: FreqPoint[];
  cursorA: number | null;
  cursorB: number | null;
  accelSegs: AccelSegment[];
  rangeMode: boolean;
  rangeStart: number | null;
  rangeEnd: number | null;
  rangeDataIdxStart: number | null;
  rangeDataIdxEnd: number | null;
  fileName: string;
  format: 'vcd' | 'txt' | 'sr' | 'saleae';
  freqMode: FreqMode;
  // 多图视图：导数视图开关 + 各图可见性（默认只显示频率图）
  showDerivs: boolean;
  showFreqChart: boolean;
  showAccelChart: boolean;
  showJerkChart: boolean;
}
