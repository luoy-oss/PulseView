#[path = "../src/encoder.rs"]
mod encoder;

use encoder::{compute_ab_analysis_batch, compute_direction_analysis_batch};

fn close(actual: f64, expected: f64) {
    assert!((actual - expected).abs() < 1e-12, "{actual} != {expected}");
}

#[test]
fn ab_reports_forward_and_reverse_cycles() {
    let forward = compute_ab_analysis_batch(
        &[0.0, 1.0, 3.0, 5.0, 7.0, 9.0],
        &[0, 1, 0, 1, 0, 1],
        &[0.0, 2.0, 4.0, 6.0, 8.0],
        &[0, 1, 0, 1, 0],
    );
    assert_eq!(forward[0], 2.0);
    assert_eq!(forward[6], 2.0);
    assert_eq!(forward[7], 0.0);
    assert_eq!(forward[15], 1.0);

    let reverse = compute_ab_analysis_batch(
        &[0.0, 2.0, 4.0, 6.0, 8.0],
        &[0, 1, 0, 1, 0],
        &[0.0, 1.0, 3.0, 5.0, 7.0, 9.0],
        &[0, 1, 0, 1, 0, 1],
    );
    assert_eq!(reverse[0], 2.0);
    assert_eq!(reverse[6], 0.0);
    assert_eq!(reverse[7], 2.0);
    assert_eq!(reverse[15], -1.0);
}

#[test]
fn ab_counts_illegal_two_bit_jump_and_handles_duplicate_times() {
    let result = compute_ab_analysis_batch(
        &[0.0, 1.0, 1.0, 3.0],
        &[0, 0, 1, 0],
        &[0.0, 1.0, 2.0],
        &[0, 1, 0],
    );
    assert_eq!(result[8], 1.0);
    assert!(result.iter().all(|value| value.is_finite()));
}

#[test]
fn direction_matches_forward_reverse_and_delay_reference() {
    let result = compute_direction_analysis_batch(
        &[0.0, 1.0, 2.0, 3.0, 4.0, 5.0],
        &[0, 1, 0, 1, 0, 1],
        &[0.0, 1.5, 3.5],
        &[1, 0, 1],
        0,
        1,
    );
    assert_eq!(&result[..5], &[2.0, 3.0, 1.0, 1.0, 0.0]);
    close(result[5], 2.0);
    close(result[6], 0.75);
    close(result[8], -0.5);
    assert_eq!(result[9], -1.0);
    close(result[11], 0.5);
    assert_eq!(result[12], 1.0);
}

#[test]
fn direction_handles_sparse_signal_unknowns_and_duplicate_pulses() {
    let sparse = compute_direction_analysis_batch(
        &[0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0],
        &[0, 1, 0, 1, 0, 1, 0, 1],
        &[0.0, 5.5],
        &[0, 1],
        0,
        1,
    );
    assert_eq!(sparse[0], 3.0);
    assert_eq!(sparse[2], 3.0);
    close(sparse[6], 0.0);

    let unknown_and_duplicate = compute_direction_analysis_batch(
        &[0.0, 1.0, 1.0, 1.0, 3.0, 4.0, 5.0],
        &[0, 1, 0, 1, 0, 1, 0],
        &[2.5],
        &[2],
        0,
        1,
    );
    assert_eq!(unknown_and_duplicate[4], 1.0);
    assert!(unknown_and_duplicate.iter().all(|value| value.is_finite()));
}

#[test]
fn ab_nearest_phase_skips_leading_duplicate_ties_like_typescript() {
    // B 在电平 1 上有重复时间戳 0.35,0.35，之后才有更接近的候选。
    // TypeScript 全量扫描会选真正最近的 1.0；旧的单调游标会被等距重复卡住。
    let result = compute_ab_analysis_batch(
        &[0.0, 2.0, 4.0, 6.0, 8.0],
        &[0, 1, 0, 1, 0],
        &[0.0, 0.35, 0.35, 1.0, 3.0, 5.0, 7.0],
        &[0, 1, 1, 1, 1, 1, 1],
    );
    // A 的两个电平 1 边沿（t=2 与 t=6）最近候选均为 1.0/5.0，相位各为 -1.0，
    // meanPhase（header[10]）= -1.0；旧游标会被开头等距重复 0.35 卡住。
    close(result[10], -1.0);
}

#[test]
fn ab_nearest_phase_picks_first_equal_candidate_like_typescript() {
    // 目标 1.5 与候选 1.0、2.0 距离相等：TS 选先出现的 1.0。
    let result = compute_ab_analysis_batch(&[0.0, 1.5], &[0, 1], &[0.0, 1.0, 2.0], &[0, 1, 1]);
    close(result[10], 1.0 - 1.5);
}
