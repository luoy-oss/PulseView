import assert from 'node:assert/strict';
import { buildVisibleData, buildVisibleEnvelope } from '../src/decimate.ts';

const constant = Array.from({ length: 100_000 }, (_, i) => ({
  time: i / 1000,
  freq: 100_000,
}));
const constantVisible = buildVisibleData(constant, null, 1200);
assert.equal(constantVisible.length, 2, 'constant screen runs should have two endpoints');
assert.equal(constantVisible[0].x, constant[0].time);
assert.equal(constantVisible.at(-1).x, constant.at(-1).time);

const changing = Array.from({ length: 100_000 }, (_, i) => ({
  time: i / 1000,
  freq: i % 2 === 0 ? 100_000 : 200_000,
}));
const changingVisible = buildVisibleData(changing, null, 1200);
assert.ok(changingVisible.length <= 2402, 'display data stays bounded by pixel columns');
assert.ok(changingVisible.some((point) => point.y === 100_000));
assert.ok(changingVisible.some((point) => point.y === 200_000));

const smallVariation = Array.from({ length: 100_000 }, (_, i) => ({
  time: i / 1000,
  freq: 100_000 + (i % 3) - 1,
}));
const envelope = buildVisibleEnvelope(smallVariation, null, 1200);
assert.equal(envelope.lower.length, envelope.upper.length);
assert.ok(envelope.lower.length <= 1200, 'envelope keeps one true minimum per pixel column');
for (let i = 1; i < envelope.lower.length; i++) {
  assert.ok(envelope.lower[i].x >= envelope.lower[i - 1].x, 'lower envelope remains time ordered');
  assert.ok(envelope.upper[i].x >= envelope.upper[i - 1].x, 'upper envelope remains time ordered');
  assert.ok(envelope.lower[i].y <= envelope.upper[i].y, 'each column preserves true min/max bounds');
}

console.log('decimation display tests passed');
