use std::f64::consts::PI;

use wasm_bindgen::prelude::*;

/// Computes acceleration points and returns flattened `[time, value]` pairs.
///
/// `algorithm` selects 0=raw, 1=Savitzky-Golay, 2=FFT low-pass,
/// 3=Kalman, or 4=tracking differentiator. Unknown values use raw mode.
#[wasm_bindgen]
pub fn compute_acceleration_points(
    times: &[f64],
    frequencies: &[f64],
    algorithm: u8,
    sg_window: u32,
    fft_cutoff_hz: f64,
    kalman_process_noise: f64,
    kalman_measurement_noise: f64,
    td_bandwidth: f64,
) -> Vec<f64> {
    let length = times.len().min(frequencies.len());
    if length < 3 {
        return Vec::new();
    }
    let times = &times[..length];
    let frequencies = &frequencies[..length];

    let values = match algorithm {
        1 => differentiate(times, &sg_smooth(times, frequencies, sg_window)),
        2 => differentiate(times, &fft_low_pass(times, frequencies, fft_cutoff_hz)),
        3 => kalman(
            times,
            frequencies,
            kalman_process_noise,
            kalman_measurement_noise,
        ),
        4 => tracking_differentiator(times, frequencies, td_bandwidth),
        _ => differentiate(times, frequencies),
    };

    flatten(times, &values)
}

fn flatten(times: &[f64], values: &[f64]) -> Vec<f64> {
    let mut result = Vec::with_capacity(times.len() * 2);
    for (&time, &value) in times.iter().zip(values) {
        result.extend_from_slice(&[time, value]);
    }
    result
}

fn differentiate(times: &[f64], values: &[f64]) -> Vec<f64> {
    (0..times.len())
        .map(|index| {
            let before = index.saturating_sub(1);
            let after = (index + 1).min(times.len() - 1);
            let dt = times[after] - times[before];
            if dt > 0.0 {
                (values[after] - values[before]) / dt
            } else {
                0.0
            }
        })
        .collect()
}

// Quadratic local least-squares smoothing on the original, potentially
// irregular time axis. This is the direct counterpart of src/acceleration.ts.
fn sg_smooth(times: &[f64], frequencies: &[f64], requested_window: u32) -> Vec<f64> {
    let length = times.len();
    let requested_odd = (requested_window as usize) | 1;
    let window = requested_odd.min(length | 1).max(3);
    let radius = (window - 1) / 2;
    let mut output = vec![0.0; length];

    for index in 0..length {
        let start = index.saturating_sub(radius);
        let end = (index + radius).min(length - 1);
        let origin = times[index];
        let (mut s0, mut s1, mut s2, mut s3, mut s4) = (0.0, 0.0, 0.0, 0.0, 0.0);
        let (mut y0, mut y1, mut y2) = (0.0, 0.0, 0.0);
        for point in start..=end {
            let x = times[point] - origin;
            let y = frequencies[point];
            let x2 = x * x;
            s0 += 1.0;
            s1 += x;
            s2 += x2;
            s3 += x2 * x;
            s4 += x2 * x2;
            y0 += y;
            y1 += x * y;
            y2 += x2 * y;
        }
        let determinant =
            s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s2 * s3) + s2 * (s1 * s3 - s2 * s2);
        output[index] = if determinant.abs() > 1e-18 {
            (y0 * (s2 * s4 - s3 * s3) - s1 * (y1 * s4 - s3 * y2) + s2 * (y1 * s3 - s2 * y2))
                / determinant
        } else {
            y0 / s0
        };
    }
    output
}

// Resample, low-pass in the frequency domain, then interpolate back to the
// source timestamps.
fn fft_low_pass(times: &[f64], frequencies: &[f64], requested_cutoff: f64) -> Vec<f64> {
    let length = times.len();
    let duration = times[length - 1] - times[0];
    if duration <= 0.0 {
        return frequencies.to_vec();
    }
    let bounded = length.clamp(8, 65_536);
    let count = 1usize << (usize::BITS - 1 - bounded.leading_zeros());
    let step = duration / (count - 1) as f64;
    let start = times[0];
    let mut real = vec![0.0; count];
    let mut imaginary = vec![0.0; count];
    let mut source = 0;

    for (index, sample) in real.iter_mut().enumerate() {
        let time = start + index as f64 * step;
        while source + 1 < length && times[source + 1] < time {
            source += 1;
        }
        let next = (source + 1).min(length - 1);
        let span = times[next] - times[source];
        *sample = frequencies[source]
            + if span > 0.0 {
                (frequencies[next] - frequencies[source]) * (time - times[source]) / span
            } else {
                0.0
            };
    }

    fft(&mut real, &mut imaginary, false);
    let nyquist = 1.0 / (2.0 * step);
    let cutoff = if requested_cutoff > 0.0 {
        requested_cutoff.min(nyquist)
    } else {
        nyquist * 0.2
    };
    let max_bin = ((cutoff / nyquist * count as f64 / 2.0).floor() as usize).max(1);
    for bin in max_bin + 1..count - max_bin {
        real[bin] = 0.0;
        imaginary[bin] = 0.0;
    }
    fft(&mut real, &mut imaginary, true);

    times
        .iter()
        .map(|time| {
            let position = ((*time - start) / step).clamp(0.0, (count - 1) as f64);
            let low = position.floor() as usize;
            let high = (low + 1).min(count - 1);
            real[low] + (real[high] - real[low]) * (position - low as f64)
        })
        .collect()
}

