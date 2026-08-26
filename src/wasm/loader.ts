export interface PulseViewWasmExports {
  wasm_smoke_add(left: number, right: number): number;
  derive_rising_edges(transTimes: Float64Array, transLevels: Int8Array): Float64Array;
  derive_falling_edges(transTimes: Float64Array, transLevels: Int8Array): Float64Array;
  invert_transition_levels(transLevels: Int8Array): Int8Array;
  count_pulses_from_transitions(transLevels: Int8Array): number;
  compute_stats_values(frequencies: Float64Array): Float64Array;
  compute_histogram_meta(frequencies: Float64Array, minBins: number, maxBins: number): Float64Array;
  compute_histogram_counts(frequencies: Float64Array, minimum: number, maximum: number, binCount: number): Uint32Array;
  compute_frequency_points(transTimes: Float64Array, transLevels: Int8Array, mode: number, dutyCorrect: boolean, edgeBase: number, toleranceEnabled: boolean, tolerancePct: number, defaultLevel: number): Float64Array;
  compute_low_gap_markers(transTimes: Float64Array, transLevels: Int8Array, threshold: number, toleranceEnabled: boolean, tolerancePct: number): Float64Array;
  compute_acceleration_points(times: Float64Array, frequencies: Float64Array, algorithm: number, sgWindow: number, fftCutoffHz: number, kalmanProcessNoise: number, kalmanMeasurementNoise: number, tdBandwidth: number): Float64Array;
  compute_ab_analysis_batch(aTimes: Float64Array, aLevels: Int8Array, bTimes: Float64Array, bLevels: Int8Array): Float64Array;
  compute_direction_analysis_batch(pulseTimes: Float64Array, pulseLevels: Int8Array, directionTimes: Float64Array, directionLevels: Int8Array, forwardLevel: number, pulseLevel: number): Float64Array;
  build_visible_data(times: Float64Array, frequencies: Float64Array, periods: Float64Array, dutyCycles: Float64Array, rangeMin: number, rangeMax: number, widthPx: number): Float64Array;
  build_visible_series(times: Float64Array, values: Float64Array, rangeMin: number, rangeMax: number, widthPx: number): Float64Array;
  build_visible_envelope(times: Float64Array, frequencies: Float64Array, periods: Float64Array, dutyCycles: Float64Array, rangeMin: number, rangeMax: number, widthPx: number): Float64Array;
  build_visible_representative(times: Float64Array, frequencies: Float64Array, periods: Float64Array, dutyCycles: Float64Array, rangeMin: number, rangeMax: number, widthPx: number, mode: number): Float64Array;
  has_points_in_range(times: Float64Array, rangeMin: number, rangeMax: number): boolean;
}

export async function loadGeneratedWasm(): Promise<PulseViewWasmExports> {
  const module = await import('./pkg/pulseview_wasm_core.js');
  await module.default({
    module_or_path: new URL('./pkg/pulseview_wasm_core_bg.wasm', import.meta.url),
  });
  return module;
}
