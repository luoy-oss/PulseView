# Rust/WASM Compute Benchmark

## Environment

- Node.js 24.14.0
- Rust 1.94.1
- wasm-bindgen 0.2.100
- Release WASM build with LTO and size optimization
- Measurements are warm medians from `npm run wasm:benchmark`
- WASM initialization: 12.42 ms in the final Node benchmark run

## Results

| Module | Input | TypeScript | WASM | Result |
| --- | ---: | ---: | ---: | --- |
| Frequency calculation adapter | 10,000 | 0.72 ms | 0.41 ms | WASM 1.8x faster |
| Frequency calculation adapter | 100,000 | 2.46 ms | 2.97 ms | TS 1.2x faster |
| Frequency calculation adapter | 1,000,000 | 63.19 ms | 66.07 ms | Comparable; TS retained |
| SG acceleration adapter | 10,000 | 0.45 ms | 1.45 ms | TS 3.2x faster |
| SG acceleration adapter | 100,000 | 7.38 ms | 15.90 ms | TS 2.2x faster |
| SG acceleration adapter | 1,000,000 | 94.45 ms | 203.11 ms | TS 2.2x faster |
| AB analysis adapter | 401 | 0.93 ms | 0.060 ms | WASM 15x faster |
| AB analysis adapter | 2,001 | 10.65 ms | 0.171 ms | WASM 62x faster |
| AB analysis adapter | 4,001 | 35.67 ms | 0.098 ms | WASM 365x faster |
| Direction analysis adapter | 10,000 | 4.44 ms | 0.257 ms | WASM 17x faster |
| Direction analysis adapter | 30,000 | 25.74 ms | 0.850 ms | WASM 30x faster |
| Decimation experimental kernel | 10,000 | 0.35 ms | 0.25 ms | Comparable |
| Decimation experimental kernel | 100,000 | 0.80 ms | 0.73 ms | Comparable |
| Decimation experimental kernel | 1,000,000 | 2.95 ms | 10.80 ms | TS cache 3.7x faster |

## Decisions

- Keep WASM as the production-preferred implementation only for AB analysis and direction analysis. Their algorithmic improvements remain large after typed-array conversion and result decoding are included.
- Keep frequency calculation, statistics, histograms, and acceleration estimation on TypeScript in production. Their Rust implementations and equivalence tests remain as experiments, but end-to-end object/typed-array conversion cost removes the raw-kernel benefit.
- Keep development/test dual execution for semantic validation.
- Keep TypeScript as the default decimation implementation. Its WeakMap-backed extrema index makes repeated viewport operations substantially faster than the current stateless WASM batch implementation at one million points.
- Keep parser modules in TypeScript Web Workers. They are already off the UI thread, and this benchmark does not justify adding text/zip decoding copies across the WASM boundary.
- Keep the Rust decimation implementation and equivalence tests as an experimental path for future persistent-memory/index work, but do not route UI rendering through it.
- Keep acceleration-segment detection on TypeScript. The Rust experiment treats stop gaps as hard block barriers, while the existing implementation emits the gap as an acceleration segment. The Rust module and tests are retained as an experiment, but it is not exported in the production WASM until that product semantic is explicitly changed.

## Artifact Size

Before the encoder and decimation modules were added, the WASM asset was 40.41 KB raw and 17.68 KB gzip. With all currently compiled compute modules it is 55.57 KB raw and 23.77 KB gzip. The generated JavaScript loader is 8.81 KB raw and 2.10 KB gzip.

## Differential Equivalence Verification

`npm run wasm:check` rebuilds and validates the generated package; `tests/wasmDifferential.test.mjs` additionally runs a deterministic differential harness with 12 seeds across every migrated module, including NaN/±Infinity values, duplicate and non-monotonic timestamps, non-binary levels, negative histogram bin arguments, and all option/parameter combinations. The suite runs as part of `npm test`.

Case counts per module: primitives 300, stats 480, histogram 600, frequency 5760, low-gap 360, acceleration 2592, AB 480, direction 480, decimation ~1920, plus 100k-point frequency and 50k-point acceleration sanity cases.

The harness surfaced and the fix committed three genuine divergences between the Rust and TypeScript implementations:

- Histogram binning with NaN/±Infinity frequencies: Rust was casting NaN indices to bucket 0 and double-counting; it now skips non-finite and negative indices exactly like the JavaScript array-property semantics, and accepts negative `minBins/maxBins` as signed integers to match `Math.max(min, Math.min(max, ceil))`, including the `RangeError` on negative bin counts.
- AB nearest same-level edge matching: the monotonic two-pointer cursor stalled on leading equidistant duplicate timestamps; it is replaced by an insertion-point binary search that selects the first-occurrence of the nearest candidate, matching the TypeScript full-scan tie-breaking exactly.
- Pulse and low-gap frequency modes with non-alternating levels: Rust's safe `.get()` returned finite fallbacks where TypeScript's out-of-range indexing produces `NaN`; the kernels now emit `NaN` in those positions, matching output length and field values exactly.

Float comparisons use bit-exact `Object.is` equality for non-finite values and absolute 1e-12 plus relative 1e-9 tolerance for finite values (1e-8 for acceleration, matching its adapter). Exact bit equality across libm implementations is not guaranteed for transcendental functions (FFT cos/sin), but all observed differences are within the stated tolerances.
