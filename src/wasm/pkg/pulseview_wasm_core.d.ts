/* tslint:disable */
/* eslint-disable */
/**
 * Returns flattened `[time, value]` source points for derivative series.
 */
export function build_visible_series(times: Float64Array, values: Float64Array, range_min: number, range_max: number, width_px: number): Float64Array;
/**
 * Index of the last timestamp less than or equal to `target`, or -1.
 */
export function upper_bound_time(times: Float64Array, target: number): number;
/**
 * Returns one record per bucket, flattened as
 * `[lower_time, lower_frequency, lower_period, lower_duty,
 *   upper_time, upper_frequency, upper_period, upper_duty]`.
 */
export function build_visible_envelope(times: Float64Array, frequencies: Float64Array, periods: Float64Array, duty_cycles: Float64Array, range_min: number, range_max: number, width_px: number): Float64Array;
/**
 * Returns flattened `[time, frequency, period, duty_cycle]` source points.
 * Pass NaN for either range endpoint to select the complete input.
 */
export function build_visible_data(times: Float64Array, frequencies: Float64Array, periods: Float64Array, duty_cycles: Float64Array, range_min: number, range_max: number, width_px: number): Float64Array;
/**
 * Index of the first timestamp greater than or equal to `target`.
 */
export function lower_bound_time(times: Float64Array, target: number): number;
export function has_points_in_range(times: Float64Array, range_min: number, range_max: number): boolean;
/**
 * Selects one real source point per bucket and returns flattened frequency points.
 * `mode`: 0=center, 1=first, 2=last, 3=turns.
 */
export function build_visible_representative(times: Float64Array, frequencies: Float64Array, periods: Float64Array, duty_cycles: Float64Array, range_min: number, range_max: number, width_px: number, mode: number): Float64Array;
/**
 * Computes acceleration points and returns flattened `[time, value]` pairs.
 *
 * `algorithm` selects 0=raw, 1=Savitzky-Golay, 2=FFT low-pass,
 * 3=Kalman, or 4=tracking differentiator. Unknown values use raw mode.
 */
export function compute_acceleration_points(times: Float64Array, frequencies: Float64Array, algorithm: number, sg_window: number, fft_cutoff_hz: number, kalman_process_noise: number, kalman_measurement_noise: number, td_bandwidth: number): Float64Array;
export function wasm_smoke_add(left: number, right: number): number;
/**
 * Returns [min, max, average, sample standard deviation, coefficient of variation].
 * Empty input returns an empty vector to preserve the TypeScript null result.
 */
export function compute_stats_values(frequencies: Float64Array): Float64Array;
export function compute_histogram_counts(frequencies: Float64Array, minimum: number, maximum: number, bin_count: number): Uint32Array;
export function count_pulses_from_transitions(trans_levels: Int8Array): number;
export function derive_rising_edges(trans_times: Float64Array, trans_levels: Int8Array): Float64Array;
/**
 * Returns [minimum, maximum, bin_count] or an empty vector for empty/constant input.
 */
export function compute_histogram_meta(frequencies: Float64Array, min_bins: number, max_bins: number): Float64Array;
export function derive_falling_edges(trans_times: Float64Array, trans_levels: Int8Array): Float64Array;
/**
 * Returns flattened [time, frequency, period, duty_cycle] points.
 * mode: 0=pulse, 1=rising, 2=falling, 3=low-gap; edge_base: 0=falling, 1=rising.
 */
export function compute_frequency_points(trans_times: Float64Array, trans_levels: Int8Array, mode: number, duty_correct: boolean, edge_base: number, low_gap_tolerance_enabled: boolean, low_gap_tolerance_pct: number, default_level: number): Float64Array;
export function invert_transition_levels(trans_levels: Int8Array): Int8Array;
/**
 * Returns flattened [start_time, end_time, gap, duty_cycle] markers.
 */
export function compute_low_gap_markers(trans_times: Float64Array, trans_levels: Int8Array, threshold: number, tolerance_enabled: boolean, tolerance_pct: number): Float64Array;
/**
 * Computes the complete AB analysis in one call.
 *
 * The flattened result is:
 * `[point_count, a_pulses, b_pulses, a_edges, b_edges, cycles,
 * forward_cycles, reverse_cycles, invalid_transitions, mean_period,
 * mean_phase, phase_std, phase_lead_code, ...points]`, where every point is
 * `[time, signed_frequency, direction_code]`. Direction and phase-lead codes
 * are `1=forward/A leads B`, `-1=reverse/B leads A`, and `0=no clear lead`.
 */
export function compute_ab_analysis_batch(a_times: Float64Array, a_levels: Int8Array, b_times: Float64Array, b_levels: Int8Array): Float64Array;
/**
 * Computes the complete pulse/direction analysis in one call.
 *
 * The flattened result is `[point_count, pulse_edges, forward_cycles,
 * reverse_cycles, unknown_cycles, mean_period, mean_delay, ...points]`.
 * Every point is `[time, signed_frequency, direction_code]`, with direction
 * code `1=forward` and `-1=reverse`.
 */
export function compute_direction_analysis_batch(pulse_times: Float64Array, pulse_levels: Int8Array, direction_times: Float64Array, direction_levels: Int8Array, forward_level: number, pulse_level: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly build_visible_data: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
  readonly build_visible_envelope: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => void;
  readonly build_visible_representative: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
  readonly build_visible_series: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly compute_ab_analysis_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly compute_acceleration_points: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
  readonly compute_direction_analysis_batch: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
  readonly compute_frequency_points: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => void;
  readonly compute_histogram_counts: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly compute_histogram_meta: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly compute_low_gap_markers: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly compute_stats_values: (a: number, b: number, c: number) => void;
  readonly count_pulses_from_transitions: (a: number, b: number) => number;
  readonly derive_falling_edges: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly derive_rising_edges: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly has_points_in_range: (a: number, b: number, c: number, d: number) => number;
  readonly invert_transition_levels: (a: number, b: number, c: number) => void;
  readonly lower_bound_time: (a: number, b: number, c: number) => number;
  readonly upper_bound_time: (a: number, b: number, c: number) => number;
  readonly wasm_smoke_add: (a: number, b: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export_0: (a: number, b: number) => number;
  readonly __wbindgen_export_1: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
