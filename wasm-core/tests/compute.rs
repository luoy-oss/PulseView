use pulseview_wasm_core::{
    compute_histogram_counts, compute_histogram_meta, compute_stats_values,
    count_pulses_from_transitions, derive_falling_edges, derive_rising_edges,
    invert_transition_levels,
};

#[test]
fn derives_edges_and_counts_complete_high_pulses() {
    let times = [0.0, 1.0, 2.0, 4.0, 5.0, 6.0];
    let levels = [0, 1, 0, 1, 0, 1];
    assert_eq!(derive_rising_edges(&times, &levels), vec![1.0, 4.0, 6.0]);
    assert_eq!(derive_falling_edges(&times, &levels), vec![2.0, 5.0]);
    assert_eq!(count_pulses_from_transitions(&levels), 2);
    let inverted = invert_transition_levels(&levels);
    assert_eq!(inverted, vec![1, 0, 1, 0, 1, 0]);
    assert_eq!(derive_falling_edges(&times, &inverted), vec![1.0, 4.0, 6.0]);
}

#[test]
fn computes_sample_statistics() {
    assert!(compute_stats_values(&[]).is_empty());
    assert_eq!(compute_stats_values(&[4.0]), vec![4.0, 4.0, 4.0, 0.0, 0.0]);
    let stats = compute_stats_values(&[1.0, 2.0, 3.0]);
    assert_eq!(&stats[..3], &[1.0, 3.0, 2.0]);
    assert!((stats[3] - 1.0).abs() < 1e-12);
    assert!((stats[4] - 50.0).abs() < 1e-12);
}

#[test]
fn computes_histogram_metadata_and_counts() {
    assert!(compute_histogram_meta(&[], 10, 80).is_empty());
    assert!(compute_histogram_meta(&[3.0, 3.0], 10, 80).is_empty());
    let values = [0.0, 1.0, 2.0, 3.0];
    let meta = compute_histogram_meta(&values, 2, 4);
    assert_eq!(meta, vec![0.0, 3.0, 4.0]);
    assert_eq!(
        compute_histogram_counts(&values, 0.0, 3.0, 4),
        vec![1, 1, 1, 1]
    );
}
