use pulseview_wasm_core::compute_acceleration_points;

const SG_WINDOW: u32 = 11;
const FFT_CUTOFF_HZ: f64 = 100.0;
const KALMAN_PROCESS_NOISE: f64 = 25.0;
const KALMAN_MEASUREMENT_NOISE: f64 = 0.000_001;
const TD_BANDWIDTH: f64 = 40.0;

fn compute(times: &[f64], frequencies: &[f64], algorithm: u8) -> Vec<f64> {
    compute_acceleration_points(
        times,
        frequencies,
        algorithm,
        SG_WINDOW,
        FFT_CUTOFF_HZ,
        KALMAN_PROCESS_NOISE,
        KALMAN_MEASUREMENT_NOISE,
        TD_BANDWIDTH,
    )
}

fn values(flattened: &[f64]) -> impl Iterator<Item = f64> + '_ {
    flattened.chunks_exact(2).map(|point| point[1])
}

#[test]
fn fewer_than_three_points_return_no_acceleration() {
    assert!(compute(&[], &[], 0).is_empty());
    assert!(compute(&[0.0, 1.0], &[10.0, 11.0], 4).is_empty());
}

#[test]
fn raw_and_sg_preserve_a_linear_ramp() {
    let times: Vec<f64> = (0..61).map(|index| index as f64 * 0.02).collect();
    let frequencies: Vec<f64> = times.iter().map(|time| 100.0 + 12.0 * time).collect();
    for algorithm in [0, 1] {
        let output = compute(&times, &frequencies, algorithm);
        assert_eq!(output.len(), times.len() * 2);
        assert!((output[2 * 30 + 1] - 12.0).abs() < 1e-8);
    }
}

#[test]
fn all_algorithms_keep_constant_frequency_at_zero() {
    let times: Vec<f64> = (0..30).map(|index| index as f64 * 0.1).collect();
    let frequencies = vec![500.0; times.len()];
    for algorithm in 0..=4 {
        let output = compute(&times, &frequencies, algorithm);
        assert_eq!(output.len(), times.len() * 2, "algorithm {algorithm}");
        assert!(
            values(&output).all(|value| value.is_finite() && value.abs() < 1e-7),
            "algorithm {algorithm}"
        );
    }
}

#[test]
fn all_algorithms_produce_finite_values_for_a_linear_ramp() {
    let times: Vec<f64> = (0..61).map(|index| index as f64 * 0.02).collect();
    let frequencies: Vec<f64> = times.iter().map(|time| 100.0 + 12.0 * time).collect();
    for algorithm in 0..=4 {
        let output = compute(&times, &frequencies, algorithm);
        assert_eq!(output.len(), times.len() * 2, "algorithm {algorithm}");
        assert!(values(&output).all(f64::is_finite), "algorithm {algorithm}");
        for (index, point) in output.chunks_exact(2).enumerate() {
            assert_eq!(point[0], times[index]);
        }
    }
}

#[test]
fn duplicate_timestamps_are_finite_for_every_algorithm() {
    let times = [0.0, 0.1, 0.1, 0.2, 0.4, 0.4, 0.6];
    let frequencies = [10.0, 11.0, 11.5, 12.0, 14.0, 14.5, 16.0];
    for algorithm in 0..=4 {
        let output = compute(&times, &frequencies, algorithm);
        assert_eq!(output.len(), times.len() * 2, "algorithm {algorithm}");
        assert!(values(&output).all(f64::is_finite), "algorithm {algorithm}");
    }
}

#[test]
fn all_equal_timestamps_do_not_divide_by_zero() {
    let times = [1.0, 1.0, 1.0, 1.0];
    let frequencies = [10.0, 12.0, 14.0, 16.0];
    for algorithm in 0..=4 {
        let output = compute(&times, &frequencies, algorithm);
        assert!(values(&output).all(f64::is_finite), "algorithm {algorithm}");
    }
}
