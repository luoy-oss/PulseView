let wasm;

let cachedFloat64ArrayMemory0 = null;

function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let WASM_VECTOR_LEN = 0;

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}
/**
 * Returns flattened `[time, value]` source points for derivative series.
 * @param {Float64Array} times
 * @param {Float64Array} values
 * @param {number} range_min
 * @param {number} range_max
 * @param {number} width_px
 * @returns {Float64Array}
 */
export function build_visible_series(times, values, range_min, range_max, width_px) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(values, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        wasm.build_visible_series(retptr, ptr0, len0, ptr1, len1, range_min, range_max, width_px);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Index of the last timestamp less than or equal to `target`, or -1.
 * @param {Float64Array} times
 * @param {number} target
 * @returns {number}
 */
export function upper_bound_time(times, target) {
    const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.upper_bound_time(ptr0, len0, target);
    return ret;
}

/**
 * Returns one record per bucket, flattened as
 * `[lower_time, lower_frequency, lower_period, lower_duty,
 *   upper_time, upper_frequency, upper_period, upper_duty]`.
 * @param {Float64Array} times
 * @param {Float64Array} frequencies
 * @param {Float64Array} periods
 * @param {Float64Array} duty_cycles
 * @param {number} range_min
 * @param {number} range_max
 * @param {number} width_px
 * @returns {Float64Array}
 */
export function build_visible_envelope(times, frequencies, periods, duty_cycles, range_min, range_max, width_px) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(frequencies, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(periods, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF64ToWasm0(duty_cycles, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        wasm.build_visible_envelope(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, range_min, range_max, width_px);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v5 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v5;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Returns flattened `[time, frequency, period, duty_cycle]` source points.
 * Pass NaN for either range endpoint to select the complete input.
 * @param {Float64Array} times
 * @param {Float64Array} frequencies
 * @param {Float64Array} periods
 * @param {Float64Array} duty_cycles
 * @param {number} range_min
 * @param {number} range_max
 * @param {number} width_px
 * @returns {Float64Array}
 */
export function build_visible_data(times, frequencies, periods, duty_cycles, range_min, range_max, width_px) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(frequencies, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(periods, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF64ToWasm0(duty_cycles, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        wasm.build_visible_data(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, range_min, range_max, width_px);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v5 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v5;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Index of the first timestamp greater than or equal to `target`.
 * @param {Float64Array} times
 * @param {number} target
 * @returns {number}
 */
export function lower_bound_time(times, target) {
    const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.lower_bound_time(ptr0, len0, target);
    return ret >>> 0;
}

/**
 * @param {Float64Array} times
 * @param {number} range_min
 * @param {number} range_max
 * @returns {boolean}
 */
export function has_points_in_range(times, range_min, range_max) {
    const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.has_points_in_range(ptr0, len0, range_min, range_max);
    return ret !== 0;
}

/**
 * Selects one real source point per bucket and returns flattened frequency points.
 * `mode`: 0=center, 1=first, 2=last, 3=turns.
 * @param {Float64Array} times
 * @param {Float64Array} frequencies
 * @param {Float64Array} periods
 * @param {Float64Array} duty_cycles
 * @param {number} range_min
 * @param {number} range_max
 * @param {number} width_px
 * @param {number} mode
 * @returns {Float64Array}
 */
export function build_visible_representative(times, frequencies, periods, duty_cycles, range_min, range_max, width_px, mode) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(frequencies, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(periods, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF64ToWasm0(duty_cycles, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        wasm.build_visible_representative(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, range_min, range_max, width_px, mode);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v5 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v5;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Computes acceleration points and returns flattened `[time, value]` pairs.
 *
 * `algorithm` selects 0=raw, 1=Savitzky-Golay, 2=FFT low-pass,
 * 3=Kalman, or 4=tracking differentiator. Unknown values use raw mode.
 * @param {Float64Array} times
 * @param {Float64Array} frequencies
 * @param {number} algorithm
 * @param {number} sg_window
 * @param {number} fft_cutoff_hz
 * @param {number} kalman_process_noise
 * @param {number} kalman_measurement_noise
 * @param {number} td_bandwidth
 * @returns {Float64Array}
 */
export function compute_acceleration_points(times, frequencies, algorithm, sg_window, fft_cutoff_hz, kalman_process_noise, kalman_measurement_noise, td_bandwidth) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(frequencies, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        wasm.compute_acceleration_points(retptr, ptr0, len0, ptr1, len1, algorithm, sg_window, fft_cutoff_hz, kalman_process_noise, kalman_measurement_noise, td_bandwidth);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {number} left
 * @param {number} right
 * @returns {number}
 */
export function wasm_smoke_add(left, right) {
    const ret = wasm.wasm_smoke_add(left, right);
    return ret;
}

/**
 * Returns [min, max, average, sample standard deviation, coefficient of variation].
 * Empty input returns an empty vector to preserve the TypeScript null result.
 * @param {Float64Array} frequencies
 * @returns {Float64Array}
 */
export function compute_stats_values(frequencies) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(frequencies, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        wasm.compute_stats_values(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

let cachedUint32ArrayMemory0 = null;

function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}
/**
 * @param {Float64Array} frequencies
 * @param {number} minimum
 * @param {number} maximum
 * @param {number} bin_count
 * @returns {Uint32Array}
 */
export function compute_histogram_counts(frequencies, minimum, maximum, bin_count) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(frequencies, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        wasm.compute_histogram_counts(retptr, ptr0, len0, minimum, maximum, bin_count);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayU32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 4, 4);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * @param {Int8Array} trans_levels
 * @returns {number}
 */
export function count_pulses_from_transitions(trans_levels) {
    const ptr0 = passArray8ToWasm0(trans_levels, wasm.__wbindgen_export_0);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.count_pulses_from_transitions(ptr0, len0);
    return ret >>> 0;
}

/**
 * @param {Float64Array} trans_times
 * @param {Int8Array} trans_levels
 * @returns {Float64Array}
 */
export function derive_rising_edges(trans_times, trans_levels) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(trans_times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(trans_levels, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        wasm.derive_rising_edges(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Returns [minimum, maximum, bin_count] or an empty vector for empty/constant input.
 * @param {Float64Array} frequencies
 * @param {number} min_bins
 * @param {number} max_bins
 * @returns {Float64Array}
 */
export function compute_histogram_meta(frequencies, min_bins, max_bins) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(frequencies, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        wasm.compute_histogram_meta(retptr, ptr0, len0, min_bins, max_bins);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {Float64Array} trans_times
 * @param {Int8Array} trans_levels
 * @returns {Float64Array}
 */
export function derive_falling_edges(trans_times, trans_levels) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(trans_times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(trans_levels, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        wasm.derive_falling_edges(retptr, ptr0, len0, ptr1, len1);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Returns flattened [time, frequency, period, duty_cycle] points.
 * mode: 0=pulse, 1=rising, 2=falling, 3=low-gap; edge_base: 0=falling, 1=rising.
 * @param {Float64Array} trans_times
 * @param {Int8Array} trans_levels
 * @param {number} mode
 * @param {boolean} duty_correct
 * @param {number} edge_base
 * @param {boolean} low_gap_tolerance_enabled
 * @param {number} low_gap_tolerance_pct
 * @param {number} default_level
 * @returns {Float64Array}
 */
export function compute_frequency_points(trans_times, trans_levels, mode, duty_correct, edge_base, low_gap_tolerance_enabled, low_gap_tolerance_pct, default_level) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(trans_times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(trans_levels, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        wasm.compute_frequency_points(retptr, ptr0, len0, ptr1, len1, mode, duty_correct, edge_base, low_gap_tolerance_enabled, low_gap_tolerance_pct, default_level);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

let cachedInt8ArrayMemory0 = null;

function getInt8ArrayMemory0() {
    if (cachedInt8ArrayMemory0 === null || cachedInt8ArrayMemory0.byteLength === 0) {
        cachedInt8ArrayMemory0 = new Int8Array(wasm.memory.buffer);
    }
    return cachedInt8ArrayMemory0;
}

function getArrayI8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
 * @param {Int8Array} trans_levels
 * @returns {Int8Array}
 */
export function invert_transition_levels(trans_levels) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(trans_levels, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        wasm.invert_transition_levels(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayI8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 1, 1);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Returns flattened [start_time, end_time, gap, duty_cycle] markers.
 * @param {Float64Array} trans_times
 * @param {Int8Array} trans_levels
 * @param {number} threshold
 * @param {boolean} tolerance_enabled
 * @param {number} tolerance_pct
 * @returns {Float64Array}
 */
export function compute_low_gap_markers(trans_times, trans_levels, threshold, tolerance_enabled, tolerance_pct) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(trans_times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(trans_levels, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        wasm.compute_low_gap_markers(retptr, ptr0, len0, ptr1, len1, threshold, tolerance_enabled, tolerance_pct);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Computes the complete AB analysis in one call.
 *
 * The flattened result is:
 * `[point_count, a_pulses, b_pulses, a_edges, b_edges, cycles,
 * forward_cycles, reverse_cycles, invalid_transitions, mean_period,
 * mean_phase, phase_std, phase_lead_code, ...points]`, where every point is
 * `[time, signed_frequency, direction_code]`. Direction and phase-lead codes
 * are `1=forward/A leads B`, `-1=reverse/B leads A`, and `0=no clear lead`.
 * @param {Float64Array} a_times
 * @param {Int8Array} a_levels
 * @param {Float64Array} b_times
 * @param {Int8Array} b_levels
 * @returns {Float64Array}
 */
export function compute_ab_analysis_batch(a_times, a_levels, b_times, b_levels) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(a_times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(a_levels, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(b_times, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(b_levels, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        wasm.compute_ab_analysis_batch(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v5 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v5;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Computes the complete pulse/direction analysis in one call.
 *
 * The flattened result is `[point_count, pulse_edges, forward_cycles,
 * reverse_cycles, unknown_cycles, mean_period, mean_delay, ...points]`.
 * Every point is `[time, signed_frequency, direction_code]`, with direction
 * code `1=forward` and `-1=reverse`.
 * @param {Float64Array} pulse_times
 * @param {Int8Array} pulse_levels
 * @param {Float64Array} direction_times
 * @param {Int8Array} direction_levels
 * @param {number} forward_level
 * @param {number} pulse_level
 * @returns {Float64Array}
 */
export function compute_direction_analysis_batch(pulse_times, pulse_levels, direction_times, direction_levels, forward_level, pulse_level) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(pulse_times, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(pulse_levels, wasm.__wbindgen_export_0);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArrayF64ToWasm0(direction_times, wasm.__wbindgen_export_0);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(direction_levels, wasm.__wbindgen_export_0);
        const len3 = WASM_VECTOR_LEN;
        wasm.compute_direction_analysis_batch(retptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, forward_level, pulse_level);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v5 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_1(r0, r1 * 8, 8);
        return v5;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedInt8ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;



    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('pulseview_wasm_core_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
