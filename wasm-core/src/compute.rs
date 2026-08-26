use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn derive_rising_edges(trans_times: &[f64], trans_levels: &[i8]) -> Vec<f64> {
    let length = trans_times.len().min(trans_levels.len());
    let mut result = Vec::new();
    for index in 1..length {
        if trans_levels[index] == 1 && trans_levels[index - 1] == 0 {
            result.push(trans_times[index]);
        }
    }
    result
}

#[wasm_bindgen]
pub fn derive_falling_edges(trans_times: &[f64], trans_levels: &[i8]) -> Vec<f64> {
    let length = trans_times.len().min(trans_levels.len());
    let mut result = Vec::new();
    for index in 1..length {
        if trans_levels[index] == 0 && trans_levels[index - 1] == 1 {
            result.push(trans_times[index]);
        }
    }
    result
}

#[wasm_bindgen]
pub fn invert_transition_levels(trans_levels: &[i8]) -> Vec<i8> {
    trans_levels
        .iter()
        .map(|level| if *level == 1 { 0 } else { 1 })
        .collect()
}

#[wasm_bindgen]
pub fn count_pulses_from_transitions(trans_levels: &[i8]) -> u32 {
    trans_levels
        .windows(2)
        .filter(|levels| levels[0] == 1 && levels[1] == 0)
        .count() as u32
}

/// Returns [min, max, average, sample standard deviation, coefficient of variation].
/// Empty input returns an empty vector to preserve the TypeScript null result.
#[wasm_bindgen]
pub fn compute_stats_values(frequencies: &[f64]) -> Vec<f64> {
    if frequencies.is_empty() {
        return Vec::new();
    }
    let mut minimum = f64::INFINITY;
    let mut maximum = f64::NEG_INFINITY;
    let mut sum = 0.0;
    for &frequency in frequencies {
        minimum = minimum.min(frequency);
        maximum = maximum.max(frequency);
        sum += frequency;
    }
    let average = sum / frequencies.len() as f64;
    let standard_deviation = if frequencies.len() > 1 {
        let variance = frequencies
            .iter()
            .map(|frequency| (*frequency - average).powi(2))
            .sum::<f64>()
            / (frequencies.len() - 1) as f64;
        variance.sqrt()
    } else {
        0.0
    };
    vec![
        minimum,
        maximum,
        average,
        standard_deviation,
        standard_deviation / average * 100.0,
    ]
}

/// Returns [minimum, maximum, bin_count] or an empty vector for empty/constant input.
#[wasm_bindgen]
pub fn compute_histogram_meta(frequencies: &[f64], min_bins: u32, max_bins: u32) -> Vec<f64> {
    if frequencies.is_empty() {
        return Vec::new();
    }
    let mut minimum = f64::INFINITY;
    let mut maximum = f64::NEG_INFINITY;
    for &frequency in frequencies {
        minimum = minimum.min(frequency);
        maximum = maximum.max(frequency);
    }
    if maximum - minimum == 0.0 {
        return Vec::new();
    }
    let estimated = (1.0 + 3.322 * (frequencies.len() as f64).log10()).ceil() as u32;
    let count = estimated.min(max_bins).max(min_bins);
    vec![minimum, maximum, count as f64]
}

#[wasm_bindgen]
pub fn compute_histogram_counts(
    frequencies: &[f64],
    minimum: f64,
    maximum: f64,
    bin_count: u32,
) -> Vec<u32> {
    if bin_count == 0 || maximum - minimum == 0.0 {
        return Vec::new();
    }
    let mut bins = vec![0_u32; bin_count as usize];
    let width = (maximum - minimum) / bin_count as f64;
    for &frequency in frequencies {
        let raw = ((frequency - minimum) / width).floor();
        let index = if raw.is_sign_negative() {
            0
        } else {
            (raw as usize).min(bins.len() - 1)
        };
        bins[index] += 1;
    }
    bins
}

fn edge_indices(trans_levels: &[i8], length: usize) -> (Vec<usize>, Vec<usize>) {
    let mut rises = Vec::new();
    let mut falls = Vec::new();
    for index in 1..length.min(trans_levels.len()) {
        if trans_levels[index] == 1 && trans_levels[index - 1] == 0 {
            rises.push(index);
        } else if trans_levels[index] == 0 && trans_levels[index - 1] == 1 {
            falls.push(index);
        }
    }
    (rises, falls)
}

