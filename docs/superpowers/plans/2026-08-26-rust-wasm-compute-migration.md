# Rust/WASM Compute Migration Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Keep the TypeScript reference path until the corresponding Rust/WASM equivalence tests pass.

**Goal:** Add a Rust/WebAssembly compute engine for the performance-sensitive analysis modules while preserving the existing TypeScript behavior and browser fallback.

**Architecture:** Rust owns coarse-grained numeric kernels exposed through `wasm-bindgen`; TypeScript owns public domain types, adapters, UI, parsing workers, and reference implementations. Development and tests can run TS/WASM comparisons, while production prefers WASM and falls back to TS if loading or execution fails.

**Tech Stack:** Rust, `wasm-bindgen`, WebAssembly, Vite, React 18, TypeScript 5, Node test runner, Cargo tests.

---

### Task 1: Establish the Rust/WASM crate and deterministic build contract

**Files:**
- Create: `wasm-core/Cargo.toml`
- Create: `wasm-core/src/lib.rs`
- Create: `wasm-core/src/lib_tests.rs`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `scripts/build-wasm.mjs`

- [ ] Add a minimal crate with `cdylib` and `rlib` crate types, `wasm-bindgen`, and Rust unit tests.
- [ ] Add a `wasm_smoke_add` export and a Rust test for it so the crate has an executable first milestone.
- [ ] Add a Node build script that invokes the locally installed wasm-bindgen CLI if available and emits `src/wasm/pkg`; fail with an actionable message if unavailable.
- [ ] Add `wasm:build` and `wasm:test` scripts without changing the existing `test` or `build` commands yet.
- [ ] Run `cargo test --manifest-path wasm-core/Cargo.toml`; expected: Rust smoke test passes.
- [ ] Run `npm run wasm:build`; expected: generated WASM package is created or the command reports the missing CLI without modifying application behavior.

### Task 2: Add the TypeScript loader, comparison mode, and fallback adapter

**Files:**
- Create: `src/wasm/loader.ts`
- Create: `src/wasm/compare.ts`
- Create: `src/wasm/runtime.ts`
- Create: `tests/wasmRuntime.test.mjs`
- Modify: `package.json`

- [ ] Define a runtime state with `unavailable`, `loading`, `ready`, and `fallback` states.
- [ ] Load the generated module asynchronously and expose `initializeWasm()` plus `getWasmState()`.
- [ ] Implement numeric comparison with `absoluteTolerance + relativeTolerance * max(abs(a), abs(b))`, and strict comparison for lengths and integer fields.
- [ ] Implement a development-only dual-run helper that invokes a TypeScript reference function and a WASM function, throws a diagnostic mismatch, and returns the WASM result when equal.
- [ ] Add tests for equal floats, tolerated floats, mismatched lengths, and fallback after loader failure.
- [ ] Run `node --experimental-strip-types tests/wasmRuntime.test.mjs`; expected: all adapter tests pass.

### Task 3: Migrate transition primitives and statistics

**Files:**
- Modify: `wasm-core/src/lib.rs`
- Create: `wasm-core/src/compute.rs`
- Create: `wasm-core/tests/compute.rs`
- Create: `src/wasm/compute.ts`
- Create: `tests/wasmCompute.test.mjs`
- Modify: `src/compute.ts`

- [ ] Expose batch Rust functions for edge derivation, pulse counting, frequency points, low-gap markers, statistics, and histogram bins using typed numeric buffers and serialized result objects only where the result is structured.
- [ ] Port the current boundary semantics exactly: zero/negative intervals, first/last points, default levels, empty input, and frequency modes.
- [ ] Add Rust tests for empty input, three transitions, irregular timestamps, low-gap threshold boundaries, constant data, and histogram extremes.
- [ ] Add Node equivalence tests comparing representative and randomized deterministic inputs against the TypeScript reference functions.
- [ ] Add `wasmCompute.ts` wrappers that select WASM in production and use dual-run mode in development/tests.
- [ ] Run Rust tests, WASM equivalence tests, and the existing compute tests; expected: all pass before changing application call sites.

### Task 4: Migrate acceleration estimators and harden segment detection

**Files:**
- Modify: `wasm-core/src/compute.rs`
- Create: `wasm-core/tests/acceleration.rs`
- Create: `src/wasm/acceleration.ts`
- Create: `tests/wasmAcceleration.test.mjs`
- Modify: `src/compute.ts`
- Modify: `src/acceleration.ts`

