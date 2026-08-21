# Pulse Level and Default State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users independently choose the active pulse level and the idle default level, while measuring unobservable boundary pulses at 50% duty.

**Architecture:** Preserve physical transition times and levels after parsing. Translate the selected pulse level into the existing logical-high representation only for analysis, then determine whether the first or last logical-high pulse touches the selected default state and assign it a synthetic 50%-duty period. The UI exposes pulse level, default state, and edge timing as separate compact controls.

**Tech Stack:** React 18, TypeScript, Vite, Node test runner.

---

### Task 1: Boundary-aware waveform analysis

**Files:**
- Modify: `src/types.ts`
- Modify: `src/compute.ts`
- Modify: `tests/compute.test.mjs`

- [ ] Add `PulseLevel = 'high' | 'low'`, add `DefaultLevel = 0 | 1`, and replace `logicPolarity` in `AppState` with `pulseLevel` and `defaultLevel`.
- [ ] Update `computeFreqFromTransitions` to accept a default-level argument and detect a final high pulse that ends at the default level without a following pulse; return it using `period = 2 * width` and `dutyCycle = 0.5`.
- [ ] Retain existing first complete high-pulse 50% handling; use real same-direction edge intervals for complete interior pulses.
- [ ] Write failing assertions using the `lyb.vcd` terminal shape: physical levels `[1,0,1,0,1]`, analyzed as low pulses with default high; assert the last low pulse is a 50% frequency point rather than a prior-edge-period point.
- [ ] Run `npm test`, then implement the minimal computation changes and rerun `npm test`.

### Task 2: State flow and understandable controls

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/types.ts`

- [ ] Preserve parsed levels as the current analysis level sequence and automatically set `defaultLevel` from its first level on each file load.
- [ ] Replace the polarity handler with pulse-level and default-level handlers. Low-level pulses invert the level sequence for analysis; changing either setting regenerates edge arrays, pulse count, points, markers, and clears cursor/range/segment state.
- [ ] Replace `正逻辑 / 反向逻辑` with `高电平脉冲 / 低电平脉冲`; replace `上升沿周期 / 下降沿周期` with `按上升沿 / 按下降沿`; add `默认低电平 / 默认高电平` controls.
- [ ] Disable all interpretation controls for PWM measurement pass-through data.

### Task 3: Version, integration verification, and delivery

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/compute.test.mjs`

- [ ] Set package version to `3.1.0` and document the two waveform interpretation controls and boundary-pulse behavior.
- [ ] Verify `lyb.vcd` through the parser and computation path: low pulse/default high/falling mode produces a final 50%-duty point near 9,999 Hz.
- [ ] Run `npm test`, `npm run build`, `git diff --check`, and a final worktree review.
- [ ] Commit with `feat: add pulse level boundary controls`.
- [ ] Fetch remote state, safely rebase or merge only if required, and push the completed branch when it is safe to do so.