fn push_point(result: &mut Vec<f64>, time: f64, frequency: f64, period: f64, duty: f64) {
    result.extend_from_slice(&[time, frequency, period, duty]);
}

/// Returns flattened [time, frequency, period, duty_cycle] points.
/// mode: 0=pulse, 1=rising, 2=falling, 3=low-gap; edge_base: 0=falling, 1=rising.
#[wasm_bindgen]
pub fn compute_frequency_points(
    trans_times: &[f64],
    trans_levels: &[i8],
    mode: u8,
    duty_correct: bool,
    edge_base: u8,
    low_gap_tolerance_enabled: bool,
    low_gap_tolerance_pct: f64,
    default_level: i8,
) -> Vec<f64> {
    if trans_times.len() < 3 {
        return Vec::new();
    }
    let (rises, falls) = edge_indices(trans_levels, trans_times.len());
    let mut result = Vec::new();

    if mode == 3 {
        let Some(&first_rise) = rises.first() else {
            return result;
        };
        let Some(first_fall) = falls.iter().position(|fall| *fall > first_rise) else {
            return result;
        };
        let tolerance = low_gap_tolerance_pct.max(0.0) / 100.0;
        for k in first_fall + 1..falls.len() {
            let period = trans_times[falls[k]] - trans_times[falls[k - 1]];
            let Some(&rise) = rises.get(k - first_fall) else {
                continue;
            };
            if period <= 0.0 || rise >= falls[k] {
                continue;
            }
            let width = trans_times[falls[k]] - trans_times[rise];
            if width <= 0.0 {
                continue;
            }
            let duty = width / period;
            let raw_gap = period - 2.0 * width;
            let gap = if low_gap_tolerance_enabled && (duty - 0.5).abs() <= tolerance {
                0.0
            } else {
                raw_gap
            };
            push_point(
                &mut result,
                (trans_times[falls[k - 1]] + trans_times[falls[k]]) / 2.0,
                gap,
                period,
                duty,
            );
        }
        return result;
    }

    if mode == 1 {
        let Some(&first_rise) = rises.first() else {
            return result;
        };
        let boundary = first_rise == 1;
        if boundary && first_rise + 1 < trans_times.len() {
            let width = trans_times[first_rise + 1] - trans_times[first_rise];
            if width > 0.0 {
                push_point(
                    &mut result,
                    trans_times[first_rise],
                    1.0 / (2.0 * width),
                    2.0 * width,
                    0.5,
                );
            }
        }
        if !boundary && rises.len() >= 2 {
            let (i, j) = (rises[0], rises[1]);
            let dt = trans_times[j] - trans_times[i];
            let width = if i + 1 < trans_times.len() {
                trans_times[i + 1] - trans_times[i]
            } else {
                0.0
            };
            if dt > 0.0 && width > 0.0 {
                push_point(&mut result, trans_times[i], 1.0 / dt, dt, width / dt);
            }
        }
        for k in 2..rises.len() {
            let (i, j) = (rises[k - 1], rises[k]);
            let dt = trans_times[j] - trans_times[i];
            if dt > 0.0 {
                push_point(&mut result, trans_times[j], 1.0 / dt, dt, f64::NAN);
            }
        }
        let last_rise = *rises.last().unwrap();
        let terminal_fall = last_rise + 1;
        if terminal_fall < trans_times.len()
            && terminal_fall == trans_times.len() - 1
            && trans_levels.get(terminal_fall).copied() == Some(default_level)
        {
            let width = trans_times[terminal_fall] - trans_times[last_rise];
            if width > 0.0 {
                let point = [
                    trans_times[last_rise],
                    1.0 / (2.0 * width),
                    2.0 * width,
                    0.5,
                ];
                if result.len() >= 4 && result[result.len() - 4] == point[0] {
                    let start = result.len() - 4;
                    result[start..].copy_from_slice(&point);
                } else {
                    result.extend_from_slice(&point);
                }
            }
        }
        return result;
    }

    if mode == 2 {
        let Some(&first_rise) = rises.first() else {
            return result;
        };
        let Some(first_fall) = falls.iter().position(|fall| *fall > first_rise) else {
            return result;
        };
        let width0 = trans_times[falls[first_fall]] - trans_times[first_rise];
        if width0 > 0.0 {
            let boundary = first_rise == 1;
            let next_fall = falls.get(first_fall + 1).copied();
            if !boundary && next_fall.is_some() {
                let period = trans_times[next_fall.unwrap()] - trans_times[falls[first_fall]];
                push_point(
                    &mut result,
                    trans_times[first_rise],
                    if period > 0.0 {
                        1.0 / period
                    } else {
                        1.0 / (2.0 * width0)
                    },
                    if period > 0.0 { period } else { 2.0 * width0 },
                    if period > 0.0 { width0 / period } else { 0.5 },
                );
            } else {
                push_point(
                    &mut result,
                    trans_times[first_rise],
                    1.0 / (2.0 * width0),
                    2.0 * width0,
                    0.5,
                );
            }
        }
        for k in first_fall + 1..falls.len() {
            let period = trans_times[falls[k]] - trans_times[falls[k - 1]];
            if period <= 0.0 {
                continue;
            }
            let rise = rises.get(k - first_fall).copied();
            let width = rise
                .filter(|r| *r < falls[k])
                .map(|r| trans_times[falls[k]] - trans_times[r])
                .unwrap_or(0.0);
            let terminal = k == falls.len() - 1
                && falls[k] == trans_times.len() - 1
                && trans_levels.get(falls[k]).copied() == Some(default_level);
            push_point(
                &mut result,
                (trans_times[falls[k - 1]] + trans_times[falls[k]]) / 2.0,
                if terminal && width > 0.0 {
                    1.0 / (2.0 * width)
                } else {
                    1.0 / period
                },
                if terminal && width > 0.0 {
                    2.0 * width
                } else {
                    period
                },
                if terminal {
                    0.5
                } else if width > 0.0 {
                    width / period
                } else {
                    0.5
                },
            );
        }
        return result;
    }

    for (k, &rise) in rises.iter().enumerate() {
        if rise + 1 >= trans_times.len() {
            continue;
        }
        let width = trans_times[rise + 1] - trans_times[rise];
        if width <= 0.0 {
            continue;
        }
        let (mut period, mut duty) = if k == 0 {
            (2.0 * width, 0.5)
        } else {
            let p = if edge_base == 0 {
                match (falls.get(k), falls.get(k - 1)) {
                    (Some(a), Some(b)) => trans_times[*a] - trans_times[*b],
                    _ => 2.0 * width,
                }
            } else {
                trans_times[rises[k]] - trans_times[rises[k - 1]]
            };
            (p, if p > 0.0 { width / p } else { 0.5 })
        };
        let terminal = rise + 1 == trans_times.len() - 1
            && trans_levels.get(rise + 1).copied() == Some(default_level);
        if terminal {
            period = 2.0 * width;
            duty = 0.5;
        }
        push_point(
            &mut result,
            trans_times[rise],
            if duty_correct || terminal {
                1.0 / period
            } else {
                1.0 / (2.0 * width)
            },
            if terminal { period } else { width },
            duty,
        );
    }
    result
}

