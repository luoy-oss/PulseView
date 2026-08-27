import type { FreqPoint } from '../types.ts';
import type { LowGapMarker } from '../types.ts';
import { assertIntegerArraysEquivalent, assertNumericArraysEquivalent, dualRun } from './compare.ts';
import { getWasmExports } from './runtime.ts';

export interface ComputeReferences {
  deriveEdgesFromTransitions(times: Float64Array, levels: Int8Array): {
    risingEdges: Float64Array;
    fallingEdges: Float64Array;
  };
  invertTransitionLevels(levels: Int8Array): Int8Array;
  countPulsesFromTransitions(levels: Int8Array): number;
  computeStats(points: FreqPoint[]): {
    min: number;
    max: number;
    avg: number;
    std: number;
    cv: number;
  } | null;
}

const frequencyModeIds = { pulse: 0, rising: 1, falling: 2, 'low-gap': 3 } as const;

function unflattenPoints(values: Float64Array): FreqPoint[] {
  const result: FreqPoint[] = [];
  for (let index = 0; index < values.length; index += 4) {
    result.push({
      time: values[index],
      freq: values[index + 1],
      period: values[index + 2],
      dutyCycle: Number.isNaN(values[index + 3]) ? undefined : values[index + 3],
    });
  }
  return result;
}

function assertPointsEquivalent(moduleName: string, inputSize: number, ts: FreqPoint[], wasm: FreqPoint[]): void {
  if (ts.length !== wasm.length) throw new Error(`length TS=${ts.length}, WASM=${wasm.length}`);
  for (let index = 0; index < ts.length; index++) {
    const left = ts[index];
    const right = wasm[index];
    assertNumericArraysEquivalent(moduleName, inputSize,
      [left.time, left.freq, left.period ?? Number.NaN, left.dutyCycle ?? Number.NaN],
      [right.time, right.freq, right.period ?? Number.NaN, right.dutyCycle ?? Number.NaN]);
  }
}

export function wasmDeriveEdges(
  times: Float64Array,
  levels: Int8Array,
  references: ComputeReferences,
) {
  const wasm = getWasmExports();
  if (!wasm) return references.deriveEdgesFromTransitions(times, levels);
  return dualRun(
    'deriveEdgesFromTransitions',
    times.length,
    () => references.deriveEdgesFromTransitions(times, levels),
    () => ({
      risingEdges: wasm.derive_rising_edges(times, levels),
      fallingEdges: wasm.derive_falling_edges(times, levels),
    }),
    (ts, result) => {
      assertNumericArraysEquivalent('risingEdges', times.length, ts.risingEdges, result.risingEdges);
      assertNumericArraysEquivalent('fallingEdges', times.length, ts.fallingEdges, result.fallingEdges);
    },
  );
}

export function wasmInvertLevels(levels: Int8Array, references: ComputeReferences): Int8Array {
  const wasm = getWasmExports();
  if (!wasm) return references.invertTransitionLevels(levels);
  return dualRun(
    'invertTransitionLevels', levels.length,
    () => references.invertTransitionLevels(levels),
    () => wasm.invert_transition_levels(levels),
    (ts, result) => assertIntegerArraysEquivalent('invertTransitionLevels', levels.length, ts, result),
  );
}

export function wasmCountPulses(levels: Int8Array, references: ComputeReferences): number {
  const wasm = getWasmExports();
  if (!wasm) return references.countPulsesFromTransitions(levels);
  return dualRun(
    'countPulsesFromTransitions', levels.length,
    () => references.countPulsesFromTransitions(levels),
    () => wasm.count_pulses_from_transitions(levels),
    (ts, result) => {
      if (ts !== result) throw new Error(`TS=${ts}, WASM=${result}`);
    },
  );
}

export function wasmComputeStats(points: FreqPoint[], references: ComputeReferences) {
  const wasm = getWasmExports();
  if (!wasm) return references.computeStats(points);
  const frequencies = Float64Array.from(points, (point) => point.freq);
  return dualRun(
    'computeStats', points.length,
    () => references.computeStats(points),
    () => {
      const values = wasm.compute_stats_values(frequencies);
      return values.length === 0
        ? null
        : { min: values[0], max: values[1], avg: values[2], std: values[3], cv: values[4] };
    },
    (ts, result) => {
      if (ts === null || result === null) {
        if (ts !== result) throw new Error(`TS=${ts}, WASM=${result}`);
        return;
      }
      assertNumericArraysEquivalent(
        'computeStats', points.length,
        [ts.min, ts.max, ts.avg, ts.std, ts.cv],
        [result.min, result.max, result.avg, result.std, result.cv],
      );
    },
  );
}

