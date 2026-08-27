use pulseview_wasm_core::{
    compute_frequency_points, compute_histogram_counts, compute_histogram_meta,
    compute_stats_values, count_pulses_from_transitions, derive_falling_edges, derive_rising_edges,
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

#[test]
fn histogram_matches_typescript_non_finite_and_clamp_semantics() {
    // NaN 频率在 TypeScript 中不会累加任何数值桶。
    let with_nan = [1.0, f64::NAN, 2.0, 3.0];
    assert_eq!(
        compute_histogram_counts(&with_nan, 1.0, 3.0, 4),
        vec![1, 0, 1, 1]
    );
    // +Infinity 在 TypeScript 中落入最后一桶。
    let with_infinity = [1.0, f64::INFINITY, 2.0, 3.0];
    assert_eq!(
        compute_histogram_counts(&with_infinity, 1.0, 3.0, 4),
        vec![1, 0, 1, 2]
    );
    // 负数 minBins/maxBins 与 Math.max(min, Math.min(max, ceil)) 语义一致：
    // 默认最小 10 桶时，minBins=10、maxBins=-5 仍取 10。
    let values = [0.0, 1.0, 2.0, 3.0];
    let meta = compute_histogram_meta(&values, 10, -5);
    assert_eq!(meta, vec![0.0, 3.0, 10.0]);
    // minBins 为负数时退化为 ceil 结果：ceil(1 + 3.322*log10(4)) = 4。
    let meta_negative_min = compute_histogram_meta(&values, -5, 80);
    assert_eq!(meta_negative_min, vec![0.0, 3.0, 4.0]);
    // 非正 bin_count 不分配内存，直接返回空结果。
    assert!(compute_histogram_counts(&values, 0.0, 3.0, 0).is_empty());
    assert!(compute_histogram_counts(&values, 0.0, 3.0, -2).is_empty());
}

#[test]
fn pulse_mode_emits_nan_period_when_fall_edge_missing_like_typescript() {
    // levels = [0,1,1,0,1,1]：rises=[1,4]，falls=[3]。
    // 第 2 个脉冲（k=1）的 falls[k] 越界，TypeScript 得到 NaN 周期；
    // 不能回退成有限值。
    let times = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
    let levels = [0, 1, 1, 0, 1, 1];
    let points = compute_frequency_points(&times, &levels, 0, true, 0, false, 0.0, 0);
    assert_eq!(points.len(), 8); // 2 个点 × 4 字段
                                 // 第一个点：time=t[1]=1，freq=1/period=1/2=0.5，period 字段=脉宽 w=1，duty=0.5
    assert_eq!(points[0], 1.0);
    assert_eq!(points[1], 0.5);
    assert_eq!(points[2], 1.0);
    assert_eq!(points[3], 0.5);
    // 第二个点：time=t[4]=4，freq=1/NaN=NaN，period 字段=脉宽 w=1，duty=0.5
    assert_eq!(points[4], 4.0);
    assert!(points[5].is_nan(), "freq must be NaN, got {}", points[5]);
    assert_eq!(points[6], 1.0);
    assert_eq!(points[7], 0.5);
}

#[test]
fn low_gap_mode_emits_nan_point_when_rise_exhausted_like_typescript() {
    // levels = [0,1,0,0,0,2,1,1,0,0,2,0]：rises=[1]，falls=[2,8]。
    // k=1 时 rises[k-f0] 越界，TypeScript 产出 freq=NaN、period=6、duty=NaN。
    let times: Vec<f64> = (-500..-488).map(|i| i as f64).collect();
    let levels = [0, 1, 0, 0, 0, 2, 1, 1, 0, 0, 2, 0];
    let points = compute_frequency_points(&times, &levels, 3, false, 0, false, 0.0, 0);
    assert_eq!(points.len(), 4); // 1 个点
    assert_eq!(points[0], -495.0);
    assert!(points[1].is_nan(), "freq must be NaN");
    assert_eq!(points[2], 6.0);
    assert!(points[3].is_nan(), "duty must be NaN");
}
