use std::collections::VecDeque;

use wasm_bindgen::prelude::*;

pub const SEGMENT_ACCEL: f64 = 0.0;
pub const SEGMENT_DECEL: f64 = 1.0;
pub const SEGMENT_CONST: f64 = 2.0;
pub const SEGMENT_WIDTH: usize = 7;

const GAP_MIN_RATIO: f64 = 30.0;

#[derive(Clone, Copy, PartialEq, Eq)]
enum RawType {
    Change,
    Constant,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SegmentType {
    Accel,
    Decel,
    Constant,
}

#[derive(Clone, Copy)]
struct Segment<T> {
    kind: T,
    start: usize,
    end: usize,
    block: usize,
}

/// Detects acceleration segments and returns flattened records:
/// `[type_code, start_time, end_time, duration, start_freq, end_freq, rate]`.
#[wasm_bindgen]
pub fn detect_accel_segments_batch(times: &[f64], frequencies: &[f64]) -> Vec<f64> {
    let n = times.len().min(frequencies.len());
    if n < 3 {
        return Vec::new();
    }
    let times = &times[..n];
    let frequencies = &frequencies[..n];
    let total_duration = times[n - 1] - times[0];
    if !(total_duration > 0.0) {
        return Vec::new();
    }

    let mut intervals: Vec<f64> = times
        .windows(2)
        .filter_map(|pair| {
            let interval = pair[1] - pair[0];
            (interval > 0.0).then_some(interval)
        })
        .collect();
    intervals.sort_by(f64::total_cmp);
    let median_gap = if intervals.len() > 1 {
        intervals[intervals.len() >> 1]
    } else {
        0.0
    };
    let gap_threshold = gap_threshold_from_sorted(&intervals);

    let mut smoothed = vec![0.0; n];
    for (index, value) in smoothed.iter_mut().enumerate() {
        let start = index.saturating_sub(2);
        let end = (index + 2).min(n - 1);
        *value = frequencies[start..=end].iter().sum::<f64>() / (end - start + 1) as f64;
    }

    let base = (median_gap * 8.0).max(total_duration / 16_384.0);
    let max_scale = (total_duration / 32.0).max(base * 2.0);
    let mut scales = Vec::new();
    let mut scale = base;
    while scale <= max_scale {
        scales.push(scale);
        scale *= 4.0;
    }
    if scales.last().is_none_or(|last| *last < max_scale) {
        scales.push(max_scale);
    }

    let mut max_relative = vec![0.0_f64; n];
    for scale in scales {
        let ranges = window_ranges(times, &smoothed, scale);
        for index in 0..n {
            let relative = if smoothed[index] > 0.0 {
                ranges[index] / smoothed[index]
            } else {
                0.0
            };
            if relative > max_relative[index] {
                max_relative[index] = relative;
            }
        }
    }

    let step = (n / 8_000).max(1);
    let mut sample: Vec<f64> = max_relative.iter().step_by(step).copied().collect();
    sample.sort_by(f64::total_cmp);
    let threshold = (sample[sample.len() / 10] * 20.0).max(0.015);
    let core: Vec<bool> = max_relative
        .iter()
        .map(|value| *value < threshold)
        .collect();
    let mut plateau = core.clone();

    let mut core_start = 0;
    while core_start < n {
        while core_start < n && !core[core_start] {
            core_start += 1;
        }
        if core_start >= n {
            break;
        }
        let mut core_end = core_start;
        while core_end < n && core[core_end] {
            core_end += 1;
        }
        let plateau_frequency =
            smoothed[core_start..core_end].iter().sum::<f64>() / (core_end - core_start) as f64;
        let tolerance = plateau_frequency * 0.01;

        let mut cursor = core_start;
        while cursor > 0 && !plateau[cursor - 1] {
            let point = cursor - 1;
            if (smoothed[point] - plateau_frequency).abs() < tolerance {
                plateau[point] = true;
                cursor -= 1;
                continue;
            }
            if point > 0
                && !plateau[point - 1]
                && (smoothed[point - 1] - plateau_frequency).abs() >= tolerance
            {
                break;
            }
            plateau[point] = true;
            cursor -= 1;
        }

        cursor = core_end;
        while cursor < n && !plateau[cursor] {
            if (smoothed[cursor] - plateau_frequency).abs() < tolerance {
                plateau[cursor] = true;
                cursor += 1;
                continue;
            }
            if cursor + 1 < n
                && !plateau[cursor + 1]
                && (smoothed[cursor + 1] - plateau_frequency).abs() >= tolerance
            {
                break;
            }
            plateau[cursor] = true;
            cursor += 1;
        }
        core_start = core_end;
    }

    let kind_at = |index: usize| {
        if plateau[index] {
            RawType::Constant
        } else {
            RawType::Change
        }
    };
    let mut segments = Vec::new();
    let mut start = 0;
    let mut block = 0;
    for index in 1..n {
        let stop = times[index] - times[index - 1] > gap_threshold;
        if stop || kind_at(index) != kind_at(start) {
            segments.push(Segment {
                kind: kind_at(start),
                start,
                end: index - 1,
                block,
            });
            start = index;
            if stop {
                block += 1;
            }
        }
    }
    segments.push(Segment {
        kind: kind_at(start),
        start,
        end: n - 1,
        block,
    });

    // Stop boundaries are barriers. Carrying a block id makes sharing,
    // merging, and fragment cleanup linear without rescanning all segments.
    for index in 0..segments.len().saturating_sub(1) {
        let (left, right) = segments.split_at_mut(index + 1);
        let left = &mut left[index];
        let right = &mut right[0];
        if left.block != right.block || left.kind == right.kind {
            continue;
        }
        if left.kind == RawType::Change {
            left.end = right.start;
        } else {
            right.start = left.end;
        }
    }

    let mut merged: Vec<Segment<RawType>> = Vec::new();
    for segment in segments {
        if let Some(last) = merged.last_mut() {
            if last.block == segment.block && last.kind == segment.kind {
                last.end = segment.end;
                continue;
            }
        }
        merged.push(segment);
    }

    let mut cleaned: Vec<Segment<RawType>> = Vec::with_capacity(merged.len());
    let mut pending_start: Option<(usize, usize)> = None;
    for index in 0..merged.len() {
        let mut segment = merged[index];
        if let Some((pending_block, start)) = pending_start.take() {
            if pending_block == segment.block {
                segment.start = start;
            } else {
                pending_start = Some((pending_block, start));
            }
        }
        let duration = times[segment.end] - times[segment.start];
        if segment.end - segment.start + 1 < 3 && duration < gap_threshold * 4.0 {
            if let Some(previous) = cleaned
                .last_mut()
                .filter(|item| item.block == segment.block)
            {
                previous.end = segment.end;
                continue;
            }
            if index + 1 < merged.len() && merged[index + 1].block == segment.block {
                pending_start = Some((segment.block, segment.start));
                continue;
            }
        }
        cleaned.push(segment);
    }

    let mut directed: Vec<Segment<SegmentType>> = Vec::new();
    for segment in cleaned {
        let kind = if segment.kind == RawType::Constant {
            SegmentType::Constant
        } else {
            let change = frequencies[segment.end] - frequencies[segment.start];
            if change.abs() < smoothed[segment.start] * 0.005 {
                SegmentType::Constant
            } else if change > 0.0 {
                SegmentType::Accel
            } else {
                SegmentType::Decel
            }
        };
        if let Some(last) = directed.last_mut() {
            if last.block == segment.block && last.kind == kind {
                last.end = segment.end;
                continue;
            }
        }
        directed.push(Segment {
            kind,
            start: segment.start,
            end: segment.end,
            block: segment.block,
        });
    }

    let mut output = Vec::with_capacity(directed.len() * SEGMENT_WIDTH);
    for segment in directed {
        let start_time = times[segment.start];
        let end_time = times[segment.end];
        let duration = end_time - start_time;
        let start_frequency = frequencies[segment.start];
        let end_frequency = frequencies[segment.end];
        let type_code = match segment.kind {
            SegmentType::Accel => SEGMENT_ACCEL,
            SegmentType::Decel => SEGMENT_DECEL,
            SegmentType::Constant => SEGMENT_CONST,
        };
        let rate = if duration > 0.0 {
            (end_frequency - start_frequency) / duration
        } else {
            0.0
        };
        output.extend_from_slice(&[
            type_code,
            start_time,
            end_time,
            duration,
            start_frequency,
            end_frequency,
            rate,
        ]);
    }
    output
}

fn gap_threshold_from_sorted(sorted: &[f64]) -> f64 {
    if sorted.len() < 2 {
        return f64::INFINITY;
    }
    let mut threshold = f64::INFINITY;
    let mut previous = sorted[0];
    for &current in &sorted[1..] {
        if current == previous {
            continue;
        }
        if current / previous >= GAP_MIN_RATIO {
            threshold = threshold.min((previous * current).sqrt());
        }
        previous = current;
    }
    threshold
}

fn window_ranges(times: &[f64], values: &[f64], window: f64) -> Vec<f64> {
    let mut ranges = vec![0.0; times.len()];
    let mut maxima: VecDeque<usize> = VecDeque::new();
    let mut minima: VecDeque<usize> = VecDeque::new();
    let mut left = 0;
    for right in 0..times.len() {
        while maxima
            .back()
            .is_some_and(|index| values[*index] <= values[right])
        {
            maxima.pop_back();
        }
        maxima.push_back(right);
        while minima
            .back()
            .is_some_and(|index| values[*index] >= values[right])
        {
            minima.pop_back();
        }
        minima.push_back(right);
        while left <= right && times[right] - times[left] > window {
            left += 1;
        }
        while maxima.front().is_some_and(|index| *index < left) {
            maxima.pop_front();
        }
        while minima.front().is_some_and(|index| *index < left) {
            minima.pop_front();
        }
        ranges[right] = values[*maxima.front().unwrap()] - values[*minima.front().unwrap()];
    }
    ranges
}
