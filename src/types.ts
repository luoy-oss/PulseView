export interface FreqPoint {
  time: number;
  freq: number;
  period?: number;
  // 占空比（0~1）：高电平脉宽 / 周期，pulse 模式计算并显示
  dutyCycle?: number;
}

export interface CursorMarker {
  id: string;
  label: string;
  index: number | null;
  color: string;
}

export interface LowGapMarker {
  startTime: number;
  endTime: number;
  gap: number;
  dutyCycle: number;
}

// 导数曲线点：value 为加速度（Hz/s）
export interface DerivPoint {
  time: number;
  value: number;
}

export type AccelAlgorithm = 'sg' | 'fft' | 'kalman' | 'td';

export interface AccelOptions {
  algorithm: AccelAlgorithm;
  sgWindow: number;
  fftCutoffHz: number;
  kalmanProcessNoise: number;
  kalmanMeasurementNoise: number;
  tdBandwidth: number;
}

export interface Transition {
  time_s: number;
  level: 0 | 1;
}

// 频率计算模式：pulse = 高电平脉冲宽度（freq=1/(2×脉宽)，等价于假设占空比 50%）；
// rising = 相邻两个上升沿的周期（freq=1/周期）；
// falling = 相邻两个下降沿的周期（freq=1/周期，默认），时间点取相邻两下降沿中点；
// low-gap = 严格 50% 占空比前提下推导的额外低电平间隔（测试功能）
export type FreqMode = 'pulse' | 'rising' | 'falling' | 'low-gap';

// 占空比/周期计算的基准边沿：falling = 相邻两脉冲下降沿间隔（默认），
// rising = 相邻两脉冲上升沿间隔
export type EdgeBase = 'falling' | 'rising';

export type PulseLevel = 'high' | 'low';
export type DefaultLevel = 0 | 1;

export interface SidebarStatVisibility {
  samplingRate: boolean;
  risingCount: boolean;
  fallingCount: boolean;
  pulseCount: boolean;
  duration: boolean;
  pointCount: boolean;
  minimum: boolean;
  maximum: boolean;
  average: boolean;
  standardDeviation: boolean;
  coefficientOfVariation: boolean;
}

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
  // PWM 测量导出（sigrok PulseView）直接提供频率/占空比/时间，
  // 无需边沿重建；存在时 App 直接使用，忽略 risingEdges/fallingEdges
  freqPts?: FreqPoint[];
  channels?: CsvChannel[];
}

export interface CsvChannel {
  id: string;
  name: string;
  samplingRate: number;
  sampleCount: number;
  risingEdges: Float64Array;
  fallingEdges: Float64Array;
  transTimes: Float64Array;
  transLevels: Int8Array;
}

export interface AbChannel {
  id: string;
  name: string;
  transitions: Float64Array;
  levels: Int8Array;
}

export interface AbParseResult {
  samplingRate: number;
  sampleCount: number;
  duration: number;
  channels: AbChannel[];
  format: 'vcd';
}

export interface AbAnalysis {
  freqPoints: AbFreqPoint[];
  aPulses: number;
  bPulses: number;
  aEdges: number;
  bEdges: number;
  cycles: number;
  forwardCycles: number;
  reverseCycles: number;
  invalidTransitions: number;
  meanPeriod: number;
  meanPhase: number;
  phaseStd: number;
  phaseLead: 'A 超前 B' | 'B 超前 A' | '无明显超前';
}

export type EncoderMode = 'ab' | 'direction';
export type DirectionLevel = 0 | 1;
export type DirectionMappingPreset = 'idle-high-forward-low' | 'idle-low-forward-low' | 'idle-low-forward-high' | 'idle-high-forward-high' | 'custom';

export interface DirectionMapping {
  preset: DirectionMappingPreset;
  idleLevel: DirectionLevel;
  forwardLevel: DirectionLevel;
}

export interface DirectionAnalysis {
  freqPoints: AbFreqPoint[];
  pulseEdges: number;
  forwardCycles: number;
  reverseCycles: number;
  unknownCycles: number;
  meanPeriod: number;
  meanDelay: number;
}

export interface AbFreqPoint {
  time: number;
  freq: number;
  direction: 'forward' | 'reverse';
}

export interface AppState {
  samplingRate: number;
  sampleCount: number;
  pulseCount: number;
  risingEdges: Float64Array | null;
  fallingEdges: Float64Array | null;
  transTimes: Float64Array | null;
  transLevels: Int8Array | null;
  sourceTransLevels: Int8Array | null;
  allFreqPts: FreqPoint[];
  freqPts: FreqPoint[];
  cursorA: number | null;
  cursorB: number | null;
  cursorMarkers: CursorMarker[];
  activeCursorId: string;
  cursorPair: [string, string] | null;
  accelSegs: AccelSegment[];
  rangeMode: boolean;
  rangeStart: number | null;
  rangeEnd: number | null;
  rangeDataIdxStart: number | null;
  rangeDataIdxEnd: number | null;
  fileName: string;
  format: 'vcd' | 'txt' | 'sr' | 'saleae';
  channels: CsvChannel[];
  activeChannelId: string | null;
  freqMode: FreqMode;
  // 占空比修正：勾选后脉冲宽度模式按 freq = 1/(2×脉宽) × (占空比/50%) = 1/周期 计算，
  // 对窄脉冲/占空比变化信号给出真实周期频率；默认关闭（按 50% 占空比假设）
  dutyCorrect: boolean;
  // 占空比/周期计算的基准边沿（默认下降沿，可切换上升沿）
  edgeBase: EdgeBase;
  pulseLevel: PulseLevel;
  defaultLevel: DefaultLevel;
  // 低电平间隔测试的可选容差过滤：启用后，50% ± 容差内的占空比误差归零为无间隔
  lowGapToleranceEnabled: boolean;
  lowGapTolerancePct: number;
  lowGapAnnotationEnabled: boolean;
  lowGapThreshold: number;
  // 多图视图：导数视图开关 + 各图可见性（默认只显示频率图）
  showDerivs: boolean;
  showFreqChart: boolean;
  showAccelChart: boolean;
}
