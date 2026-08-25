# Acceleration Algorithms Design

## Goal

Let users choose a noise-resistant acceleration estimator directly above the acceleration chart without modifying imported frequency data.

## Design

The derivative view owns transient estimator state. `computeAcceleration` receives a typed option object and returns one acceleration point per frequency point, preserving the shared time axis and cursor behavior. The compact control bar displays only the selected estimator's parameters.

## Estimators

- SG plus central difference is the default and preserves ramps and local peaks.
- FFT low-pass resamples the signal, removes bins above the cutoff, interpolates to the source timeline, then differentiates.
- The constant-acceleration Kalman filter estimates velocity and acceleration from noisy frequency observations.
- A critically damped tracking differentiator outputs a low-latency rate estimate.

## Validation

Unit tests cover output shape, finite values, linear-ramp preservation for SG, and zero acceleration on constant-frequency data. Build and the existing test suite must pass before release.
