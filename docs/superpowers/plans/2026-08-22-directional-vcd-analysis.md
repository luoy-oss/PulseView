# Directional VCD Analysis Implementation Plan

> **For agentic workers:** Implement this plan task-by-task in the current workspace.

**Goal:** Add PulseView VCD support for a pulse channel plus an independent direction channel, with automatic/manual channel selection and signed direction frequency rendering.

**Architecture:** Keep ordinary single-channel parsing unchanged. Extend the existing AB VCD workflow with a decoder mode and a pure directional decoder; the encoder view owns channel/mapping selection and feeds normalized signed points into the existing chart and analysis panels.

**Tech Stack:** React 18, TypeScript, Web Worker VCD parser, Chart.js, Node test runner.

---

### Task 1: Add directional types and pure decoder

**Files:**
- Modify: `src/types.ts`
- Create: `src/computeDirection.ts`
- Test: `tests/direction.test.mjs`

- [ ] Add direction mapping/mode/result types and implement decoding from two `AbChannel` inputs. Use consecutive pulse-channel rising or falling edges, sample the latest direction level at the interval start, and emit positive/negative frequencies.
- [ ] Add tests for the four mappings, custom mapping, direction changes before pulse output, signed counts, and unknown initial direction.

### Task 2: Expose all VCD channels through the existing AB entry point

**Files:**
- Modify: `src/workers/vcdParser.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/UploadScreen.tsx`

- [ ] Add an encoder VCD entry mode while preserving normal mode and existing AB mode.
- [ ] Return all one-bit VCD channels for encoder mode and route them to the multi-channel analysis view.
- [ ] Keep ordinary imports on the existing D0 path.

### Task 3: Extend the AB analysis surface with pulse+direction mode

**Files:**
- Modify: `src/components/AbAnalysisView.tsx`
- Modify: `src/components/StatusBar.tsx` only if the normalized summary requires it
- Modify: `src/styles.css`

- [ ] Add decoder mode selector, pulse/direction selectors, automatic candidate selection, pulse-level control, four mapping presets, and custom mapping controls.
- [ ] Recompute and reset analysis state when mode, channels, or mapping changes.
- [ ] Reuse existing chart, range, cursor, export, and analysis panel behavior with signed points.

### Task 4: Verify and document

**Files:**
- Modify: `README.md`

- [ ] Run `npm test` and `npm run build`.
- [ ] Inspect the diff and manually exercise a representative multi-channel VCD if available.
- [ ] Document directional VCD workflow and mapping behavior.
