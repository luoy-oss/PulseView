import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, * as wasm from '../src/wasm/pkg/pulseview_wasm_core.js';
import {
  computeFreqFromTransitions,
  computeHistogramBins,
  computeLowGapMarkers,
  computeStats,
  countPulsesFromTransitions,
  deriveEdgesFromTransitions,
  invertTransitionLevels,
} from '../src/compute.ts';
import { computeAcceleration, DEFAULT_ACCEL_OPTIONS } from '../src/acceleration.ts';
import { computeAbAnalysis } from '../src/computeAb.ts';
import { computeDirectionAnalysis, DIRECTION_PRESETS } from '../src/computeDirection.ts';
import {
  buildVisibleData,
  buildVisibleEnvelope,
  buildVisibleRepresentative,
  buildVisibleSeries,
  hasPointsInRange,
} from '../src/decimate.ts';
import { initializeWasm, resetWasmRuntimeForTests } from '../src/wasm/runtime.ts';

// ---- deterministic PRNG (mulberry32) ----
function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- comparison helpers ----
function numbersEqual(a, b, absTol, relTol) {
  if (Object.is(a, b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= absTol + relTol * Math.max(Math.abs(a), Math.abs(b));
}

function assertNumericSequence(name, ts, wasmArr, absTol = 1e-12, relTol = 1e-9) {
  if (ts.length !== wasmArr.length) {
    throw new Error(`${name} length TS=${ts.length} WASM=${wasmArr.length}`);
  }
  for (let i = 0; i < ts.length; i++) {
    if (!numbersEqual(ts[i], wasmArr[i], absTol, relTol)) {
      throw new Error(`${name}[${i}] TS=${ts[i]} WASM=${wasmArr[i]}`);
    }
  }
}

// freq point fields: period/dutyCycle may be undefined in TS and NaN in WASM
function fieldValue(v) { return v === undefined ? Number.NaN : v; }

function assertFrequencyPoints(name, ts, wasmPts) {
  if (ts.length !== wasmPts.length) {
    throw new Error(`${name} length TS=${ts.length} WASM=${wasmPts.length}`);
  }
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const w = wasmPts[i];
    for (const key of ['time', 'freq', 'period', 'dutyCycle']) {
      if (!numbersEqual(fieldValue(t[key]), fieldValue(w[key]), 1e-12, 1e-9)) {
        throw new Error(`${name}[${i}].${key} TS=${t[key]} WASM=${w[key]}`);
      }
    }
  }
}

const failures = [];
const stats = new Map();
function record(moduleName) { stats.set(moduleName, (stats.get(moduleName) ?? 0) + 1); }
function check(moduleName, label, fn) {
  record(moduleName);
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (failures.length < 30) failures.push(`[${moduleName}] ${label}: ${message}`);
  }
}

// ---- input generators ----
function makeTransitionTimes(rng, length, pattern) {
  const times = new Float64Array(length);
  let t = pattern === 'negative' ? -500 : 0;
  if (pattern === 'all-equal') {
    for (let i = 0; i < length; i++) times[i] = 42;
    return times;
  }
  for (let i = 0; i < length; i++) {
    times[i] = t;
    const step = pattern === 'fractional' ? 0.37 : 1;
    const duplicate = pattern === 'duplicates' && i > 0 && rng() < 0.3;
    const gap = pattern === 'non-monotonic' && i === Math.floor(length / 2) ? -3 : step;
    t += duplicate ? 0 : gap + (pattern === 'irregular' ? rng() * 2 : 0);
  }
  return times;
}

function makeLevels(rng, length, pattern, firstLevel) {
  const levels = new Int8Array(length);
  let level = firstLevel;
  for (let i = 0; i < length; i++) {
    if (pattern === 'strict-alternate') {
      levels[i] = level;
      level = level === 0 ? 1 : 0;
    } else if (pattern === 'random') {
      const r = rng();
      levels[i] = r < 0.4 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : -1;
    } else if (pattern === 'runs') {
      if (i === 0 || rng() < 0.25) level = level === 0 ? 1 : 0;
      levels[i] = level;
    }
  }
  return levels;
}

