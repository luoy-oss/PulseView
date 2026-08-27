use wasm_bindgen::prelude::*;

const AB_HEADER_LEN: usize = 13;
const DIRECTION_HEADER_LEN: usize = 7;
const POINT_LEN: usize = 3;

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn channel_len(times: &[f64], levels: &[i8]) -> usize {
    times.len().min(levels.len())
}

fn transition_direction(from: i8, to: i8) -> i8 {
    match (from, to) {
        (0, 2) | (2, 3) | (3, 1) | (1, 0) => 1,
        (0, 1) | (1, 3) | (3, 2) | (2, 0) => -1,
        _ => 0,
    }
}

fn push_point(output: &mut Vec<f64>, time: f64, frequency: f64, direction: i8) {
    output.extend_from_slice(&[time, frequency, direction as f64]);
}

/// Computes the complete AB analysis in one call.
///
/// The flattened result is:
/// `[point_count, a_pulses, b_pulses, a_edges, b_edges, cycles,
/// forward_cycles, reverse_cycles, invalid_transitions, mean_period,
/// mean_phase, phase_std, phase_lead_code, ...points]`, where every point is
/// `[time, signed_frequency, direction_code]`. Direction and phase-lead codes
/// are `1=forward/A leads B`, `-1=reverse/B leads A`, and `0=no clear lead`.
#[wasm_bindgen]
pub fn compute_ab_analysis_batch(
    a_times: &[f64],
    a_levels: &[i8],
    b_times: &[f64],
    b_levels: &[i8],
) -> Vec<f64> {
    let a_len = channel_len(a_times, a_levels);
    let b_len = channel_len(b_times, b_levels);
    let mut points = Vec::new();
    let mut state = 0_i8;
    let mut known_mask = 0_i8;
    let mut cycle_start = 0.0;
    let mut cycle_steps = 0_u32;
    let mut cycle_direction = 0_i8;
    let mut forward_cycles = 0_u32;
    let mut reverse_cycles = 0_u32;
    let mut invalid_transitions = 0_u32;
    let (mut ai, mut bi) = (0_usize, 0_usize);

    // Merge already time-ordered channels and consume equal timestamps as one
    // state change. This avoids allocating and sorting the combined stream.
    while ai < a_len || bi < b_len {
        let time = match (a_times.get(ai), b_times.get(bi)) {
            (Some(&a), Some(&b)) => a.min(b),
            (Some(&a), None) => a,
            (None, Some(&b)) => b,
            (None, None) => break,
        };
        let mut next_state = state;
        let mut group_mask = 0_i8;
        while ai < a_len && a_times[ai] == time {
            next_state = (next_state & 1) | (a_levels[ai] << 1);
            group_mask |= 2;
            ai += 1;
        }
        while bi < b_len && b_times[bi] == time {
            next_state = (next_state & 2) | b_levels[bi];
            group_mask |= 1;
            bi += 1;
        }

        let was_fully_known = known_mask == 3;
        known_mask |= group_mask;
        if !was_fully_known {
            state = next_state;
            continue;
        }

        let direction = transition_direction(state, next_state);
        if direction == 0 {
            if next_state != state {
                invalid_transitions += 1;
            }
            cycle_steps = 0;
            cycle_direction = 0;
            cycle_start = time;
        } else if cycle_direction != direction {
            cycle_direction = direction;
            cycle_steps = 1;
            cycle_start = time;
        } else {
            cycle_steps += 1;
        }

        if cycle_steps >= 4 {
            let period = time - cycle_start;
            if period > 0.0 {
                push_point(
                    &mut points,
                    (cycle_start + time) / 2.0,
                    direction as f64 / period,
                    direction,
                );
                if direction > 0 {
                    forward_cycles += 1;
                } else {
                    reverse_cycles += 1;
                }
            }
            cycle_steps = 0;
            cycle_start = time;
        }
        state = next_state;
    }

    let a_edges = a_len.saturating_sub(1);
    let b_edges = b_len.saturating_sub(1);
    let a_pulses = a_levels
        .get(1..a_len)
        .unwrap_or_default()
        .iter()
        .filter(|&&x| x == 1)
        .count();
    let b_pulses = b_levels
        .get(1..b_len)
        .unwrap_or_default()
        .iter()
        .filter(|&&x| x == 1)
        .count();

    let mut b_by_level = [Vec::new(), Vec::new()];
    for index in 1..b_len {
        if matches!(b_levels[index], 0 | 1) {
            b_by_level[b_levels[index] as usize].push(b_times[index]);
        }
    }
    let mut phases = Vec::new();
    // 与 TypeScript 的全量扫描语义一致：对每个 A 边沿，取同电平候选里
    // 距离最近且最先出现的那个。候选按时间升序，先二分插入点，再在等距
    // 时向左取第一个同值元素，精确复刻 TS 的“第一个最近”决胜规则。
    for index in 1..a_len {
        let level = a_levels[index];
        if !matches!(level, 0 | 1) {
            continue;
        }
        let candidates = &b_by_level[level as usize];
        if candidates.is_empty() {
            continue;
        }
        let target = a_times[index];
        let len = candidates.len();
        let mut lower = 0_usize;
        let mut upper = len;
        while lower < upper {
            let middle = (lower + upper) / 2;
            if candidates[middle] < target {
                lower = middle + 1;
            } else {
                upper = middle;
            }
        }
        let insertion = lower;
        let left_distance = if insertion > 0 {
            (candidates[insertion - 1] - target).abs()
        } else {
            f64::INFINITY
        };
        let right_distance = if insertion < len {
            (candidates[insertion] - target).abs()
        } else {
            f64::INFINITY
        };
        // 等距时选左侧（更小的下标），与 TS 扫描顺序一致。
        let (value, chosen_position) = if left_distance <= right_distance {
            (candidates[insertion - 1], insertion - 1)
        } else {
            (candidates[insertion], insertion)
        };
        let mut first = chosen_position;
        while first > 0 && candidates[first - 1] == value {
            first -= 1;
        }
        phases.push(candidates[first] - target);
    }

    let mut periods = Vec::new();
    for rises in b_by_level[1].windows(2) {
        periods.push(rises[1] - rises[0]);
    }
    let mean_phase = mean(&phases);
    let phase_std = if phases.len() > 1 {
        mean(
            &phases
                .iter()
                .map(|phase| (*phase - mean_phase).powi(2))
                .collect::<Vec<_>>(),
        )
        .sqrt()
    } else {
        0.0
    };
    let phase_lead = if mean_phase.abs() < phase_std.max(1e-15) {
        0
    } else if mean_phase > 0.0 {
        1
    } else {
        -1
    };
    let point_count = points.len() / POINT_LEN;
    let mut output = Vec::with_capacity(AB_HEADER_LEN + points.len());
    output.extend_from_slice(&[
        point_count as f64,
        a_pulses as f64,
        b_pulses as f64,
        a_edges as f64,
        b_edges as f64,
        (forward_cycles + reverse_cycles) as f64,
        forward_cycles as f64,
        reverse_cycles as f64,
        invalid_transitions as f64,
        mean(&periods),
        mean_phase,
        phase_std,
        phase_lead as f64,
    ]);
    output.extend(points);
    output
}

