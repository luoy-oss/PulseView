export interface FreqPoint {
  time: number;
  freq: number;
  period?: number;
}

export interface Transition {
  time_s: number;
  level: 0 | 1;
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
  format: 'vcd' | 'txt';
}

export interface AppState {
  samplingRate: number;
  sampleCount: number;
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
  format: 'vcd' | 'txt';
}
