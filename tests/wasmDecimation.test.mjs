import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, * as wasm from '../src/wasm/pkg/pulseview_wasm_core.js';
import { buildVisibleData, buildVisibleEnvelope, buildVisibleRepresentative, buildVisibleSeries, hasPointsInRange } from '../src/decimate.ts';

const bytes = await readFile(new URL('../src/wasm/pkg/pulseview_wasm_core_bg.wasm', import.meta.url));
await init({ module_or_path: bytes });

const points = Array.from({ length: 5000 }, (_, index) => ({
  time: index * 0.01,
  freq: index % 97 === 0 ? 1000 : 100 + Math.sin(index / 20),
  period: 0.01,
  dutyCycle: 0.5,
}));
const times = Float64Array.from(points, (point) => point.time);
const frequencies = Float64Array.from(points, (point) => point.freq);
const periods = Float64Array.from(points, (point) => point.period);
const duties = Float64Array.from(points, (point) => point.dutyCycle);
const range = { min: 5, max: 35 };

const decodeFrequency = (flat) => {
  const result = [];
  for (let index = 0; index < flat.length; index += 4) {
    result.push({ x: flat[index], y: flat[index + 1], period: flat[index + 2], dutyCycle: flat[index + 3] });
  }
  return result;
};
const decodeSeries = (flat) => {
  const result = [];
  for (let index = 0; index < flat.length; index += 2) result.push({ x: flat[index], y: flat[index + 1] });
  return result;
};

assert.equal(wasm.has_points_in_range(times, range.min, range.max), hasPointsInRange(points, range));
assert.deepEqual(
  decodeFrequency(wasm.build_visible_data(times, frequencies, periods, duties, range.min, range.max, 320)),
  buildVisibleData(points, range, 320),
);
const deriv = points.map((point) => ({ time: point.time, value: point.freq }));
assert.deepEqual(
  decodeSeries(wasm.build_visible_series(times, frequencies, range.min, range.max, 320)),
  buildVisibleSeries(deriv, range, 320),
);
for (const [mode, id] of [['center', 0], ['first', 1], ['last', 2], ['turns', 3]]) {
  assert.deepEqual(
    decodeFrequency(wasm.build_visible_representative(times, frequencies, periods, duties, range.min, range.max, 320, id)),
    buildVisibleRepresentative(points, range, 320, mode),
  );
}
const flatEnvelope = wasm.build_visible_envelope(times, frequencies, periods, duties, range.min, range.max, 320);
const lower = [];
const upper = [];
for (let index = 0; index < flatEnvelope.length; index += 8) {
  lower.push(decodeFrequency(flatEnvelope.slice(index, index + 4))[0]);
  upper.push(decodeFrequency(flatEnvelope.slice(index + 4, index + 8))[0]);
}
assert.deepEqual({ lower, upper }, buildVisibleEnvelope(points, range, 320));
console.log('WASM decimation equivalence tests passed');
