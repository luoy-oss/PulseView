import type { AbChannel, AbFreqPoint, DirectionAnalysis, DirectionLevel, DirectionMapping, EdgeBase, FreqMode, FreqPoint } from './types.ts';
import { computeFreqFromTransitions } from './compute.ts';
import { wasmComputeDirectionAnalysis } from './wasm/encoder.ts';

export const DIRECTION_PRESETS: DirectionMapping[] = [
  { preset: 'idle-high-forward-low', idleLevel: 1, forwardLevel: 0 },
  { preset: 'idle-low-forward-low', idleLevel: 0, forwardLevel: 0 },
  { preset: 'idle-low-forward-high', idleLevel: 0, forwardLevel: 1 },
  { preset: 'idle-high-forward-high', idleLevel: 1, forwardLevel: 1 },
];

function edges(channel: AbChannel, level: DirectionLevel): number[] {
  const result: number[] = [];
  for (let i = 1; i < channel.transitions.length; i++) {
    if (channel.levels[i] === level && channel.levels[i - 1] !== level) result.push(channel.transitions[i]);
  }
  return result;
}

function latestLevel(channel: AbChannel, time: number): DirectionLevel | null {
  let level: DirectionLevel | null = channel.transitions.length ? channel.levels[0] as DirectionLevel : null;
  for (let i = 1; i < channel.transitions.length; i++) {
    if (channel.transitions[i] > time) break;
    level = channel.levels[i] as DirectionLevel;
  }
  return level;
}

export function computeDirectionAnalysis(
  pulse: AbChannel,
  direction: AbChannel,
  mapping: DirectionMapping,
  pulseLevel: DirectionLevel = 1,
  freqMode: FreqMode = 'rising',
  dutyCorrect = false,
  edgeBase: EdgeBase = 'rising',
): DirectionAnalysis {
  return wasmComputeDirectionAnalysis(
    pulse, direction, mapping, pulseLevel,
    () => computeDirectionAnalysisTs(pulse, direction, mapping, pulseLevel, freqMode, dutyCorrect, edgeBase),
  );
}

function computeDirectionAnalysisTs(
  pulse: AbChannel,
  direction: AbChannel,
  mapping: DirectionMapping,
  pulseLevel: DirectionLevel = 1,
  freqMode: FreqMode = 'rising',
  dutyCorrect = false,
  edgeBase: EdgeBase = 'rising',
): DirectionAnalysis {
  const pulseEdges = edges(pulse, pulseLevel);
  const points: AbFreqPoint[] = [];
  const periods: number[] = [];
  const delays: number[] = [];
  let forwardCycles = 0;
  let reverseCycles = 0;
  let unknownCycles = 0;
  for (let i = 1; i < pulseEdges.length; i++) {
    const period = pulseEdges[i] - pulseEdges[i - 1];
    if (!(period > 0)) continue;
    const level = latestLevel(direction, pulseEdges[i - 1]);
    if (level === null || (level !== 0 && level !== 1)) {
      unknownCycles++;
      continue;
    }
    const sign = level === mapping.forwardLevel ? 1 : -1;
    points.push({
      time: (pulseEdges[i - 1] + pulseEdges[i]) / 2,
      freq: sign / period,
      direction: sign > 0 ? 'forward' : 'reverse',
    });
    periods.push(period);
    const directionAtStart = latestLevel(direction, pulseEdges[i - 1]);
    if (directionAtStart !== null) {
      let lastDirectionChange = pulseEdges[i - 1];
      for (let j = 1; j < direction.transitions.length; j++) {
        if (direction.transitions[j] > pulseEdges[i - 1]) break;
        lastDirectionChange = direction.transitions[j];
      }
      delays.push(Math.max(0, pulseEdges[i - 1] - lastDirectionChange));
    }
    if (sign > 0) forwardCycles++;
    else reverseCycles++;
  }
  return {
    freqPoints: points,
    pulseEdges: pulseEdges.length,
    forwardCycles,
    reverseCycles,
    unknownCycles,
    meanPeriod: periods.length ? periods.reduce((sum, value) => sum + value, 0) / periods.length : 0,
    meanDelay: delays.length ? delays.reduce((sum, value) => sum + value, 0) / delays.length : 0,
  };
}

export function computeDirectionPulsePoints(
  pulse: AbChannel,
  direction: AbChannel,
  mapping: DirectionMapping,
  pulseLevel: DirectionLevel,
  freqMode: FreqMode,
  dutyCorrect: boolean,
  edgeBase: EdgeBase,
): FreqPoint[] {
  const levels = new Int8Array(pulse.levels.length);
  for (let i = 0; i < levels.length; i++) levels[i] = pulse.levels[i] === pulseLevel ? 1 : 0;
  const points = computeFreqFromTransitions(pulse.transitions, levels, 'vcd', freqMode, dutyCorrect, edgeBase, false, 0, 0);
  const rises = edges(pulse, pulseLevel);
  return points.map((point, pointIndex) => {
    // computeFreqFromTransitions emits rising points for the first pulse and
    // then for each measured interval's end. Keep the sign tied to the
    // interval's actual starting edge, including the first boundary point.
    const start = freqMode === 'rising'
      ? rises[Math.min(pointIndex, Math.max(0, rises.length - 2))] ?? point.time
      : freqMode === 'falling'
        ? point.time - (point.period ?? 0) / 2
        : point.time;
    const level = latestLevel(direction, start);
    const sign = level === mapping.forwardLevel ? 1 : -1;
    return { ...point, freq: sign * point.freq };
  });
}

export function scorePulseChannel(channel: AbChannel): number {
  const transitions = channel.transitions.length;
  const name = `${channel.name} ${channel.id}`.toLowerCase();
  const hint = /pulse|step|clock|d0/.test(name) ? 10 : 0;
  return transitions * 2 + Math.min(transitions, 100) + hint;
}

export function scoreDirectionChannel(channel: AbChannel): number {
  const transitions = channel.transitions.length;
  const name = `${channel.name} ${channel.id}`.toLowerCase();
  const hint = /dir|direction|d2/.test(name) ? 10 : 0;
  return hint + (transitions ? 1000 / transitions : 0);
}

export function suggestDirectionChannels(channels: AbChannel[]): { pulse: AbChannel; direction: AbChannel } | null {
  if (channels.length < 2) return null;
  const pulse = [...channels].sort((a, b) => scorePulseChannel(b) - scorePulseChannel(a))[0];
  const direction = [...channels]
    .filter((channel) => channel.id !== pulse.id)
    .sort((a, b) => scoreDirectionChannel(b) - scoreDirectionChannel(a))[0];
  return direction ? { pulse, direction } : null;
}
