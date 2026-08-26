import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, * as wasm from '../src/wasm/pkg/pulseview_wasm_core.js';

const wasmBytes = await readFile(new URL('../src/wasm/pkg/pulseview_wasm_core_bg.wasm', import.meta.url));
assert.ok(wasmBytes.length > 0, 'generated WASM binary must not be empty');
await init({ module_or_path: wasmBytes });

const requiredExports = [
  'compute_ab_analysis_batch',
  'compute_direction_analysis_batch',
  'compute_frequency_points',
  'compute_acceleration_points',
];
for (const name of requiredExports) {
  assert.equal(typeof wasm[name], 'function', `generated WASM must export ${name}`);
}

assert.equal(wasm.wasm_smoke_add(2, 3), 5);
console.log('generated WASM package validation passed');