/// Computes the complete pulse/direction analysis in one call.
///
/// The flattened result is `[point_count, pulse_edges, forward_cycles,
/// reverse_cycles, unknown_cycles, mean_period, mean_delay, ...points]`.
/// Every point is `[time, signed_frequency, direction_code]`, with direction
/// code `1=forward` and `-1=reverse`.
#[wasm_bindgen]
pub fn compute_direction_analysis_batch(
    pulse_times: &[f64],
    pulse_levels: &[i8],
    direction_times: &[f64],
    direction_levels: &[i8],
    forward_level: i8,
    pulse_level: i8,
) -> Vec<f64> {
    let pulse_len = channel_len(pulse_times, pulse_levels);
    let direction_len = channel_len(direction_times, direction_levels);
    let pulse_edges: Vec<f64> = (1..pulse_len)
        .filter(|&index| {
            pulse_levels[index] == pulse_level && pulse_levels[index - 1] != pulse_level
        })
        .map(|index| pulse_times[index])
        .collect();
    let mut points = Vec::new();
    let mut periods = Vec::new();
    let mut delays = Vec::new();
    let mut forward_cycles = 0_u32;
    let mut reverse_cycles = 0_u32;
    let mut unknown_cycles = 0_u32;
    let mut direction_cursor = 0_usize;

    for edges in pulse_edges.windows(2) {
        let start = edges[0];
        let period = edges[1] - start;
        if period <= 0.0 {
            continue;
        }
        // Pulse edges are monotonic, so every direction transition is visited
        // at most once rather than rescanning the sparse direction channel.
        while direction_cursor + 1 < direction_len && direction_times[direction_cursor + 1] <= start
        {
            direction_cursor += 1;
        }
        // As in the TS channel model, levels[0] is the initial level and is
        // valid before its first timestamp; only a missing/invalid level is
        // unknown.
        if direction_len == 0 || !matches!(direction_levels[direction_cursor], 0 | 1) {
            unknown_cycles += 1;
            continue;
        }
        let sign = if direction_levels[direction_cursor] == forward_level {
            1
        } else {
            -1
        };
        push_point(
            &mut points,
            (start + edges[1]) / 2.0,
            sign as f64 / period,
            sign,
        );
        periods.push(period);
        // Match the TS definition: the initial sample establishes a level but
        // is not itself a direction change, so its delay contribution is zero.
        delays.push(if direction_cursor == 0 {
            0.0
        } else {
            (start - direction_times[direction_cursor]).max(0.0)
        });
        if sign > 0 {
            forward_cycles += 1;
        } else {
            reverse_cycles += 1;
        }
    }

    let point_count = points.len() / POINT_LEN;
    let mut output = Vec::with_capacity(DIRECTION_HEADER_LEN + points.len());
    output.extend_from_slice(&[
        point_count as f64,
        pulse_edges.len() as f64,
        forward_cycles as f64,
        reverse_cycles as f64,
        unknown_cycles as f64,
        mean(&periods),
        mean(&delays),
    ]);
    output.extend(points);
    output
}