/// Returns flattened [start_time, end_time, gap, duty_cycle] markers.
#[wasm_bindgen]
pub fn compute_low_gap_markers(
    trans_times: &[f64],
    trans_levels: &[i8],
    threshold: f64,
    tolerance_enabled: bool,
    tolerance_pct: f64,
) -> Vec<f64> {
    if trans_times.len() < 3 {
        return Vec::new();
    }
    let (rises, falls) = edge_indices(trans_levels, trans_times.len());
    let Some(&first_rise) = rises.first() else {
        return Vec::new();
    };
    let Some(first_fall) = falls.iter().position(|fall| *fall > first_rise) else {
        return Vec::new();
    };
    let minimum = 0.0009_f64.max(if threshold.is_finite() {
        threshold
    } else {
        0.001
    });
    let tolerance = tolerance_pct.max(0.0) / 100.0;
    let mut result = Vec::new();
    for k in first_fall + 1..falls.len() {
        let Some(&rise) = rises.get(k - first_fall) else {
            continue;
        };
        if rise >= falls[k] {
            continue;
        }
        let period = trans_times[falls[k]] - trans_times[falls[k - 1]];
        let width = trans_times[falls[k]] - trans_times[rise];
        let low_start = trans_times[falls[k - 1]];
        let low_end = trans_times[rise];
        if period <= 0.0 || width <= 0.0 || low_end <= low_start {
            continue;
        }
        let duty = width / period;
        let raw_gap = period - 2.0 * width;
        let gap = if tolerance_enabled && (duty - 0.5).abs() <= tolerance {
            0.0
        } else {
            raw_gap
        };
        if gap >= minimum {
            result.extend_from_slice(&[low_start, low_end, gap, duty]);
        }
    }
    result
}
