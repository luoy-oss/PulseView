import assert from 'node:assert/strict';
import {
  computeFreqFromTransitions,
  computeLowGapMarkers,
  LOW_GAP_MIN_THRESHOLD,
  deriveEdgesFromTransitions,
  invertTransitionLevels,
  countPulsesFromTransitions,
} from '../src/compute.ts';
import { computeAcceleration, DEFAULT_ACCEL_OPTIONS } from '../src/acceleration.ts';

assert.equal(DEFAULT_ACCEL_OPTIONS.algorithm, 'raw');
assert.equal(DEFAULT_ACCEL_OPTIONS.fftCutoffHz, 100);
assert.equal(DEFAULT_ACCEL_OPTIONS.kalmanMeasurementNoise, 0.000001);

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

const markers = computeLowGapMarkers(
  new Float64Array([0, 1, 2, 3, 4, 6, 7, 8, 9]),
  levels,
  0.001
);
assert.equal(markers.length, 1);
assert.equal(markers[0].startTime, 4);
assert.equal(markers[0].endTime, 6);
assert.equal(markers[0].gap, 1);

const minimumThresholdMarkers = computeLowGapMarkers(
  new Float64Array([0, 1, 2, 3, 4, 5.00085, 6.00085]),
  new Int8Array([0, 1, 0, 1, 0, 1, 0]),
  0
);
assert.equal(LOW_GAP_MIN_THRESHOLD, 0.0009);
assert.equal(minimumThresholdMarkers.length, 0);

const normalTimes = new Float64Array([0, 1, 2, 4, 5, 6]);
const normalLevels = new Int8Array([0, 1, 0, 1, 0, 1]);
const invertedLevels = invertTransitionLevels(normalLevels);
assert.deepEqual([...invertedLevels], [1, 0, 1, 0, 1, 0]);
const invertedEdges = deriveEdgesFromTransitions(normalTimes, invertedLevels);
assert.deepEqual([...invertedEdges.risingEdges], [2, 5]);
assert.deepEqual([...invertedEdges.fallingEdges], [1, 4, 6]);

const normalPoints = computeFreqFromTransitions(normalTimes, normalLevels, 'txt', 'falling');
const invertedPoints = computeFreqFromTransitions(normalTimes, invertedLevels, 'txt', 'falling');
assert.equal(normalPoints[0].dutyCycle, 0.5);
assert.equal(invertedPoints[0].dutyCycle, 1);
assert.equal(normalPoints[0].freq, 0.5);
assert.equal(invertedPoints[0].freq, 0.5);
assert.equal(normalPoints[1].freq, 1 / 3);
assert.equal(invertedPoints[1].freq, 0.5);

const terminalLowPulseTimes = new Float64Array([0, 1, 2, 3, 4]);
const terminalLowPulseLevels = new Int8Array([1, 0, 1, 0, 1]);
const terminalLowLogical = invertTransitionLevels(terminalLowPulseLevels);
const terminalLowPoints = computeFreqFromTransitions(
  terminalLowPulseTimes,
  terminalLowLogical,
  'vcd',
  'falling',
  false,
  'falling',
  false,
  0,
  0
);
assert.equal(terminalLowPoints.at(-1)?.freq, 0.5);
assert.equal(terminalLowPoints.at(-1)?.period, 2);
assert.equal(terminalLowPoints.at(-1)?.dutyCycle, 0.5);

const terminalLowRising = computeFreqFromTransitions(
  terminalLowPulseTimes,
  terminalLowLogical,
  'vcd',
  'rising',
  false,
  'falling',
  false,
  0,
  0
);
assert.equal(terminalLowRising.at(-1)?.freq, 0.5);
assert.equal(terminalLowRising.at(-1)?.dutyCycle, 0.5);

const terminalHighTimes = new Float64Array([0, 1, 2, 3, 4, 5, 6]);
const terminalHighLevels = new Int8Array([0, 1, 0, 1, 0, 1, 0]);
const terminalHighRising = computeFreqFromTransitions(
  terminalHighTimes,
  terminalHighLevels,
  'vcd',
  'rising',
  false,
  'falling',
  false,
  0,
  0
);
assert.equal(terminalHighRising.filter((point) => point.time === 5).length, 1);
assert.equal(terminalHighRising.at(-1)?.freq, 0.5);

const terminalPulseMode = computeFreqFromTransitions(
  terminalHighTimes,
  terminalHighLevels,
  'vcd',
  'pulse',
  true,
  'falling',
  false,
  0,
  0
);
assert.equal(terminalPulseMode.at(-1)?.period, 2);
assert.equal(terminalPulseMode.at(-1)?.dutyCycle, 0.5);

const delayedFirstPulseTimes = new Float64Array([0, 5.4, 10.1, 15.4, 20.1, 25.4]);
const delayedFirstPulseLevels = new Int8Array([1, 0, 1, 0, 1, 0]);
const delayedFirstPulse = computeFreqFromTransitions(
  delayedFirstPulseTimes,
  delayedFirstPulseLevels,
  'txt',
  'falling'
);
assert.ok(Math.abs(delayedFirstPulse[0].freq - 1 / 10) < 1e-12);
assert.ok(Math.abs(delayedFirstPulse[0].period - 10) < 1e-12);
assert.ok(Math.abs(delayedFirstPulse[0].dutyCycle - 5.3 / 10) < 1e-12);

const delayedFirstRising = computeFreqFromTransitions(
  delayedFirstPulseTimes,
  delayedFirstPulseLevels,
  'txt',
  'rising'
);
assert.ok(Math.abs(delayedFirstRising[0].freq - 1 / 10) < 1e-12);

const boundaryLevels = new Int8Array([1, 0, 1, 0]);
assert.equal(countPulsesFromTransitions(boundaryLevels), 2);
assert.equal(countPulsesFromTransitions(new Int8Array([0, 1, 0, 1, 0])), 2);

const physicalLevels = new Int8Array([0, 1, 0, 1, 0]);
assert.equal(countPulsesFromTransitions(physicalLevels), 2);
const invertedPhysicalLevels = invertTransitionLevels(physicalLevels);
assert.equal(countPulsesFromTransitions(invertedPhysicalLevels), 2);

console.log('low-gap compute tests passed');

const slopePoints = Array.from({ length: 61 }, (_, i) => ({ time: i * 0.02, freq: 100 + 12 * i * 0.02 }));
for (const algorithm of ['raw', 'sg', 'fft', 'kalman', 'td']) {
  const acceleration = computeAcceleration(slopePoints, { ...DEFAULT_ACCEL_OPTIONS, algorithm });
  assert.equal(acceleration.length, slopePoints.length, `${algorithm} output length must match input`);
  assert.ok(acceleration.every((point) => Number.isFinite(point.value)), `${algorithm} must produce finite values`);
}
const sgSlope = computeAcceleration(slopePoints, { ...DEFAULT_ACCEL_OPTIONS, algorithm: 'sg' });
assert.ok(Math.abs(sgSlope[30].value - 12) < 1e-8, 'SG central difference must retain a linear slope');
const constantPoints = Array.from({ length: 30 }, (_, i) => ({ time: i * 0.1, freq: 500 }));
for (const algorithm of ['raw', 'sg', 'fft', 'kalman', 'td']) {
  const acceleration = computeAcceleration(constantPoints, { ...DEFAULT_ACCEL_OPTIONS, algorithm });
  assert.ok(acceleration.every((point) => Math.abs(point.value) < 1e-7), `${algorithm} must keep constant speed at zero acceleration`);
}
console.log('acceleration algorithm tests passed');
