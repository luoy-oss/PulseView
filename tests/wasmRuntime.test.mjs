import assert from 'node:assert/strict';
import {
  assertIntegerArraysEquivalent,
  assertNumericArraysEquivalent,
  dualRun,
  numbersEquivalent,
  setWasmComparisonForTests,
} from '../src/wasm/compare.ts';
import {
  getWasmExports,
  getWasmState,
  disableWasm,
  initializeWasm,
  resetWasmRuntimeForTests,
} from '../src/wasm/runtime.ts';

assert.equal(numbersEquivalent(1, 1 + 1e-10), true);
assert.equal(numbersEquivalent(1, 1.01), false);
assert.doesNotThrow(() => assertNumericArraysEquivalent('float', 2, [1, 2], [1 + 1e-10, 2]));
assert.throws(
  () => assertNumericArraysEquivalent('length', 2, [1, 2], [1]),
  /length TS=2, WASM=1/,
);
assert.throws(
  () => assertIntegerArraysEquivalent('integer', 1, [1], [2]),
  /index=0, TS=1, WASM=2/,
);
assert.equal(
  dualRun('smoke', 2, () => 4, () => 4, (ts, wasm) => assert.equal(ts, wasm)),
  4,
);
assert.equal(
  dualRun('fallback', 1, () => 7, () => { throw new Error('WASM failed'); }, () => {}),
  7,
);
assert.throws(
  () => dualRun('mismatch', 1, () => 1, () => 2, (ts, wasm) => assert.equal(ts, wasm)),
  /WASM mismatch.*mismatch/,
);

resetWasmRuntimeForTests();
const fakeExports = { wasm_smoke_add: (left, right) => left + right };
assert.equal(getWasmState().status, 'unavailable');
assert.equal(await initializeWasm(async () => fakeExports), fakeExports);
assert.equal(getWasmState().status, 'ready');
assert.equal(getWasmExports()?.wasm_smoke_add(2, 3), 5);

resetWasmRuntimeForTests();
assert.equal(await initializeWasm(async () => { throw new Error('load failed'); }), null);
assert.equal(getWasmState().status, 'fallback');
assert.match(getWasmState().error?.message || '', /load failed/);

resetWasmRuntimeForTests();
let failingCalls = 0;
await initializeWasm(async () => fakeExports);
setWasmComparisonForTests(false);
assert.equal(dualRun('broken-kernel', 1, () => 9, () => {
  failingCalls++;
  throw new Error('kernel failed');
}, () => {}), 9);
assert.equal(getWasmState().status, 'fallback');
assert.equal(getWasmState().failedModule, 'broken-kernel');
assert.equal(getWasmExports(), null);
assert.equal(failingCalls, 1);
setWasmComparisonForTests(null);

resetWasmRuntimeForTests();
let resolveDelayed;
const delayedInitialization = initializeWasm(() => new Promise((resolve) => { resolveDelayed = resolve; }));
disableWasm();
resolveDelayed(fakeExports);
assert.equal(await delayedInitialization, null);
assert.equal(getWasmState().status, 'unavailable');
assert.equal(getWasmExports(), null);

console.log('WASM runtime and comparison tests passed');
