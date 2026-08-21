export interface TxtEdgeParseResult {
  samplingRate: number;
  sampleCount: number;
  risingEdges: Float64Array;
  fallingEdges: Float64Array;
  transTimes: Float64Array;
  transLevels: Int8Array;
}

const EDGE_HEADER = /^\s*time\s*\[\s*s\s*\]\s*,/i;
const EDGE_ROW = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*,\s*([01])(?:\s*,.*)?\s*$/;

export function isTxtEdgeList(lines: string[]): boolean {
  return lines.slice(0, 20).some((line) => EDGE_HEADER.test(line));
}

export function parseTxtEdgeList(lines: string[]): TxtEdgeParseResult {
  const times: number[] = [];
  const levels: number[] = [];
  let sampleCount = 0;

  for (const line of lines) {
    const match = line.match(EDGE_ROW);
    if (!match) continue;
    const time = Number(match[1]);
    const level = Number(match[2]);
    if (!Number.isFinite(time) || (times.length > 0 && time < times[times.length - 1])) continue;
    sampleCount++;
    if (levels.length === 0 || level !== levels[levels.length - 1]) {
      times.push(time);
      levels.push(level);
    }
  }

  const rising: number[] = [];
  const falling: number[] = [];
  const transitionTimes: number[] = [];
  const transitionLevels: number[] = [];
  for (let index = 0; index < times.length; index++) {
    const level = levels[index];
    transitionTimes.push(times[index]);
    transitionLevels.push(level);
    if (index === 0) continue;
    if (level === 1) rising.push(times[index]);
    else falling.push(times[index]);
  }

  const intervals: number[] = [];
  for (let index = 1; index < times.length; index++) {
    const interval = times[index] - times[index - 1];
    if (interval > 0) intervals.push(interval);
  }
  intervals.sort((a, b) => a - b);
  const samplingRate = intervals.length > 0
    ? 1 / intervals[intervals.length >> 1]
    : 0;

  return {
    samplingRate,
    sampleCount,
    risingEdges: new Float64Array(rising),
    fallingEdges: new Float64Array(falling),
    transTimes: new Float64Array(transitionTimes),
    transLevels: new Int8Array(transitionLevels),
  };
}
