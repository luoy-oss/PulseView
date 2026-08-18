import assert from 'node:assert/strict';
import { computeFreqFromTransitions } from '../src/compute.ts';

const levels = new Int8Array([0, 1, 0, 1, 0, 1, 0, 1, 0]);

const continuous = computeFreqFromTransitions(
  new Float64Array([0, 1, 2, 3, 4, 5, 6, 7, 8]),
  levels,
  'vcd',
  'low-gap'
);
assert.deepEqual(continuous.map((point) => point.freq), [0, 0, 0]);

const delayed = computeFreqFromTransitions(
  new Float64Array([0, 1, 2, 3, 4, 6, 7, 8, 9]),
  levels,
  'vcd',
  'low-gap'
);
assert.deepEqual(delayed.map((point) => point.freq), [0, 1, 0]);

const slightDutyErrorTimes = new Float64Array([0, 1, 2, 3, 4.0001, 5.0001, 6.0001]);
const slightDutyErrorLevels = new Int8Array([0, 1, 0, 1, 0, 1, 0]);
const raw = computeFreqFromTransitions(
  slightDutyErrorTimes,
  slightDutyErrorLevels,
  'vcd',
  'low-gap'
);
assert.equal(raw.length, 2);
assert.ok(raw[0].freq < 0, '非 50% 占空比的原始负推导值必须保留');

const tolerated = computeFreqFromTransitions(
  slightDutyErrorTimes,
  slightDutyErrorLevels,
  'vcd',
  'low-gap',
  false,
  'falling',
  true,
  0.01
);
assert.deepEqual(tolerated.map((point) => point.freq), [0, 0]);

console.log('low-gap compute tests passed');
