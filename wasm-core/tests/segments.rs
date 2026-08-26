#[path = "../src/segments.rs"]
mod segments;

use segments::{detect_accel_segments_batch, SEGMENT_ACCEL, SEGMENT_CONST, SEGMENT_WIDTH};

fn records(flat: &[f64]) -> impl Iterator<Item = &[f64]> {
    assert_eq!(flat.len() % SEGMENT_WIDTH, 0);
    flat.chunks_exact(SEGMENT_WIDTH)
}

#[test]
fn constant_frequency_is_a_constant_segment() {
    let times: Vec<f64> = (0..64).map(|index| index as f64 * 0.01).collect();
    let output = detect_accel_segments_batch(&times, &vec![500.0; times.len()]);
    let records: Vec<_> = records(&output).collect();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0][0], SEGMENT_CONST);
    assert_eq!(records[0][1], 0.0);
    assert_eq!(records[0][2], 0.63);
    assert_eq!(records[0][6], 0.0);
}

#[test]
fn linear_rise_is_classified_as_acceleration() {
    let times: Vec<f64> = (0..160).map(|index| index as f64 * 0.01).collect();
    let frequencies: Vec<f64> = (0..160)
        .map(|index| match index {
            0..=39 => 100.0,
            40..=119 => 100.0 + (index - 39) as f64 * 2.0,
            _ => 260.0,
        })
        .collect();
    let output = detect_accel_segments_batch(&times, &frequencies);
    assert!(records(&output).any(|record| record[0] == SEGMENT_ACCEL && record[6] > 0.0));
}

#[test]
fn repeated_or_non_advancing_times_return_empty() {
    assert!(detect_accel_segments_batch(&[1.0, 1.0, 1.0], &[10.0, 20.0, 30.0]).is_empty());
    assert!(detect_accel_segments_batch(&[2.0, 1.0, 1.0], &[10.0, 20.0, 30.0]).is_empty());

    let output = detect_accel_segments_batch(
        &[0.0, 0.1, 0.1, 0.2, 0.3, 0.4],
        &[10.0, 11.0, 11.0, 12.0, 13.0, 14.0],
    );
    assert!(output.iter().all(|value| value.is_finite()));
}

#[test]
fn stop_gap_keeps_time_blocks_separate() {
    let mut times: Vec<f64> = (0..40).map(|index| index as f64 * 0.01).collect();
    times.extend((0..40).map(|index| 10.0 + index as f64 * 0.01));
    let frequencies = vec![250.0; times.len()];
    let output = detect_accel_segments_batch(&times, &frequencies);
    let records: Vec<_> = records(&output).collect();
    assert_eq!(records.len(), 2);
    assert!(records.iter().all(|record| record[0] == SEGMENT_CONST));
    assert!(records
        .iter()
        .all(|record| !(record[1] < 1.0 && record[2] > 1.0)));
}

#[test]
fn short_fragments_are_absorbed_without_zero_or_nonfinite_rates() {
    let times: Vec<f64> = (0..80).map(|index| index as f64 * 0.01).collect();
    let mut frequencies = vec![400.0; times.len()];
    frequencies[39] = 520.0;
    frequencies[40] = 520.0;
    let output = detect_accel_segments_batch(&times, &frequencies);
    let records: Vec<_> = records(&output).collect();
    assert!(records.len() <= 3);
    assert!(records
        .iter()
        .all(|record| record[3] >= 0.0 && record[6].is_finite()));
}