function makeFreqPoints(rng, length, { nonFinite = false, duplicateTimes = false } = {}) {
  const points = [];
  let freq = 100;
  let time = 0;
  for (let i = 0; i < length; i++) {
    time += duplicateTimes && i > 0 && rng() < 0.2 ? 0 : 0.001 + rng() * 0.02;
    freq += (rng() - 0.5) * 20;
    if (nonFinite && rng() < 0.03) freq = rng() < 0.5 ? Number.NaN : (rng() < 0.5 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    points.push({ time, freq });
  }
  return points;
}

function makeChannel(rng, length, { quadrature = false, duplicateTimes = false } = {}) {
  const times = new Float64Array(length);
  const levels = new Int8Array(length);
  let t = 0;
  const states = quadrature ? [[0, 0], [1, 0], [1, 1], [0, 1]] : null;
  for (let i = 0; i < length; i++) {
    times[i] = t;
    if (quadrature) {
      const s = states[i % 4];
      levels[i] = i % 2 === 0 ? s[0] : s[1];
    } else {
      levels[i] = rng() < 0.5 ? 0 : 1;
    }
    t += duplicateTimes && i > 0 && rng() < 0.15 ? 0 : 0.1 + rng();
  }
  return { id: `ch${length}-${Math.floor(rng() * 1e6)}`, name: 'ch', transitions: times, levels };
}

// ---- module: primitives ----
function testPrimitives(seed) {
  const rng = mulberry32(seed);
  for (let round = 0; round < 25; round++) {
    const length = 2 + Math.floor(rng() * 40);
    const levels = makeLevels(rng, length, 'random');
    const times = makeTransitionTimes(rng, length, 'irregular');
    const label = `round=${round} len=${length}`;
    check('primitives', label, () => {
      const ts = deriveEdgesFromTransitions(times, levels);
      const tsR = Array.from(ts.risingEdges);
      const tsF = Array.from(ts.fallingEdges);
      assertNumericSequence('risingEdges', tsR, Array.from(wasm.derive_rising_edges(times, levels)));
      assertNumericSequence('fallingEdges', tsF, Array.from(wasm.derive_falling_edges(times, levels)));
      assert.deepEqual(Array.from(wasm.invert_transition_levels(levels)), Array.from(invertTransitionLevels(levels)));
      assert.equal(wasm.count_pulses_from_transitions(levels), countPulsesFromTransitions(levels));
    });
  }
}

// ---- module: stats ----
function testStats(seed) {
  const rng = mulberry32(seed);
  for (let round = 0; round < 40; round++) {
    const length = Math.floor(rng() * 60);
    const nonFinite = rng() < 0.5;
    const points = makeFreqPoints(rng, length, { nonFinite });
    check('stats', `round=${round} len=${length} nonFinite=${nonFinite}`, () => {
      const ts = computeStats(points);
      const vals = wasm.compute_stats_values(Float64Array.from(points, (p) => p.freq));
      if (ts === null) {
        assert.equal(vals.length, 0);
        return;
      }
      assertNumericSequence('stats', [ts.min, ts.max, ts.avg, ts.std, ts.cv], Array.from(vals), 1e-12, 1e-9);
    });
  }
}

// ---- module: histogram ----
function testHistogram(seed) {
  const rng = mulberry32(seed);
  const binOptions = [
    [10, 80], [2, 4], [10, -5], [-5, 80], [-1, -1], [0, 0], [50, 20],
  ];
  for (let round = 0; round < 50; round++) {
    const length = Math.floor(rng() * 80);
    const values = [];
    for (let i = 0; i < length; i++) {
      const r = rng();
      values.push(r < 0.05 ? Number.NaN : r < 0.1 ? (rng() < 0.5 ? Infinity : -Infinity) : (rng() - 0.5) * 1000);
    }
    const [minBins, maxBins] = binOptions[Math.floor(rng() * binOptions.length)];
    check('histogram', `round=${round} len=${length} bins=${minBins},${maxBins}`, () => {
      // TypeScript 参考实现
      let ts = null;
      let tsThrew = null;
      try {
        ts = computeHistogramBins(values, minBins, maxBins);
      } catch (error) {
        tsThrew = error;
      }
      // 模拟生产适配器 wasmComputeHistogram 的 WASM 路径
      let wasmResult = null;
      let wasmThrew = null;
      try {
        const meta = wasm.compute_histogram_meta(Float64Array.from(values), minBins, maxBins);
        if (meta.length === 0) {
          wasmResult = null;
        } else {
          const [minimum, maximum, rawCount] = meta;
          const binCount = Math.trunc(rawCount);
          const width = (maximum - minimum) / binCount;
          const labels = new Array(binCount);
          for (let index = 0; index < binCount; index++) {
            const f = minimum + (index + 0.5) * width;
            if (f >= 1e9) labels[index] = `${(f / 1e9).toFixed(2)}G`;
            else if (f >= 1e6) labels[index] = `${(f / 1e6).toFixed(2)}M`;
            else if (f >= 1e3) labels[index] = `${(f / 1e3).toFixed(2)}k`;
            else labels[index] = f.toFixed(2);
          }
          const bins = wasm.compute_histogram_counts(Float64Array.from(values), minimum, maximum, binCount);
          wasmResult = { labels, bins: Array.from(bins) };
        }
      } catch (error) {
        wasmThrew = error;
      }
      // 两侧都抛异常（如负数桶数）视为行为一致
      if (tsThrew !== null || wasmThrew !== null) {
        if (tsThrew === null || wasmThrew === null) {
          throw new Error(`throw mismatch TS=${tsThrew?.name ?? 'no-throw'} WASM=${wasmThrew?.name ?? 'no-throw'}`);
        }
        return;
      }
      if (ts === null || wasmResult === null) {
        if (ts !== wasmResult) throw new Error('null mismatch');
        return;
      }
      assert.equal(wasmResult.labels.length, ts.labels.length, 'label count');
      for (let i = 0; i < ts.labels.length; i++) {
        assert.equal(wasmResult.labels[i], ts.labels[i], `label[${i}]`);
      }
      // 按数值下标比较；TS 的 bins[NaN]++ 只会挂字符串属性，不参与数值内容
      assert.equal(wasmResult.bins.length, ts.bins.length, 'bin count');
      for (let i = 0; i < ts.bins.length; i++) {
        assert.equal(wasmResult.bins[i], ts.bins[i], `bins[${i}]`);
      }
    });
  }
}

// ---- module: frequency points ----
function testFrequency(seed) {
  const rng = mulberry32(seed);
  const modeId = { pulse: 0, rising: 1, falling: 2, 'low-gap': 3 };
  const timePatterns = ['regular', 'duplicates', 'all-equal', 'non-monotonic', 'negative', 'fractional', 'irregular'];
  const levelPatterns = ['strict-alternate', 'random', 'runs'];
  const optionSets = [
    { dutyCorrect: false, edgeBase: 'falling', toleranceEnabled: false, tolerancePct: 0, defaultLevel: 0 },
    { dutyCorrect: true, edgeBase: 'rising', toleranceEnabled: false, tolerancePct: 0, defaultLevel: 1 },
    { dutyCorrect: true, edgeBase: 'falling', toleranceEnabled: true, tolerancePct: 1, defaultLevel: 0 },
    { dutyCorrect: false, edgeBase: 'rising', toleranceEnabled: true, tolerancePct: 5, defaultLevel: 1 },
  ];
  for (let round = 0; round < 30; round++) {
    const length = [3, 4, 8, 12, 40, 150][Math.floor(rng() * 6)];
    const timePattern = timePatterns[Math.floor(rng() * timePatterns.length)];
    const levelPattern = levelPatterns[Math.floor(rng() * levelPatterns.length)];
    const firstLevel = rng() < 0.5 ? 0 : 1;
    const times = makeTransitionTimes(rng, length, timePattern);
    const levels = makeLevels(rng, length, levelPattern, firstLevel);
    for (const mode of ['pulse', 'rising', 'falling', 'low-gap']) {
      for (const options of optionSets) {
        const label = `round=${round} len=${length} time=${timePattern} levels=${levelPattern} mode=${mode} first=${firstLevel}`;
        check('frequency', label, () => {
          const ts = computeFreqFromTransitions(
            times, levels, 'vcd', mode,
            options.dutyCorrect, options.edgeBase, options.toleranceEnabled, options.tolerancePct, options.defaultLevel,
          );
          const flat = wasm.compute_frequency_points(
            times, levels, modeId[mode],
            options.dutyCorrect, options.edgeBase === 'rising' ? 1 : 0,
            options.toleranceEnabled, options.tolerancePct, options.defaultLevel,
          );
          const wasmPts = [];
          for (let i = 0; i < flat.length; i += 4) {
            wasmPts.push({ time: flat[i], freq: flat[i + 1], period: flat[i + 2], dutyCycle: flat[i + 3] });
          }
          try {
            assertFrequencyPoints(label, ts, wasmPts);
          } catch (error) {
            throw new Error(
              `${error.message}; opts=${JSON.stringify(options)} times=${Array.from(times)} levels=${Array.from(levels)} ` +
              `TS=${JSON.stringify(ts, (_, v) => typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)} ` +
              `WASM=${JSON.stringify(wasmPts)}`,
            );
          }
        });
      }
    }
  }
}

// ---- module: low-gap markers ----
function testLowGap(seed) {
  const rng = mulberry32(seed);
  const thresholds = [0, 0.0009, 0.001, 1, Number.NaN, Infinity];
  for (let round = 0; round < 30; round++) {
    const length = [3, 8, 30, 80][Math.floor(rng() * 4)];
    const times = makeTransitionTimes(rng, length, 'irregular');
    const levels = makeLevels(rng, length, 'strict-alternate');
    const threshold = thresholds[Math.floor(rng() * thresholds.length)];
    const toleranceEnabled = rng() < 0.5;
    const tolerancePct = rng() * 3;
    check('low-gap', `round=${round} len=${length} th=${threshold} tol=${toleranceEnabled}`, () => {
      const ts = computeLowGapMarkers(times, levels, threshold, toleranceEnabled, tolerancePct);
      const flat = wasm.compute_low_gap_markers(times, levels, threshold, toleranceEnabled, tolerancePct);
      assert.equal(flat.length, ts.length * 4, 'marker count must match');
      for (let i = 0; i < ts.length; i++) {
        const m = ts[i];
        assertNumericSequence('marker', [m.startTime, m.endTime, m.gap, m.dutyCycle],
          Array.from(flat.slice(i * 4, i * 4 + 4)), 1e-12, 1e-9);
      }
    });
  }
}

// ---- module: acceleration ----
function testAcceleration(seed) {
  const rng = mulberry32(seed);
  const algorithms = ['raw', 'sg', 'fft', 'kalman', 'td'];
  const optionVariants = {
    sg: [{ sgWindow: 3 }, { sgWindow: 11 }, { sgWindow: 51 }, { sgWindow: 101 }, { sgWindow: 2 }],
    fft: [{ fftCutoffHz: 0 }, { fftCutoffHz: 0.1 }, { fftCutoffHz: 100 }, { fftCutoffHz: 1e6 }, { fftCutoffHz: -5 }],
    kalman: [{ kalmanProcessNoise: 25, kalmanMeasurementNoise: 1e-6 }, { kalmanProcessNoise: 0, kalmanMeasurementNoise: 0 }, { kalmanProcessNoise: 1e6, kalmanMeasurementNoise: 1e6 }],
    td: [{ tdBandwidth: 0.1 }, { tdBandwidth: 40 }, { tdBandwidth: 1e4 }, { tdBandwidth: 0 }],
    raw: [{}],
  };
  for (let round = 0; round < 12; round++) {
    const length = [0, 1, 2, 3, 10, 60, 250][Math.floor(rng() * 7)];
    const pattern = ['regular', 'duplicates', 'all-equal', 'irregular'][Math.floor(rng() * 4)];
    const points = makeFreqPoints(rng, length, { duplicateTimes: pattern === 'duplicates' });
    if (pattern === 'all-equal') for (const p of points) p.time = 1;
    if (pattern === 'regular') points.forEach((p, i) => { p.time = i * 0.01; });
    for (const algorithm of algorithms) {
      const variants = optionVariants[algorithm];
      for (const variant of variants) {
        const options = { ...DEFAULT_ACCEL_OPTIONS, algorithm, ...variant };
        const label = `round=${round} len=${length} pattern=${pattern} alg=${algorithm} ${JSON.stringify(variant)}`;
        check('acceleration', label, () => {
          const ts = computeAcceleration(points, options);
          const times = Float64Array.from(points, (p) => p.time);
          const freqs = Float64Array.from(points, (p) => p.freq);
          const flat = wasm.compute_acceleration_points(
            times, freqs, { raw: 0, sg: 1, fft: 2, kalman: 3, td: 4 }[algorithm],
            options.sgWindow, options.fftCutoffHz, options.kalmanProcessNoise,
            options.kalmanMeasurementNoise, options.tdBandwidth,
          );
          assert.equal(flat.length, ts.length * 2, 'acceleration length must match');
          for (let i = 0; i < ts.length; i++) {
            assertNumericSequence(label, [ts[i].time, ts[i].value], [flat[i * 2], flat[i * 2 + 1]], 1e-8, 1e-8);
          }
        });
      }
    }
  }
}

// ---- module: AB analysis (public API dual-run; throws on mismatch) ----
function testAbAnalysis(seed) {
  const rng = mulberry32(seed);
  for (let round = 0; round < 40; round++) {
    const lengthA = 2 + Math.floor(rng() * 30);
    const lengthB = 2 + Math.floor(rng() * 30);
    const a = makeChannel(rng, lengthA, { quadrature: round % 2 === 0, duplicateTimes: round % 3 === 0 });
    const b = makeChannel(rng, lengthB, { quadrature: round % 2 === 0, duplicateTimes: round % 3 === 0 });
    check('ab', `round=${round} lenA=${lengthA} lenB=${lengthB}`, () => {
      try {
        computeAbAnalysis(a, b);
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}; ` +
          `A=${Array.from(a.transitions)}/${Array.from(a.levels)} B=${Array.from(b.transitions)}/${Array.from(b.levels)}`,
        );
      }
    });
  }
}

// ---- module: direction analysis (public API dual-run) ----
function testDirection(seed) {
  const rng = mulberry32(seed);
  for (let round = 0; round < 40; round++) {
    const lengthPulse = 3 + Math.floor(rng() * 40);
    const lengthDir = 2 + Math.floor(rng() * 20);
    const pulse = makeChannel(rng, lengthPulse, { duplicateTimes: round % 3 === 0 });
    const direction = makeChannel(rng, lengthDir, { duplicateTimes: round % 4 === 0 });
    const preset = DIRECTION_PRESETS[Math.floor(rng() * DIRECTION_PRESETS.length)];
    const pulseLevel = rng() < 0.5 ? 0 : 1;
    check('direction', `round=${round} pulse=${lengthPulse} dir=${lengthDir}`, () => {
      computeDirectionAnalysis(pulse, direction, preset, pulseLevel);
    });
  }
}

// ---- module: decimation ----
function decodeFrequencyFlat(flat) {
  const result = [];
  for (let i = 0; i < flat.length; i += 4) {
    result.push({ x: flat[i], y: flat[i + 1], period: flat[i + 2], dutyCycle: flat[i + 3] });
  }
  return result;
}
function decodeSeriesFlat(flat) {
  const result = [];
  for (let i = 0; i < flat.length; i += 2) result.push({ x: flat[i], y: flat[i + 1] });
  return result;
}
function compareXY(name, ts, wasmArr, absTol, relTol) {
  if (ts.length !== wasmArr.length) throw new Error(`${name} length TS=${ts.length} WASM=${wasmArr.length}`);
  for (let i = 0; i < ts.length; i++) {
    for (const key of ['x', 'y', 'period', 'dutyCycle']) {
      if (!numbersEqual(fieldValue(ts[i][key]), fieldValue(wasmArr[i][key]), absTol, relTol)) {
        throw new Error(`${name}[${i}].${key} TS=${ts[i][key]} WASM=${wasmArr[i][key]}`);
      }
    }
  }
}

function testDecimation(seed) {
  const rng = mulberry32(seed);
  const sizes = [0, 1, 2, 5, 2000, 12000];
  const representativeModes = [['center', 0], ['first', 1], ['last', 2], ['turns', 3]];
  for (let round = 0; round < 20; round++) {
    const size = sizes[Math.floor(rng() * sizes.length)];
    const points = makeFreqPoints(rng, size, { nonFinite: false });
    points.forEach((p, i) => { p.time = i * 0.01 + (rng() < 0.2 ? 0 : 0); p.period = 0.01; p.dutyCycle = 0.5; });
    // ensure strictly increasing times for decimation binary search
    for (let i = 1; i < points.length; i++) if (points[i].time <= points[i - 1].time) points[i].time = points[i - 1].time + 0.01;
    const times = Float64Array.from(points, (p) => p.time);
    const freqs = Float64Array.from(points, (p) => p.freq);
    const periods = Float64Array.from(points, (p) => p.period);
    const duties = Float64Array.from(points, (p) => p.dutyCycle);
    const maxT = points.length ? points[points.length - 1].time : 0;
    const rangeChoice = Math.floor(rng() * 5);
    const ranges = [
      null,
      { min: maxT * 0.2, max: maxT * 0.8 },
      { min: maxT * 1.5, max: maxT * 2 },
      { min: -10, max: -5 },
      { min: maxT * 0.8, max: maxT * 0.2 },
    ][rangeChoice];
    const width = [0, 1, 320, 3000, 10000][Math.floor(rng() * 5)];
    const rangeMin = ranges === null ? Number.NaN : ranges.min;
    const rangeMax = ranges === null ? Number.NaN : ranges.max;
    const label = `round=${round} size=${size} range=${rangeChoice} width=${width}`;
    check('decimation-data', label, () => {
      const ts = buildVisibleData(points, ranges, width);
      const flat = wasm.build_visible_data(times, freqs, periods, duties, rangeMin, rangeMax, width);
      compareXY(label, ts, decodeFrequencyFlat(flat), 1e-12, 1e-9);
    });
    check('decimation-series', label, () => {
      const deriv = points.map((p) => ({ time: p.time, value: p.freq }));
      const ts = buildVisibleSeries(deriv, ranges, width);
      const flat = wasm.build_visible_series(times, freqs, rangeMin, rangeMax, width);
      compareXY(label, ts, decodeSeriesFlat(flat), 1e-12, 1e-9);
    });
    check('decimation-hasPoints', label, () => {
      const ts = hasPointsInRange(points, ranges ?? { min: Number.NaN, max: Number.NaN });
      const wasmResult = wasm.has_points_in_range(times, rangeMin, rangeMax);
      assert.equal(wasmResult, ts);
    });
    for (const [mode, id] of representativeModes) {
      check('decimation-rep', `${label} mode=${mode}`, () => {
        const ts = buildVisibleRepresentative(points, ranges, width, mode);
        const flat = wasm.build_visible_representative(times, freqs, periods, duties, rangeMin, rangeMax, width, id);
        compareXY(`${label} mode=${mode}`, ts, decodeFrequencyFlat(flat), 1e-12, 1e-9);
      });
    }
    check('decimation-envelope', label, () => {
      const ts = buildVisibleEnvelope(points, ranges, width);
      const flat = wasm.build_visible_envelope(times, freqs, periods, duties, rangeMin, rangeMax, width);
      assert.equal(flat.length, (ts.lower.length + ts.upper.length) * 4, 'envelope record count');
      const decoded = [];
      for (let i = 0; i < flat.length; i += 8) {
        decoded.push({ lower: decodeFrequencyFlat(flat.slice(i, i + 4))[0], upper: decodeFrequencyFlat(flat.slice(i + 4, i + 8))[0] });
      }
      assert.equal(decoded.length, ts.lower.length, 'envelope bucket count');
      for (let i = 0; i < decoded.length; i++) {
        compareXY(`${label} lower`, [ts.lower[i]], [decoded[i].lower], 1e-12, 1e-9);
        compareXY(`${label} upper`, [ts.upper[i]], [decoded[i].upper], 1e-12, 1e-9);
      }
    });
  }
}

// ---- large fixed-size sanity ----
function testLargeScale() {
  const size = 100_000;
  const times = new Float64Array(size);
  const levels = new Int8Array(size);
  for (let i = 0; i < size; i++) { times[i] = i * 1e-5; levels[i] = i & 1; }
  check('frequency-large', `${size}`, () => {
    const ts = computeFreqFromTransitions(times, levels, 'vcd', 'falling');
    const flat = wasm.compute_frequency_points(times, levels, 2, false, 0, false, 0, 0);
    assert.equal(flat.length, ts.length * 4);
  });
  const points = Array.from({ length: 50_000 }, (_, i) => ({ time: i * 0.001, freq: 1000 + Math.sin(i / 50) * 100 }));
  check('acceleration-large', `${points.length}`, () => {
    const options = { ...DEFAULT_ACCEL_OPTIONS, algorithm: 'sg', sgWindow: 11 };
    const ts = computeAcceleration(points, options);
    const flat = wasm.compute_acceleration_points(
      Float64Array.from(points, (p) => p.time), Float64Array.from(points, (p) => p.freq), 1, 11, 100, 25, 1e-6, 40,
    );
    assert.equal(flat.length, ts.length * 2);
  });
}

// ---- main ----
const bytes = await readFile(new URL('../src/wasm/pkg/pulseview_wasm_core_bg.wasm', import.meta.url));
await init({ module_or_path: bytes });
resetWasmRuntimeForTests();
await initializeWasm(async () => wasm);

for (let seed = 1; seed <= 12; seed++) {
  testPrimitives(seed);
  testStats(seed);
  testHistogram(seed);
  testFrequency(seed);
  testLowGap(seed);
  testAcceleration(seed);
  testAbAnalysis(seed);
  testDirection(seed);
  testDecimation(seed);
}
testLargeScale();

if (failures.length > 0) {
  console.error(`\nTS/WASM differential equivalence FAILED with ${failures.length} mismatch(es). First 30:`);
  for (const failure of failures) console.error('  ' + failure);
  process.exit(1);
}

const summary = [...stats.entries()].map(([moduleName, count]) => `${moduleName}: ${count}`).join(', ');
console.log(`WASM differential equivalence passed (${summary}, large-scale included)`);
