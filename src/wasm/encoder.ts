import type { AbAnalysis, AbChannel, AbFreqPoint, DirectionAnalysis, DirectionLevel, DirectionMapping } from '../types.ts';
import { assertNumericArraysEquivalent, dualRun } from './compare.ts';
import { getWasmExports } from './runtime.ts';

function decodePoints(flat: Float64Array, offset: number, count: number): AbFreqPoint[] {
  const points: AbFreqPoint[] = [];
  for (let index = 0; index < count; index++) {
    const start = offset + index * 3;
    points.push({
      time: flat[start],
      freq: flat[start + 1],
      direction: flat[start + 2] > 0 ? 'forward' : 'reverse',
    });
  }
  return points;
}

function assertEncoderPoints(name: string, inputSize: number, ts: AbFreqPoint[], wasm: AbFreqPoint[]): void {
  if (ts.length !== wasm.length) throw new Error(`length TS=${ts.length}, WASM=${wasm.length}`);
  for (let index = 0; index < ts.length; index++) {
    if (ts[index].direction !== wasm[index].direction) throw new Error(`point ${index} direction differs`);
    assertNumericArraysEquivalent(name, inputSize,
      [ts[index].time, ts[index].freq], [wasm[index].time, wasm[index].freq]);
  }
}

export function wasmComputeAbAnalysis(a: AbChannel, b: AbChannel, tsRun: () => AbAnalysis): AbAnalysis {
  const wasm = getWasmExports();
  if (!wasm) return tsRun();
  const inputSize = a.transitions.length + b.transitions.length;
  return dualRun('computeAbAnalysis', inputSize, tsRun, () => {
    const flat = wasm.compute_ab_analysis_batch(a.transitions, a.levels, b.transitions, b.levels);
    const count = flat[0] ?? 0;
    return {
      freqPoints: decodePoints(flat, 13, count),
      aPulses: flat[1], bPulses: flat[2], aEdges: flat[3], bEdges: flat[4], cycles: flat[5],
      forwardCycles: flat[6], reverseCycles: flat[7], invalidTransitions: flat[8],
      meanPeriod: flat[9], meanPhase: flat[10], phaseStd: flat[11],
      phaseLead: flat[12] > 0 ? 'A 超前 B' : flat[12] < 0 ? 'B 超前 A' : '无明显超前',
    };
  }, (ts, result) => {
    assertEncoderPoints('computeAbAnalysis.points', inputSize, ts.freqPoints, result.freqPoints);
    if (ts.phaseLead !== result.phaseLead) throw new Error(`phaseLead TS=${ts.phaseLead}, WASM=${result.phaseLead}`);
    assertNumericArraysEquivalent('computeAbAnalysis.header', inputSize,
      [ts.aPulses, ts.bPulses, ts.aEdges, ts.bEdges, ts.cycles, ts.forwardCycles, ts.reverseCycles, ts.invalidTransitions, ts.meanPeriod, ts.meanPhase, ts.phaseStd],
      [result.aPulses, result.bPulses, result.aEdges, result.bEdges, result.cycles, result.forwardCycles, result.reverseCycles, result.invalidTransitions, result.meanPeriod, result.meanPhase, result.phaseStd]);
  });
}

export function wasmComputeDirectionAnalysis(
  pulse: AbChannel,
  direction: AbChannel,
  mapping: DirectionMapping,
  pulseLevel: DirectionLevel,
  tsRun: () => DirectionAnalysis,
): DirectionAnalysis {
  const wasm = getWasmExports();
  if (!wasm) return tsRun();
  const inputSize = pulse.transitions.length + direction.transitions.length;
  return dualRun('computeDirectionAnalysis', inputSize, tsRun, () => {
    const flat = wasm.compute_direction_analysis_batch(
      pulse.transitions, pulse.levels, direction.transitions, direction.levels,
      mapping.forwardLevel, pulseLevel,
    );
    const count = flat[0] ?? 0;
    return {
      freqPoints: decodePoints(flat, 7, count), pulseEdges: flat[1], forwardCycles: flat[2],
      reverseCycles: flat[3], unknownCycles: flat[4], meanPeriod: flat[5], meanDelay: flat[6],
    };
  }, (ts, result) => {
    assertEncoderPoints('computeDirectionAnalysis.points', inputSize, ts.freqPoints, result.freqPoints);
    assertNumericArraysEquivalent('computeDirectionAnalysis.header', inputSize,
      [ts.pulseEdges, ts.forwardCycles, ts.reverseCycles, ts.unknownCycles, ts.meanPeriod, ts.meanDelay],
      [result.pulseEdges, result.forwardCycles, result.reverseCycles, result.unknownCycles, result.meanPeriod, result.meanDelay]);
  });
}