export function wasmComputeHistogram(
  frequencies: number[],
  minBins: number,
  maxBins: number,
  tsRun: () => { labels: string[]; bins: number[] } | null,
) {
  const wasm = getWasmExports();
  if (!wasm) return tsRun();
  const values = Float64Array.from(frequencies);
  return dualRun(
    'computeHistogramBins', frequencies.length, tsRun,
    () => {
      const meta = wasm.compute_histogram_meta(values, minBins, maxBins);
      if (meta.length === 0) return null;
      const [minimum, maximum, rawCount] = meta;
      const binCount = Math.trunc(rawCount);
      const width = (maximum - minimum) / binCount;
      // 与 TypeScript 的 new Array(binCount) 一致：负数桶数同样抛 RangeError，
      // 而不是被 Array.from 静默截断为 0。
      const labels = new Array<string>(binCount);
      for (let index = 0; index < binCount; index++) {
        const frequency = minimum + (index + 0.5) * width;
        if (frequency >= 1e9) labels[index] = `${(frequency / 1e9).toFixed(2)}G`;
        else if (frequency >= 1e6) labels[index] = `${(frequency / 1e6).toFixed(2)}M`;
        else if (frequency >= 1e3) labels[index] = `${(frequency / 1e3).toFixed(2)}k`;
        else labels[index] = frequency.toFixed(2);
      }
      return { labels, bins: Array.from(wasm.compute_histogram_counts(values, minimum, maximum, binCount)) };
    },
    (ts, result) => {
      if (ts === null || result === null) {
        if (ts !== result) throw new Error(`TS=${ts}, WASM=${result}`);
        return;
      }
      if (ts.labels.join('\0') !== result.labels.join('\0')) throw new Error('histogram labels differ');
      assertIntegerArraysEquivalent('computeHistogramBins', frequencies.length, ts.bins, result.bins);
    },
  );
}

export function wasmComputeFrequency(
  times: Float64Array,
  levels: Int8Array,
  mode: keyof typeof frequencyModeIds,
  dutyCorrect: boolean,
  edgeBase: 'falling' | 'rising',
  toleranceEnabled: boolean,
  tolerancePct: number,
  defaultLevel: 0 | 1,
  tsRun: () => FreqPoint[],
): FreqPoint[] {
  const wasm = getWasmExports();
  if (!wasm) return tsRun();
  return dualRun(
    'computeFreqFromTransitions', times.length, tsRun,
    () => unflattenPoints(wasm.compute_frequency_points(
      times, levels, frequencyModeIds[mode], dutyCorrect,
      edgeBase === 'rising' ? 1 : 0, toleranceEnabled, tolerancePct, defaultLevel,
    )),
    (ts, result) => assertPointsEquivalent('computeFreqFromTransitions', times.length, ts, result),
  );
}

export function wasmComputeLowGapMarkers(
  times: Float64Array,
  levels: Int8Array,
  threshold: number,
  toleranceEnabled: boolean,
  tolerancePct: number,
  tsRun: () => LowGapMarker[],
): LowGapMarker[] {
  const wasm = getWasmExports();
  if (!wasm) return tsRun();
  return dualRun(
    'computeLowGapMarkers', times.length, tsRun,
    () => {
      const flat = wasm.compute_low_gap_markers(times, levels, threshold, toleranceEnabled, tolerancePct);
      const result: LowGapMarker[] = [];
      for (let index = 0; index < flat.length; index += 4) {
        result.push({ startTime: flat[index], endTime: flat[index + 1], gap: flat[index + 2], dutyCycle: flat[index + 3] });
      }
      return result;
    },
    (ts, result) => {
      if (ts.length !== result.length) throw new Error(`length TS=${ts.length}, WASM=${result.length}`);
      for (let index = 0; index < ts.length; index++) {
        assertNumericArraysEquivalent('computeLowGapMarkers', times.length,
          [ts[index].startTime, ts[index].endTime, ts[index].gap, ts[index].dutyCycle],
          [result[index].startTime, result[index].endTime, result[index].gap, result[index].dutyCycle]);
      }
    },
  );
}
