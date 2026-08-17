export interface FreqPoint {
  time: number;
  freq: number;
  period?: number;
  // 占空比（0~1）：高电平脉宽 / 周期，pulse 模式计算并显示
  dutyCycle?: number;
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

// 频率计算模式：pulse = 高电平脉冲宽度（freq=1/(2×脉宽)，等价于假设占空比 50%）；
// rising = 相邻两个上升沿的周期（freq=1/周期）；
// falling = 相邻两个下降沿的周期（freq=1/周期，默认），时间点取相邻两下降沿中点
export type FreqMode = 'pulse' | 'rising' | 'falling';

// 占空比/周期计算的基准边沿：falling = 相邻两脉冲下降沿间隔（默认），
// rising = 相邻两脉冲上升沿间隔
export type EdgeBase = 'falling' | 'rising';

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
  // 占空比修正：勾选后脉冲宽度模式按 freq = 1/(2×脉宽) × (占空比/50%) = 1/周期 计算，
  // 对窄脉冲/占空比变化信号给出真实周期频率；默认关闭（按 50% 占空比假设）
  dutyCorrect: boolean;
  // 占空比/周期计算的基准边沿（默认下降沿，可切换上升沿）
  edgeBase: EdgeBase;
  // 多图视图：导数视图开关 + 各图可见性（默认只显示频率图）
  showDerivs: boolean;
  showFreqChart: boolean;
  showAccelChart: boolean;
  showJerkChart: boolean;
}
