import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import init, * as wasm from '../src/wasm/pkg/pulseview_wasm_core.js';
import { computeFreqFromTransitions } from '../src/compute.ts';
import { computeAcceleration, DEFAULT_ACCEL_OPTIONS } from '../src/acceleration.ts';
import { computeAbAnalysis } from '../src/computeAb.ts';
import { computeDirectionAnalysis, DIRECTION_PRESETS } from '../src/computeDirection.ts';
import { buildVisibleData } from '../src/decimate.ts';
import { setWasmComparisonForTests } from '../src/wasm/compare.ts';
import { initializeWasm, resetWasmRuntimeForTests } from '../src/wasm/runtime.ts';
import { wasmComputeAcceleration } from '../src/wasm/acceleration.ts';
import { wasmComputeFrequency } from '../src/wasm/compute.ts';

function measure(run, iterations = 3) {
  run();
  const samples = [];
  let lastResult;
  for (let index = 0; index < iterations; index++) {
    const started = performance.now();
    lastResult = run();
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return { medianMs: samples[samples.length >> 1], result: lastResult };
}

async function compareAdapter(module, size, tsRun, wasmRun, iterations = 3) {
  resetWasmRuntimeForTests();
  setWasmComparisonForTests(false);
  const ts = measure(tsRun, iterations);
  await initializeWasm(async () => wasm);
  const wasmAdapter = measure(wasmRun, iterations);
  assert.equal(wasmAdapter.result.length ?? 1, ts.result.length ?? 1, `${module} output length`);
  return { module, size, tsMs: ts.medianMs, wasmAdapterMs: wasmAdapter.medianMs };
}

function transitionFixture(count) {
  const times = new Float64Array(count);
  const levels = new Int8Array(count);
  for (let index = 0; index < count; index++) {
    times[index] = index * 0.0001;
    levels[index] = index & 1;
  }
  return { times, levels };
}

function pointFixture(count) {
  return Array.from({ length: count }, (_, index) => ({
    time: index * 0.001,
    freq: 1000 + Math.sin(index / 50) * 100,
    period: 0.001,
    dutyCycle: 0.5,
  }));
}

const wasmBytes = await readFile(new URL('../src/wasm/pkg/pulseview_wasm_core_bg.wasm', import.meta.url));
const initStarted = performance.now();
await init({ module_or_path: wasmBytes });
const initMs = performance.now() - initStarted;
const rows = [];

for (const size of [10_000, 100_000, 1_000_000]) {
  const { times, levels } = transitionFixture(size);
  const tsRun = () => computeFreqFromTransitions(times, levels, 'vcd', 'falling');
  rows.push(await compareAdapter('frequency-adapter', size, tsRun,
    () => wasmComputeFrequency(times, levels, 'falling', false, 'falling', false, 0, 0, tsRun)));
}

for (const size of [10_000, 100_000, 1_000_000]) {
  const points = pointFixture(size);
  const options = { ...DEFAULT_ACCEL_OPTIONS, algorithm: 'sg' };
  const tsRun = () => computeAcceleration(points, options);
  rows.push(await compareAdapter('acceleration-sg-adapter', size, tsRun,
    () => wasmComputeAcceleration(points, options, tsRun)));
}

const channel = (id, times, levels) => ({ id, name: id, transitions: times, levels });
for (const cycles of [100, 500, 1_000]) {
  const count = cycles * 4 + 1;
  const aTimes = new Float64Array(count);
  const bTimes = new Float64Array(count);
  const aLevels = new Int8Array(count);
  const bLevels = new Int8Array(count);
  const states = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let index = 0; index < count; index++) {
    aTimes[index] = index;
    bTimes[index] = index;
    [aLevels[index], bLevels[index]] = states[index % 4];
  }
  const a = channel('a', aTimes, aLevels);
  const b = channel('b', bTimes, bLevels);
  const run = () => computeAbAnalysis(a, b);
  rows.push(await compareAdapter('ab-analysis-adapter', count, run, run, 1));
}

for (const size of [10_000, 30_000]) {
  const pulseFixture = transitionFixture(size);
  const directionCount = Math.max(3, Math.floor(size / 100));
  const directionTimes = new Float64Array(directionCount);
  const directionLevels = new Int8Array(directionCount);
  for (let index = 0; index < directionCount; index++) {
    directionTimes[index] = index * 0.01;
    directionLevels[index] = index & 1;
  }
  const pulse = channel('pulse', pulseFixture.times, pulseFixture.levels);
  const direction = channel('direction', directionTimes, directionLevels);
  const run = () => computeDirectionAnalysis(pulse, direction, DIRECTION_PRESETS[0]);
  rows.push(await compareAdapter('direction-analysis-adapter', size, run, run, 1));
}

for (const size of [10_000, 100_000, 1_000_000]) {
  const points = pointFixture(size);
  const times = Float64Array.from(points, (point) => point.time);
  const frequencies = Float64Array.from(points, (point) => point.freq);
  const periods = Float64Array.from(points, (point) => point.period);
  const duties = Float64Array.from(points, (point) => point.dutyCycle);
  const range = { min: 0, max: size * 0.001 };
  const ts = measure(() => buildVisibleData(points, range, 1000), 10);
  const kernel = measure(() => wasm.build_visible_data(
    times, frequencies, periods, duties, range.min, range.max, 1000), 10);
  rows.push({ module: 'decimation-experimental-kernel', size, tsMs: ts.medianMs, wasmAdapterMs: kernel.medianMs });
}

setWasmComparisonForTests(null);
resetWasmRuntimeForTests();
console.log(JSON.stringify({ initMs, rows }, null, 2));
