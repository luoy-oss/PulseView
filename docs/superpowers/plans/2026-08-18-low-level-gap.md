# 低电平间隔测试功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在频率分析页面新增严格基于 50% 占空比的低电平间隔测试测量。

**Architecture:** 扩展现有 `FreqMode`，在 `computeFreqFromTransitions` 内基于当前高脉宽与相邻下降沿间隔计算 `gap = period - 2 * width`。图表依据模式切换纵轴、提示和 CSV 表头；现有频率模式的行为保持不变。

**Tech Stack:** React 18、TypeScript、Chart.js、Vite。

---

### Task 1: 定义并验证推导计算

**Files:**
- Modify: `src/types.ts`
- Modify: `src/compute.ts`
- Test: `src/compute.test.ts`

- [ ] **Step 1: 写入失败测试**

```ts
assert.deepEqual(
  computeFreqFromTransitions(times, levels, 'vcd', 'low-gap').map((point) => point.freq),
  [0, 0.002]
);
```

- [ ] **Step 2: 实现最小计算**

```ts
const rawGap = fallingPeriod - 2 * pulseWidth;
const gap = toleranceEnabled && Math.abs(dutyCycle - 0.5) <= tolerance ? 0 : rawGap;
pts.push({ time: (previousFall + currentFall) / 2, freq: gap, period: fallingPeriod, dutyCycle });
```

- [ ] **Step 3: 验证**

Run: `node --experimental-strip-types src/compute.test.ts`
Expected: 所有 50% 连续、额外间隔、非 50% 保留和容差归零断言通过。

### Task 2: 接入页面、导出和文档

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/FreqChart.tsx`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 增加测试模式按钮与受限说明**

```tsx
<button title="测试功能：仅限稳定 50% 占空比..." onClick={() => onFreqModeChange('low-gap')}>
  低电平间隔（测试）
</button>
```

- [ ] **Step 2: 按模式调整图表与导出语义**

```ts
const isLowGap = freqMode === 'low-gap';
const csvHeader = isLowGap ? 'time_s,low_level_gap_s\n' : 'time_s,frequency_hz\n';
```

- [ ] **Step 3: 升级版本与构建**

Run: `npm version 2.4.0 --no-git-tag-version` and `npm run build`
Expected: 版本文件均为 `2.4.0`，构建成功。

### Task 3: 审查与提交

**Files:**
- Modify: 仅本功能相关文件

- [ ] **Step 1: 审查变更和工作区状态**

Run: `git diff --check; git diff -- src/compute.ts src/types.ts src/App.tsx src/components/Header.tsx src/components/FreqChart.tsx README.md package.json package-lock.json`
Expected: 无空白错误，变更仅包含该功能、规格与计划。

- [ ] **Step 2: 提交**

```bash
git add README.md package.json package-lock.json src docs
git commit -m "feat: add low-level gap test measurement"
```
