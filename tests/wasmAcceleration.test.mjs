import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, * as wasmModule from '../src/wasm/pkg/pulseview_wasm_core.js';
import { computeAcceleration, DEFAULT_ACCEL_OPTIONS } from '../src/acceleration.ts';
import { wasmComputeAcceleration } from '../src/wasm/acceleration.ts';
import { initializeWasm, resetWasmRuntimeForTests } from '../src/wasm/runtime.ts';

const bytes = await readFile(new URL('../src/wasm/pkg/pulseview_wasm_core_bg.wasm', import.meta.url));
await init({ module_or_path: bytes });
resetWasmRuntimeForTests();
await initializeWasm(async () => wasmModule);

const cases = [
  Array.from({ length: 61 }, (_, index) => ({ time: index * 0.02, freq: 100 + index * 0.24 })),
  Array.from({ length: 30 }, (_, index) => ({ time: index * 0.1, freq: 500 })),
  [{ time: 1, freq: 10 }, { time: 1, freq: 20 }, { time: 2, freq: 30 }],
];

for (const points of cases) {
  for (const algorithm of ['raw', 'sg', 'fft', 'kalman', 'td']) {
    const options = { ...DEFAULT_ACCEL_OPTIONS, algorithm };
    const result = wasmComputeAcceleration(points, options, () => computeAcceleration(points, options));
    assert.equal(result.length, points.length);
    assert.ok(result.every((point) => Number.isFinite(point.value)));
  }
}
const tiny = [{ time: 0, freq: 1 }, { time: 1, freq: 2 }];
assert.deepEqual(wasmComputeAcceleration(tiny, DEFAULT_ACCEL_OPTIONS, () => computeAcceleration(tiny)), []);
console.log('WASM acceleration equivalence tests passed');
