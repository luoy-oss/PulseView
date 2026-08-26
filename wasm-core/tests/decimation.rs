#[path = "../src/decimation.rs"]
mod decimation;

use decimation::{
    build_visible_data, build_visible_envelope, build_visible_representative, build_visible_series,
    has_points_in_range, lower_bound_time, upper_bound_time,
};

const NO_RANGE: f64 = f64::NAN;

fn dense_data(length: usize) -> (Vec<f64>, Vec<f64>) {
    let times = (0..length).map(|index| index as f64 / 1000.0).collect();
    let values = (0..length)
        .map(|index| 100_000.0 + (index % 3) as f64 - 1.0)
        .collect();
    (times, values)
}

#[test]
fn bounds_and_range_queries_cover_edges() {
    let times = [0.0, 1.0, 1.0, 3.0];
    assert_eq!(lower_bound_time(&times, 1.0), 1);
    assert_eq!(lower_bound_time(&times, 2.0), 3);
    assert_eq!(upper_bound_time(&times, 1.0), 2);
    assert_eq!(upper_bound_time(&times, -1.0), -1);
    assert!(has_points_in_range(&times, 1.5, 0.5));
    assert!(!has_points_in_range(&times, 1.5, 2.0));
    assert!(!has_points_in_range(&[], 0.0, 1.0));
}

#[test]
fn empty_single_and_non_intersecting_ranges_match_typescript_fallbacks() {
    assert!(build_visible_data(&[], &[], &[], &[], NO_RANGE, NO_RANGE, 100.0).is_empty());
    assert!(build_visible_series(&[], &[], NO_RANGE, NO_RANGE, 100.0).is_empty());

    let single = build_visible_data(&[2.0], &[7.0], &[0.5], &[0.25], NO_RANGE, NO_RANGE, 100.0);
    assert_eq!(single, vec![2.0, 7.0, 0.5, 0.25]);

    let fallback = build_visible_data(
        &[0.0, 1.0, 2.0],
        &[4.0, 4.0, 4.0],
        &[],
        &[],
        20.0,
        30.0,
        100.0,
    );
    assert_eq!(fallback.len(), 8);
    assert_eq!(fallback[0], 0.0);
    assert_eq!(fallback[4], 2.0);
}

#[test]
fn dense_data_is_bounded_preserves_extrema_and_collapses_horizontal_runs() {
    let length = 100_000;
    let times: Vec<_> = (0..length).map(|index| index as f64 / 1000.0).collect();
    let constant = vec![100_000.0; length];
    let flat = build_visible_data(&times, &constant, &[], &[], NO_RANGE, NO_RANGE, 1200.0);
    assert_eq!(flat.len(), 8);
    assert_eq!(flat[0], times[0]);
    assert_eq!(flat[4], times[length - 1]);

    let changing: Vec<_> = (0..length)
        .map(|index| if index % 2 == 0 { 100_000.0 } else { 200_000.0 })
        .collect();
    let visible = build_visible_series(&times, &changing, NO_RANGE, NO_RANGE, 1200.0);
    assert!(visible.len() / 2 <= 2402);
    assert!(visible.chunks_exact(2).any(|point| point[1] == 100_000.0));
    assert!(visible.chunks_exact(2).any(|point| point[1] == 200_000.0));
}

#[test]
fn envelope_keeps_true_source_minimum_and_maximum_per_bucket() {
    let (times, frequencies) = dense_data(100_000);
    let envelope =
        build_visible_envelope(&times, &frequencies, &[], &[], NO_RANGE, NO_RANGE, 1200.0);
    assert!(envelope.len() / 8 <= 1200);
    for record in envelope.chunks_exact(8) {
        assert!(record[1] <= record[5]);
        assert!(frequencies
            .iter()
            .zip(&times)
            .any(|(&value, &time)| value == record[1] && time == record[0]));
        assert!(frequencies
            .iter()
            .zip(&times)
            .any(|(&value, &time)| value == record[5] && time == record[4]));
    }
    for records in envelope.chunks_exact(8).collect::<Vec<_>>().windows(2) {
        assert!(records[1][0] >= records[0][0]);
        assert!(records[1][4] >= records[0][4]);
    }
}

#[test]
fn all_four_representative_modes_choose_only_real_ordered_source_points() {
    let (times, frequencies) = dense_data(10_000);
    for mode in 0..=3 {
        let representative = build_visible_representative(
            &times,
            &frequencies,
            &[],
            &[],
            NO_RANGE,
            NO_RANGE,
            100.0,
            mode,
        );
        let points: Vec<_> = representative.chunks_exact(4).collect();
        assert!(
            points.len() <= 101,
            "mode {mode} exceeded one point per bucket"
        );
        assert_eq!(points.last().unwrap()[0], *times.last().unwrap());
        for pair in points.windows(2) {
            assert!(pair[1][0] >= pair[0][0], "mode {mode} was not ordered");
        }
        for point in points {
            assert!(
                times
                    .iter()
                    .zip(&frequencies)
                    .any(|(&time, &value)| { time == point[0] && value == point[1] }),
                "mode {mode} synthesized a point"
            );
        }
    }

    let times: Vec<_> = (0..3000).map(|index| index as f64).collect();
    let mut spike = vec![0.0; times.len()];
    spike[100] = 10.0;
    let selected_times = |mode| {
        build_visible_representative(&times, &spike, &[], &[], NO_RANGE, NO_RANGE, 1.0, mode)
            .chunks_exact(4)
            .map(|point| point[0])
            .collect::<Vec<_>>()
    };
    assert_eq!(selected_times(0), vec![1499.0, 2999.0]);
    assert_eq!(selected_times(1), vec![0.0, 2999.0]);
    assert_eq!(selected_times(2), vec![2999.0]);
    assert_eq!(selected_times(3), vec![100.0, 2999.0]);
}
