# Acceleration Algorithms Implementation Plan

**Goal:** Add selectable SG, FFT, Kalman, and TD acceleration estimators to the derivative chart.

1. Add typed algorithm options and a default configuration.
2. Implement smooth-and-differentiate, FFT, Kalman, and TD estimators without changing raw frequency points.
3. Add the compact chart-top selector and conditional parameter inputs.
4. Add numerical regression cases, run tests and production build, bump the release version, and commit the completed change.