- [ ] Port raw differentiation, SG smoothing, FFT low-pass, Kalman, and tracking differentiator as batch operations.
- [ ] Preserve output shape and finite-value behavior for fewer than three points, duplicate timestamps, irregular timestamps, and constant frequency.
- [ ] Add a guard in both implementations so zero-duration input cannot create a non-advancing scale loop.
- [ ] Refactor segment splitting to avoid scanning every existing segment for each gap; preserve segment ordering and labels.
- [ ] Add tests for the degenerate timestamp case, linear ramps, constant values, and all five estimator modes.
- [ ] Run Rust tests, acceleration equivalence tests, existing tests, and production build; expected: all pass.

### Task 5: Migrate AB and direction analysis with linear-time lookup

**Files:**
- Modify: `wasm-core/src/compute.rs`
- Create: `wasm-core/tests/encoder.rs`
- Create: `src/wasm/encoder.ts`
- Create: `tests/wasmEncoder.test.mjs`
- Modify: `src/computeAb.ts`
- Modify: `src/computeDirection.ts`

- [ ] Port AB state-machine output exactly, including invalid transitions, cycle counts, phase statistics, and signed frequency points.
- [ ] Replace nearest same-level phase matching with sorted per-level two-pointer lookup.
- [ ] Port direction analysis with a monotonic direction cursor and reuse the same direction index for point generation.
- [ ] Add equivalence tests for forward/reverse quadrature, invalid transitions, no direction changes, sparse direction changes, and duplicate times.
- [ ] Run all encoder tests and the existing direction tests before wiring the UI to the adapter.

### Task 6: Migrate decimation and visible-range operations

**Files:**
- Modify: `wasm-core/src/compute.rs`
- Create: `wasm-core/tests/decimation.rs`
- Create: `src/wasm/decimation.ts`
- Create: `tests/wasmDecimation.test.mjs`
- Modify: `src/decimate.ts`

- [ ] Port lower/upper bounds, visible series, envelope extrema, and representative selection as batch operations.
- [ ] Preserve source-point selection and horizontal-run collapsing semantics.
- [ ] Test empty arrays, one-point arrays, out-of-range windows, dense data, and all representative modes.
- [ ] Keep the existing WeakMap index cache in TypeScript until WASM benchmarks show the replacement is beneficial.
- [ ] Run decimation equivalence tests and the existing decimation suite.

### Task 7: Wire production call sites and maintain dual-run diagnostics

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/DerivView.tsx`
- Modify: `src/components/AbAnalysisView.tsx`
- Modify: `src/components/AnalysisPanel.tsx`
- Modify: `src/components/FreqChart.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `vite.config.ts`

- [ ] Initialize WASM without blocking the upload screen.
- [ ] Route migrated compute calls through adapters; keep parsers and file-format modules unchanged.
- [ ] Enable TS/WASM dual-run only under an explicit development/test flag, not in production.
- [ ] Ensure any WASM error falls back to the corresponding TypeScript function for that operation.
- [ ] Replace known UI-side linear boundary scans with binary-search helpers where this does not alter behavior.
- [ ] Add a small non-user-facing diagnostic hook for mismatch reporting.
- [ ] Run TypeScript typecheck, all existing tests, all WASM equivalence tests, and production build.

### Task 8: Add benchmark commands and decide parser scope from evidence

**Files:**
- Create: `tests/wasmBenchmark.mjs`
- Create: `docs/superpowers/reports/2026-08-26-rust-wasm-compute-benchmark.md`
- Modify: `package.json`

- [ ] Benchmark TS and WASM for frequency calculation, acceleration, AB, direction, decimation, and segment detection at 10k, 100k, and 1M points where feasible.
- [ ] Record cold-load and warm-run timings separately, because WASM initialization and memory copies are one-time costs.
- [ ] Record output equivalence status and peak input/output sizes.
- [ ] Retain WASM only where it improves measured latency or responsiveness; document any module left on TypeScript.
- [ ] Run the complete validation command: `npm test`, `npm run build`, `cargo test --manifest-path wasm-core/Cargo.toml`, and `npm run wasm:build`.
- [ ] Leave the parser modules on TypeScript/Worker unless their benchmark shows a clear net improvement after transfer and decoding costs.

## Final Verification

- [ ] `cargo test --manifest-path wasm-core/Cargo.toml` passes.
- [ ] `npm test` passes unchanged.
- [ ] All WASM equivalence tests pass in dual-run mode.
- [ ] `npm run build` passes and emits the WASM asset.
- [ ] Production WASM load failure falls back to TypeScript.
- [ ] Benchmark report records the result for every migrated module.
