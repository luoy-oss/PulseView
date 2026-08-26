import type { AccelOptions, DerivPoint, FreqPoint } from '../types.ts';
import { assertNumericArraysEquivalent, dualRun } from './compare.ts';
import { getWasmExports } from './runtime.ts';

const algorithmIds = { raw: 0, sg: 1, fft: 2, kalman: 3, td: 4 } as const;

export function wasmComputeAcceleration(
  points: FreqPoint[],
  options: AccelOptions,
  tsRun: () => DerivPoint[],
): DerivPoint[] {
  const wasm = getWasmExports();
  if (!wasm) return tsRun();
  const times = Float64Array.from(points, (point) => point.time);
  const frequencies = Float64Array.from(points, (point) => point.freq);
  return dualRun(
    'computeAcceleration', points.length, tsRun,
    () => {
      const flat = wasm.compute_acceleration_points(
        times, frequencies, algorithmIds[options.algorithm], options.sgWindow,
        options.fftCutoffHz, options.kalmanProcessNoise,
        options.kalmanMeasurementNoise, options.tdBandwidth,
      );
      const result: DerivPoint[] = [];
      for (let index = 0; index < flat.length; index += 2) {
        result.push({ time: flat[index], value: flat[index + 1] });
      }
      return result;
    },
    (ts, result) => {
      if (ts.length !== result.length) throw new Error(`length TS=${ts.length}, WASM=${result.length}`);
      for (let index = 0; index < ts.length; index++) {
        assertNumericArraysEquivalent('computeAcceleration', points.length,
          [ts[index].time, ts[index].value], [result[index].time, result[index].value],
          { absolute: 1e-8, relative: 1e-8 });
      }
    },
  );
}