fn fft(real: &mut [f64], imaginary: &mut [f64], inverse: bool) {
    let length = real.len();
    let mut j = 0;
    for index in 1..length {
        let mut bit = length >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if index < j {
            real.swap(index, j);
            imaginary.swap(index, j);
        }
    }
    let mut block_length = 2;
    while block_length <= length {
        let angle = (if inverse { 2.0 } else { -2.0 }) * PI / block_length as f64;
        let (rotation_imaginary, rotation_real) = angle.sin_cos();
        for block in (0..length).step_by(block_length) {
            let (mut weight_real, mut weight_imaginary) = (1.0, 0.0);
            for offset in 0..block_length / 2 {
                let even = block + offset;
                let odd = even + block_length / 2;
                let value_real = real[odd] * weight_real - imaginary[odd] * weight_imaginary;
                let value_imaginary = real[odd] * weight_imaginary + imaginary[odd] * weight_real;
                let (even_real, even_imaginary) = (real[even], imaginary[even]);
                real[even] = even_real + value_real;
                imaginary[even] = even_imaginary + value_imaginary;
                real[odd] = even_real - value_real;
                imaginary[odd] = even_imaginary - value_imaginary;
                let next_weight_real =
                    weight_real * rotation_real - weight_imaginary * rotation_imaginary;
                weight_imaginary =
                    weight_real * rotation_imaginary + weight_imaginary * rotation_real;
                weight_real = next_weight_real;
            }
        }
        block_length <<= 1;
    }
    if inverse {
        for (real, imaginary) in real.iter_mut().zip(imaginary) {
            *real /= length as f64;
            *imaginary /= length as f64;
        }
    }
}

fn kalman(
    times: &[f64],
    frequencies: &[f64],
    process_noise: f64,
    measurement_noise: f64,
) -> Vec<f64> {
    let mut velocity = frequencies[0];
    let mut acceleration = 0.0;
    let (mut p00, mut p01, mut p10, mut p11) = (1.0, 0.0, 0.0, 1.0);
    let process_noise = process_noise.max(1e-9);
    let measurement_noise = measurement_noise.max(1e-9);
    let mut output = Vec::with_capacity(times.len());

    for index in 0..times.len() {
        let dt = if index == 0 {
            0.0
        } else {
            (times[index] - times[index - 1]).max(0.0)
        };
        velocity += acceleration * dt;
        let n00 = p00 + dt * (p10 + p01) + dt * dt * p11 + process_noise * dt.powi(4) / 4.0;
        let n01 = p01 + dt * p11 + process_noise * dt.powi(3) / 2.0;
        let n10 = p10 + dt * p11 + process_noise * dt.powi(3) / 2.0;
        let n11 = p11 + process_noise * dt * dt;
        let velocity_gain = n00 / (n00 + measurement_noise);
        let acceleration_gain = n10 / (n00 + measurement_noise);
        let residual = frequencies[index] - velocity;
        velocity += velocity_gain * residual;
        acceleration += acceleration_gain * residual;
        p00 = (1.0 - velocity_gain) * n00;
        p01 = (1.0 - velocity_gain) * n01;
        p10 = n10 - acceleration_gain * n00;
        p11 = n11 - acceleration_gain * n01;
        output.push(acceleration);
    }
    output
}

fn tracking_differentiator(times: &[f64], frequencies: &[f64], bandwidth: f64) -> Vec<f64> {
    let mut tracked = frequencies[0];
    let mut rate = 0.0;
    let bandwidth = bandwidth.max(0.1);
    let mut output = Vec::with_capacity(times.len());

    for index in 0..times.len() {
        let dt = if index == 0 {
            0.0
        } else {
            (times[index] - times[index - 1]).max(0.0)
        };
        let error = tracked - frequencies[index];
        let decay = (-bandwidth * dt).exp();
        let combined = rate + bandwidth * error;
        let next_error = (error + combined * dt) * decay;
        rate = (rate - bandwidth * combined * dt) * decay;
        tracked = frequencies[index] + next_error;
        output.push(rate);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::differentiate;

    #[test]
    fn central_difference_handles_a_repeated_interval() {
        let result = differentiate(&[0.0, 0.0, 1.0], &[4.0, 4.0, 6.0]);
        assert_eq!(result, vec![0.0, 2.0, 2.0]);
    }
}
