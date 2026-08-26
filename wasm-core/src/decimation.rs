use wasm_bindgen::prelude::*;

const FREQUENCY_STRIDE: usize = 4;

/// Index of the first timestamp greater than or equal to `target`.
#[wasm_bindgen]
pub fn lower_bound_time(times: &[f64], target: f64) -> u32 {
    lower_bound(times, target) as u32
}

/// Index of the last timestamp less than or equal to `target`, or -1.
#[wasm_bindgen]
pub fn upper_bound_time(times: &[f64], target: f64) -> i32 {
    upper_bound(times, target).map_or(-1, |index| index as i32)
}

#[wasm_bindgen]
pub fn has_points_in_range(times: &[f64], range_min: f64, range_max: f64) -> bool {
    if times.is_empty() {
        return false;
    }
    let minimum = range_min.min(range_max);
    let maximum = range_min.max(range_max);
    let first = lower_bound(times, minimum);
    first < times.len() && times[first] <= maximum
}

fn lower_bound(times: &[f64], target: f64) -> usize {
    let (mut low, mut high) = (0, times.len());
    while low < high {
        let middle = (low + high) / 2;
        if times[middle] < target {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    low
}

fn upper_bound(times: &[f64], target: f64) -> Option<usize> {
    let (mut low, mut high) = (0, times.len());
    while low < high {
        let middle = (low + high) / 2;
        if times[middle] <= target {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    low.checked_sub(1)
}

fn source_length(times: &[f64], values: &[f64]) -> usize {
    times.len().min(values.len())
}

fn visible_bounds(times: &[f64], range_min: f64, range_max: f64) -> (usize, usize) {
    let last = times.len() - 1;
    // NaN is the batch API's sentinel for a null TypeScript view range.
    if range_min.is_nan() || range_max.is_nan() {
        return (0, last);
    }
    let low = lower_bound(times, range_min);
    let high = upper_bound(times, range_max);
    match high {
        Some(high) if low <= high && low < times.len() => (low, high),
        // Match decimate.ts: stale/non-overlapping viewports fall back to all data.
        _ => (0, last),
    }
}

fn pixel_width(width_px: f64) -> usize {
    if width_px.is_finite() {
        width_px.round().max(1.0) as usize
    } else {
        1
    }
}

fn frequency_point(
    output: &mut Vec<f64>,
    index: usize,
    times: &[f64],
    frequencies: &[f64],
    periods: &[f64],
    duty_cycles: &[f64],
) {
    output.extend_from_slice(&[
        times[index],
        frequencies[index],
        periods.get(index).copied().unwrap_or(f64::NAN),
        duty_cycles.get(index).copied().unwrap_or(f64::NAN),
    ]);
}

fn collapse_horizontal_runs(points: Vec<f64>, stride: usize) -> Vec<f64> {
    let count = points.len() / stride;
    if count < 3 {
        return points;
    }
    let mut selected = Vec::with_capacity(count);
    selected.push(0);
    let mut run_value = points[1];
    let mut run_end = 0;
    for index in 1..count {
        let value = points[index * stride + 1];
        if value == run_value {
            run_end = index;
            continue;
        }
        if selected.last().copied() != Some(run_end) {
            selected.push(run_end);
        }
        selected.push(index);
        run_value = value;
        run_end = index;
    }
    if selected.last().copied() != Some(run_end) {
        selected.push(run_end);
    }
    let mut output = Vec::with_capacity(selected.len() * stride);
    for index in selected {
        output.extend_from_slice(&points[index * stride..(index + 1) * stride]);
    }
    output
}

fn extrema(values: &[f64], start: usize, end: usize) -> (usize, usize) {
    let (mut minimum, mut maximum) = (start, start);
    for index in start + 1..=end {
        if values[index] < values[minimum] {
            minimum = index;
        }
        if values[index] > values[maximum] {
            maximum = index;
        }
    }
    (minimum, maximum)
}

fn decimated_indices(
    times: &[f64],
    values: &[f64],
    low: usize,
    high: usize,
    width: usize,
) -> Vec<usize> {
    let start_time = times[low];
    let span = times[high] - start_time;
    if span <= 0.0 {
        return vec![low, high];
    }
    let mut output = Vec::with_capacity(width * 2 + 2);
    output.push(low);
    for bucket in 0..width {
        let bucket_start = start_time + span * bucket as f64 / width as f64;
        let bucket_end = if bucket + 1 == width {
            times[high]
        } else {
            start_time + span * (bucket + 1) as f64 / width as f64
        };
        let bucket_low = low.max(lower_bound(times, bucket_start));
        let Some(bucket_high) = upper_bound(times, bucket_end).map(|index| high.min(index)) else {
            continue;
        };
        if bucket_low > bucket_high {
            continue;
        }
        let (minimum, maximum) = extrema(values, bucket_low, bucket_high);
        if times[minimum] <= times[maximum] {
            output.extend_from_slice(&[minimum, maximum]);
        } else {
            output.extend_from_slice(&[maximum, minimum]);
        }
    }
    output.push(high);
    output
}

/// Returns flattened `[time, frequency, period, duty_cycle]` source points.
/// Pass NaN for either range endpoint to select the complete input.
#[wasm_bindgen]
pub fn build_visible_data(
    times: &[f64],
    frequencies: &[f64],
    periods: &[f64],
    duty_cycles: &[f64],
    range_min: f64,
    range_max: f64,
    width_px: f64,
) -> Vec<f64> {
    let length = source_length(times, frequencies);
    if length == 0 {
        return Vec::new();
    }
    let (times, frequencies) = (&times[..length], &frequencies[..length]);
    let (low, high) = visible_bounds(times, range_min, range_max);
    let width = pixel_width(width_px);
    let count = high - low + 1;
    let indices = if count <= (width * 2).max(2000) {
        (low..=high).collect()
    } else {
        decimated_indices(times, frequencies, low, high, width)
    };
    let mut points = Vec::with_capacity(indices.len() * FREQUENCY_STRIDE);
    for index in indices {
        frequency_point(&mut points, index, times, frequencies, periods, duty_cycles);
    }
    collapse_horizontal_runs(points, FREQUENCY_STRIDE)
}

/// Returns flattened `[time, value]` source points for derivative series.
#[wasm_bindgen]
pub fn build_visible_series(
    times: &[f64],
    values: &[f64],
    range_min: f64,
    range_max: f64,
    width_px: f64,
) -> Vec<f64> {
    let length = source_length(times, values);
    if length == 0 {
        return Vec::new();
    }
    let (times, values) = (&times[..length], &values[..length]);
    let (low, high) = visible_bounds(times, range_min, range_max);
    let width = pixel_width(width_px);
    let count = high - low + 1;
    let indices = if count <= (width * 2).max(2000) {
        (low..=high).collect()
    } else {
        decimated_indices(times, values, low, high, width)
    };
    let mut points = Vec::with_capacity(indices.len() * 2);
    for index in indices {
        points.extend_from_slice(&[times[index], values[index]]);
    }
    collapse_horizontal_runs(points, 2)
}

/// Returns one record per bucket, flattened as
/// `[lower_time, lower_frequency, lower_period, lower_duty,
///   upper_time, upper_frequency, upper_period, upper_duty]`.
#[wasm_bindgen]
pub fn build_visible_envelope(
    times: &[f64],
    frequencies: &[f64],
    periods: &[f64],
    duty_cycles: &[f64],
    range_min: f64,
    range_max: f64,
    width_px: f64,
) -> Vec<f64> {
    let length = source_length(times, frequencies);
    if length == 0 {
        return Vec::new();
    }
    let (times, frequencies) = (&times[..length], &frequencies[..length]);
    let (low, high) = visible_bounds(times, range_min, range_max);
    let width = pixel_width(width_px);
    let count = high - low + 1;
    let mut pairs = Vec::new();
    if count <= (width * 2).max(2000) {
        pairs.extend((low..=high).map(|index| (index, index)));
    } else {
        let start_time = times[low];
        let span = times[high] - start_time;
        if span <= 0.0 {
            pairs.push((low, low));
        } else {
            for bucket in 0..width {
                let start = start_time + span * bucket as f64 / width as f64;
                let end = if bucket + 1 == width {
                    times[high]
                } else {
                    start_time + span * (bucket + 1) as f64 / width as f64
                };
                let bucket_low = low.max(lower_bound(times, start));
                let Some(bucket_high) = upper_bound(times, end).map(|index| high.min(index)) else {
                    continue;
                };
                if bucket_low <= bucket_high {
                    pairs.push(extrema(frequencies, bucket_low, bucket_high));
                }
            }
        }
    }
    let mut output = Vec::with_capacity(pairs.len() * FREQUENCY_STRIDE * 2);
    for (minimum, maximum) in pairs {
        frequency_point(
            &mut output,
            minimum,
            times,
            frequencies,
            periods,
            duty_cycles,
        );
        frequency_point(
            &mut output,
            maximum,
            times,
            frequencies,
            periods,
            duty_cycles,
        );
    }
    output
}

/// Selects one real source point per bucket and returns flattened frequency points.
/// `mode`: 0=center, 1=first, 2=last, 3=turns.
#[wasm_bindgen]
pub fn build_visible_representative(
    times: &[f64],
    frequencies: &[f64],
    periods: &[f64],
    duty_cycles: &[f64],
    range_min: f64,
    range_max: f64,
    width_px: f64,
    mode: u8,
) -> Vec<f64> {
    let length = source_length(times, frequencies);
    if length == 0 {
        return Vec::new();
    }
    let (times, frequencies) = (&times[..length], &frequencies[..length]);
    let (low, high) = visible_bounds(times, range_min, range_max);
    let width = pixel_width(width_px);
    let count = high - low + 1;
    let indices: Vec<usize> = if count <= (width * 2).max(2000) {
        (low..=high).collect()
    } else {
        let start_time = times[low];
        let span = times[high] - start_time;
        if span <= 0.0 {
            vec![low]
        } else {
            let mut output = Vec::with_capacity(width + 1);
            let mut previous = low;
            for bucket in 0..width {
                let start = start_time + span * bucket as f64 / width as f64;
                let end = if bucket + 1 == width {
                    times[high]
                } else {
                    start_time + span * (bucket + 1) as f64 / width as f64
                };
                let bucket_low = low.max(lower_bound(times, start));
                let Some(bucket_high) = upper_bound(times, end).map(|index| high.min(index)) else {
                    continue;
                };
                if bucket_low > bucket_high {
                    continue;
                }
                let selected = match mode {
                    1 => bucket_low,
                    2 => bucket_high,
                    3 if bucket_high - bucket_low >= 2 => {
                        let mut best = bucket_low;
                        let mut best_score = -1.0;
                        for index in bucket_low..=bucket_high {
                            let left = frequencies[index.saturating_sub(1).max(low)];
                            let right = frequencies[(index + 1).min(high)];
                            let score = (2.0 * frequencies[index] - left - right).abs();
                            if score > best_score {
                                best_score = score;
                                best = index;
                            }
                        }
                        best
                    }
                    _ => (bucket_low + bucket_high) / 2,
                };
                if selected != previous || output.is_empty() {
                    output.push(selected);
                    previous = selected;
                }
            }
            if output.last().copied() != Some(high) {
                output.push(high);
            }
            output
        }
    };
    let mut output = Vec::with_capacity(indices.len() * FREQUENCY_STRIDE);
    for index in indices {
        frequency_point(&mut output, index, times, frequencies, periods, duty_cycles);
    }
    output
}
