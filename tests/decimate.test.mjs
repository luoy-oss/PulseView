import assert from 'node:assert/strict';
import { buildVisibleData, buildVisibleEnvelope, buildVisibleRepresentative, hasPointsInRange } from '../src/decimate.ts';

const constant = Array.from({ length: 100_000 }, (_, i) => ({
  time: i / 1000,
  freq: 100_000,
}));
const constantVisible = buildVisibleData(constant, null, 1200);
assert.equal(constantVisible.length, 2, 'constant screen runs should have two endpoints');
assert.equal(constantVisible[0].x, constant[0].time);
assert.equal(constantVisible.at(-1).x, constant.at(-1).time);

const outsideRangeVisible = buildVisibleData(constant, { min: 200, max: 300 }, 1200);
assert.equal(outsideRangeVisible.length, 2, 'an invalid viewport falls back to source bounds');
assert.equal(outsideRangeVisible[0].x, constant[0].time);
assert.equal(outsideRangeVisible.at(-1).x, constant.at(-1).time);

const sparse = [{ time: 0, freq: 1 }, { time: 1, freq: 2 }, { time: 3, freq: 3 }];
assert.equal(hasPointsInRange(sparse, { min: 1.5, max: 2 }), false);
assert.equal(hasPointsInRange(sparse, { min: 0.5, max: 1.5 }), true);
assert.equal(hasPointsInRange(sparse, { min: 4, max: 5 }), false);
assert.equal(hasPointsInRange([], { min: 0, max: 1 }), false);

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

for (const mode of ['center', 'first', 'last', 'turns']) {
  const representative = buildVisibleRepresentative(smallVariation, null, 1200, mode);
  assert.ok(representative.length <= 1201, `${mode} keeps one real point per pixel column`);
  for (let i = 1; i < representative.length; i++) {
    assert.ok(representative[i].x >= representative[i - 1].x, `${mode} remains time ordered`);
  }
  for (const point of representative) {
    assert.ok(smallVariation.some((source) => source.time === point.x && source.freq === point.y), `${mode} only selects real source points`);
  }
}

console.log('decimation display tests passed');
