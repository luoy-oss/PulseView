import type { AccelOptions, DerivPoint, FreqPoint } from './types';

export const DEFAULT_ACCEL_OPTIONS: AccelOptions = {
  algorithm: 'raw', sgWindow: 11, fftCutoffHz: 100,
  kalmanProcessNoise: 25, kalmanMeasurementNoise: 0.000001, tdBandwidth: 40,
};

export function computeAcceleration(pts: FreqPoint[], options: AccelOptions = DEFAULT_ACCEL_OPTIONS): DerivPoint[] {
  if (pts.length < 3) return [];
  if (options.algorithm === 'kalman') return kalman(pts, options);
  if (options.algorithm === 'td') return td(pts, options);
  if (options.algorithm === 'raw') return differentiate(pts, Float64Array.from(pts, (point) => point.freq));
  const values = options.algorithm === 'fft' ? fftLowPass(pts, options.fftCutoffHz) : sgSmooth(pts, options.sgWindow);
  return differentiate(pts, values);
}

function differentiate(pts: FreqPoint[], values: Float64Array): DerivPoint[] {
  return pts.map((point, index) => {
    const before = Math.max(0, index - 1), after = Math.min(pts.length - 1, index + 1);
    const dt = pts[after].time - pts[before].time;
    return { time: point.time, value: dt > 0 ? (values[after] - values[before]) / dt : 0 };
  });
}

// Quadratic local least-squares smoothing retains ramps and short peaks on irregular time axes.
function sgSmooth(pts: FreqPoint[], requestedWindow: number): Float64Array {
  const n = pts.length, window = Math.max(3, Math.min(n | 1, Math.round(requestedWindow) | 1));
  const radius = (window - 1) >> 1, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - radius), end = Math.min(n - 1, i + radius), origin = pts[i].time;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
    for (let j = start; j <= end; j++) {
      const x = pts[j].time - origin, y = pts[j].freq, x2 = x * x;
      s0++; s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
      y0 += y; y1 += x * y; y2 += x2 * y;
    }
    const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s2 * s3) + s2 * (s1 * s3 - s2 * s2);
    out[i] = Math.abs(det) > 1e-18 ? (y0 * (s2 * s4 - s3 * s3) - s1 * (y1 * s4 - s3 * y2) + s2 * (y1 * s3 - s2 * y2)) / det : y0 / s0;
  }
  return out;
}

// Resample, low-pass in frequency domain, then interpolate back to source times.
function fftLowPass(pts: FreqPoint[], requestedCutoff: number): Float64Array {
  const n = pts.length, duration = pts[n - 1].time - pts[0].time;
  if (!(duration > 0)) return Float64Array.from(pts, point => point.freq);
  const count = 1 << Math.floor(Math.log2(Math.min(65536, Math.max(8, n))));
  const step = duration / (count - 1), start = pts[0].time, real = new Float64Array(count), imag = new Float64Array(count);
  let source = 0;
  for (let i = 0; i < count; i++) {
    const time = start + i * step;
    while (source + 1 < n && pts[source + 1].time < time) source++;
    const next = Math.min(n - 1, source + 1), span = pts[next].time - pts[source].time;
    real[i] = pts[source].freq + (span > 0 ? (pts[next].freq - pts[source].freq) * (time - pts[source].time) / span : 0);
  }
  fft(real, imag, false);
  const nyquist = 1 / (2 * step), cutoff = requestedCutoff > 0 ? Math.min(requestedCutoff, nyquist) : nyquist * 0.2;
  const maxBin = Math.max(1, Math.floor(cutoff / nyquist * count / 2));
  for (let bin = maxBin + 1; bin < count - maxBin; bin++) { real[bin] = 0; imag[bin] = 0; }
  fft(real, imag, true);
  return Float64Array.from(pts, point => {
    const position = Math.max(0, Math.min(count - 1, (point.time - start) / step)), lo = Math.floor(position), hi = Math.min(count - 1, lo + 1);
    return real[lo] + (real[hi] - real[lo]) * (position - lo);
  });
}

function fft(real: Float64Array, imag: Float64Array, inverse: boolean): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; } }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / length, lr = Math.cos(angle), li = Math.sin(angle);
    for (let i = 0; i < n; i += length) { let wr = 1, wi = 0; for (let j = 0; j < length / 2; j++) {
      const even = i + j, odd = even + length / 2, vr = real[odd] * wr - imag[odd] * wi, vi = real[odd] * wi + imag[odd] * wr, ur = real[even], ui = imag[even];
      real[even] = ur + vr; imag[even] = ui + vi; real[odd] = ur - vr; imag[odd] = ui - vi;
      const nextWr = wr * lr - wi * li; wi = wr * li + wi * lr; wr = nextWr;
    }}
  }
  if (inverse) for (let i = 0; i < n; i++) { real[i] /= n; imag[i] /= n; }
}

function kalman(pts: FreqPoint[], options: AccelOptions): DerivPoint[] {
  let velocity = pts[0].freq, acceleration = 0, p00 = 1, p01 = 0, p10 = 0, p11 = 1;
  const q = Math.max(1e-9, options.kalmanProcessNoise), r = Math.max(1e-9, options.kalmanMeasurementNoise);
  return pts.map((point, i) => {
    const dt = i === 0 ? 0 : Math.max(0, point.time - pts[i - 1].time);
    velocity += acceleration * dt;
    const n00 = p00 + dt * (p10 + p01) + dt * dt * p11 + q * dt ** 4 / 4, n01 = p01 + dt * p11 + q * dt ** 3 / 2, n10 = p10 + dt * p11 + q * dt ** 3 / 2, n11 = p11 + q * dt * dt;
    const kv = n00 / (n00 + r), ka = n10 / (n00 + r), residual = point.freq - velocity;
    velocity += kv * residual; acceleration += ka * residual;
    p00 = (1 - kv) * n00; p01 = (1 - kv) * n01; p10 = n10 - ka * n00; p11 = n11 - ka * n01;
    return { time: point.time, value: acceleration };
  });
}

function td(pts: FreqPoint[], options: AccelOptions): DerivPoint[] {
  let tracked = pts[0].freq, rate = 0; const bandwidth = Math.max(0.1, options.tdBandwidth);
  return pts.map((point, i) => {
    const dt = i === 0 ? 0 : Math.max(0, point.time - pts[i - 1].time);
    // Exact transition of the critically damped second-order tracker for a
    // zero-order-held input: stable even for sparse samples and high bandwidth.
    const error = tracked - point.freq;
    const decay = Math.exp(-bandwidth * dt);
    const combined = rate + bandwidth * error;
    const nextError = (error + combined * dt) * decay;
    rate = (rate - bandwidth * combined * dt) * decay;
    tracked = point.freq + nextError;
    return { time: point.time, value: rate };
  });
}
