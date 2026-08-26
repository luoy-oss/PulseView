# Rust/WASM Compute Migration Design

## Goal

Move the performance-sensitive numerical and analysis modules from the current React/TypeScript implementation to Rust compiled to WebAssembly, while preserving all existing behavior and browser-only deployment.

## Scope

The migration covers independently testable compute modules:

- transition-to-frequency calculations, edge derivation, and pulse counts;
- low-gap markers, statistics, histogram bins, and acceleration segments;
- SG, FFT, Kalman, and tracking-differentiator acceleration estimators;
- visible-range queries, decimation, and envelopes;
- AB-phase analysis and pulse-plus-direction analysis.

The migration does not cover file parsing (`src/workers/*`, `src/*Format.ts`), React components, Chart.js, file I/O, or application state management. Parsers already run in Web Workers, and their text/zip/binary boundaries make a WASM rewrite a separate benchmark-driven decision.

## Architecture

Add a Cargo crate under `wasm-core/`. Rust exposes coarse-grained batch functions through `wasm-bindgen`; typed arrays cross the boundary once per operation where practical. TypeScript keeps the existing implementations as reference implementations and owns the public domain types, adapters, initialization, and fallback behavior.

The adapter has three runtime modes:

- production: use WASM after initialization;
- development/test: run both implementations and compare outputs;
- WASM unavailable or failed: use TypeScript and report the fallback state.

Comparison uses strict equality for discrete fields and absolute-plus-relative tolerances for floating-point fields. A mismatch includes the module, input size, output index, and both values. It must be observable in development and test output rather than silently ignored.

## Migration Order

1. Establish the crate, build pipeline, loader, adapter, and golden tests without changing user-visible behavior.
2. Migrate linear numerical primitives and statistics.
3. Migrate acceleration estimators and segment detection, including guards for degenerate timestamps and worst-case segment processing.
4. Migrate AB and direction analysis, replacing repeated scans with monotonic cursors or binary search while preserving output semantics.
5. Migrate decimation and visible-range operations.
6. Benchmark each module and decide separately whether parser migration has evidence-based benefit.

Each step is complete only after Rust unit tests, TypeScript tests, WASM integration/equivalence tests, the existing test suite, TypeScript build, and production WASM build pass. The next step must not depend on an unverified module.

## Compatibility and Errors

The existing TypeScript functions remain callable as the reference path during migration. The adapter must not change output shape, ordering, treatment of invalid/zero intervals, or edge behavior. WASM initialization is asynchronous and must not prevent the upload screen from rendering. A failed initialization or runtime WASM exception falls back to TypeScript for that operation.

## Acceptance Criteria

- Existing tests remain green.
- Every migrated module has equivalent Rust and TypeScript test cases, including empty, tiny, degenerate, irregular-time, and large-input cases where applicable.
- No unbounded loop exists for invalid or constant timestamps.
- Development/test mode detects intentional TS/WASM divergence.
- Production build loads the WASM asset and has a TypeScript fallback.
- Benchmarks report per-module latency and input size before and after migration; migration is retained only where it improves the measured target or provides a required responsiveness benefit.
