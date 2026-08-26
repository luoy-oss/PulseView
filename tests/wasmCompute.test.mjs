import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, * as wasmModule from '../src/wasm/pkg/pulseview_wasm_core.js';
import {
  computeFreqFromTransitions,
  computeLowGapMarkers,
  computeHistogramBins,
  computeStats,
  countPulsesFromTransitions,
  deriveEdgesFromTransitions,
  invertTransitionLevels,
} from '../src/compute.ts';
import { resetWasmRuntimeForTests, initializeWasm } from '../src/wasm/runtime.ts';
import {
  wasmComputeStats,
  wasmCountPulses,
  wasmDeriveEdges,
  wasmInvertLevels,
} from '../src/wasm/compute.ts';

const bytes = await readFile(new URL('../src/wasm/pkg/pulseview_wasm_core_bg.wasm', import.meta.url));
await init({ module_or_path: bytes });
resetWasmRuntimeForTests();
await initializeWasm(async () => wasmModule);

const references = {
  deriveEdgesFromTransitions,
  invertTransitionLevels,
  countPulsesFromTransitions,
  computeStats,
};
const times = new Float64Array([0, 1, 2, 4, 5, 6]);
const levels = new Int8Array([0, 1, 0, 1, 0, 1]);
const edges = wasmDeriveEdges(times, levels, references);
assert.deepEqual([...edges.risingEdges], [1, 4, 6]);
assert.deepEqual([...edges.fallingEdges], [2, 5]);
assert.deepEqual([...wasmInvertLevels(levels, references)], [1, 0, 1, 0, 1, 0]);
assert.equal(wasmCountPulses(levels, references), 2);
assert.deepEqual(wasmComputeStats([], references), null);
const stats = wasmComputeStats([
  { time: 0, freq: 1 },
  { time: 1, freq: 2 },
  { time: 2, freq: 3 },
], references);
assert.equal(stats?.avg, 2);
assert.equal(stats?.std, 1);
assert.deepEqual(computeHistogramBins([0, 1, 2, 3], 2, 4), {
  labels: ['0.38', '1.13', '1.88', '2.63'],
  bins: [1, 1, 1, 1],
});

function unflattenPoints(values) {
  const points = [];
  for (let index = 0; index < values.length; index += 4) {
    points.push({
      time: values[index],
      freq: values[index + 1],
      period: values[index + 2],
      dutyCycle: Number.isNaN(values[index + 3]) ? undefined : values[index + 3],
    });
  }
  return points;
}

function comparePoints(mode, caseTimes, caseLevels, options = {}) {
  const ts = computeFreqFromTransitions(
    caseTimes,
    caseLevels,
    'vcd',
    mode,
    options.dutyCorrect ?? false,
    options.edgeBase ?? 'falling',
    options.toleranceEnabled ?? false,
    options.tolerancePct ?? 0,
    options.defaultLevel ?? 0,
  );
  const modeId = { pulse: 0, rising: 1, falling: 2, 'low-gap': 3 }[mode];
  const wasm = unflattenPoints(wasmModule.compute_frequency_points(
    caseTimes,
    caseLevels,
    modeId,
    options.dutyCorrect ?? false,
    options.edgeBase === 'rising' ? 1 : 0,
    options.toleranceEnabled ?? false,
    options.tolerancePct ?? 0,
    options.defaultLevel ?? 0,
  ));
  assert.equal(wasm.length, ts.length, `${mode} point count`);
  for (let index = 0; index < ts.length; index++) {
    for (const key of ['time', 'freq', 'period', 'dutyCycle']) {
      assert.ok(
        ts[index][key] === wasm[index][key]
          || Math.abs(ts[index][key] - wasm[index][key]) < 1e-12,
        `${mode} ${index}.${key}: TS=${ts[index][key]} WASM=${wasm[index][key]}`,
      );
    }
  }
}

const alternatingTimes = new Float64Array([0, 1, 2, 3, 4, 6, 7, 8, 9]);
const alternatingLevels = new Int8Array([0, 1, 0, 1, 0, 1, 0, 1, 0]);
for (const mode of ['pulse', 'rising', 'falling', 'low-gap']) {
  comparePoints(mode, alternatingTimes, alternatingLevels);
}
comparePoints('pulse', alternatingTimes, alternatingLevels, { dutyCorrect: true, edgeBase: 'rising' });
comparePoints('low-gap', alternatingTimes, alternatingLevels, { toleranceEnabled: true, tolerancePct: 1 });

const tsMarkers = computeLowGapMarkers(alternatingTimes, alternatingLevels, 0.001);
const flatMarkers = wasmModule.compute_low_gap_markers(alternatingTimes, alternatingLevels, 0.001, false, 0);
assert.equal(flatMarkers.length, tsMarkers.length * 4);
for (let index = 0; index < tsMarkers.length; index++) {
  assert.deepEqual(
    Array.from(flatMarkers.slice(index * 4, index * 4 + 4)),
    [tsMarkers[index].startTime, tsMarkers[index].endTime, tsMarkers[index].gap, tsMarkers[index].dutyCycle],
  );
}

console.log('WASM primitive compute equivalence tests passed');
