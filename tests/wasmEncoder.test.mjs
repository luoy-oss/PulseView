import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, * as wasmModule from '../src/wasm/pkg/pulseview_wasm_core.js';
import { computeAbAnalysis } from '../src/computeAb.ts';
import { computeDirectionAnalysis, DIRECTION_PRESETS } from '../src/computeDirection.ts';
import { initializeWasm, resetWasmRuntimeForTests } from '../src/wasm/runtime.ts';

const bytes = await readFile(new URL('../src/wasm/pkg/pulseview_wasm_core_bg.wasm', import.meta.url));
await init({ module_or_path: bytes });
resetWasmRuntimeForTests();
await initializeWasm(async () => wasmModule);

const channel = (id, name, times, levels) => ({
  id, name, transitions: new Float64Array(times), levels: new Int8Array(levels),
});
const pulse = channel('!', 'D0', [0, 1, 2, 3, 4, 5], [0, 1, 0, 1, 0, 1]);
const direction = channel('"', 'D2', [0, 1.5, 3.5], [1, 0, 1]);
const directionResult = computeDirectionAnalysis(pulse, direction, DIRECTION_PRESETS[0]);
assert.deepEqual(directionResult.freqPoints.map((point) => point.freq), [-0.5, 0.5]);
assert.equal(directionResult.meanDelay, 0.75);

const a = channel('a', 'A', [0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 1, 0, 0, 1, 1, 0, 0]);
const b = channel('b', 'B', [0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 0, 1, 1, 0, 0, 1, 1, 0]);
const ab = computeAbAnalysis(a, b);
assert.ok(ab.cycles >= 1);
assert.ok(ab.freqPoints.every((point) => Number.isFinite(point.freq)));
console.log('WASM encoder equivalence tests passed');
