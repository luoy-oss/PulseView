import { AbAnalysis, AbChannel, AbFreqPoint } from './types';

const FORWARD = new Set(['0>1', '1>3', '3>2', '2>0']);
const REVERSE = new Set(['0>2', '2>3', '3>1', '1>0']);

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function getEdges(channel: AbChannel): { time: number; level: number }[] {
  const edges: { time: number; level: number }[] = [];
  for (let i = 1; i < channel.transitions.length; i++) {
    edges.push({ time: channel.transitions[i], level: channel.levels[i] });
  }
  return edges;
}

export function computeAbAnalysis(a: AbChannel, b: AbChannel): AbAnalysis {
  const aEdges = getEdges(a);
  const bEdges = getEdges(b);
  const changes = [
    ...Array.from(a.transitions, (time, index) => ({
      time,
      channel: 0 as const,
      level: a.levels[index],
    })),
    ...Array.from(b.transitions, (time, index) => ({
      time,
      channel: 1 as const,
      level: b.levels[index],
    })),
  ].sort((left, right) => left.time - right.time);

  let state = 0;
  let knownMask = 0;
  let cycleStart = 0;
  let cycleSteps = 0;
  let cycleDirection = 0;
  let forwardCycles = 0;
  let reverseCycles = 0;
  let invalidTransitions = 0;
  const freqPoints: AbFreqPoint[] = [];

  for (let index = 0; index < changes.length;) {
    const time = changes[index].time;
    let nextState = state;
    let groupMask = 0;
    while (index < changes.length && changes[index].time === time) {
      const change = changes[index];
      if (change.channel === 0) {
        nextState = (nextState & 1) | (change.level << 1);
        groupMask |= 2;
      } else {
        nextState = (nextState & 2) | change.level;
        groupMask |= 1;
      }
      index++;
    }

    const wasFullyKnown = knownMask === 3;
    knownMask |= groupMask;
    if (!wasFullyKnown) {
      state = nextState;
      continue;
    }

    const transition = `${state}>${nextState}`;
    const direction = FORWARD.has(transition) ? 1 : REVERSE.has(transition) ? -1 : 0;
    if (direction === 0) {
      if (nextState !== state) invalidTransitions++;
      cycleSteps = 0;
      cycleDirection = 0;
      cycleStart = time;
    } else if (cycleDirection !== direction) {
      cycleDirection = direction;
      cycleSteps = 1;
      cycleStart = time;
    } else {
      cycleSteps++;
    }

    if (cycleSteps >= 4) {
      const period = time - cycleStart;
      if (period > 0) {
        freqPoints.push({
          time: (cycleStart + time) / 2,
          freq: direction / period,
          direction: direction > 0 ? 'forward' : 'reverse',
        });
        if (direction > 0) forwardCycles++;
        else reverseCycles++;
      }
      cycleSteps = 0;
      cycleStart = time;
    }
    state = nextState;
  }

  const phases: number[] = [];
  for (const edge of aEdges) {
    let nearest: { time: number; level: number } | null = null;
    for (const candidate of bEdges) {
      if (candidate.level !== edge.level) continue;
      if (!nearest || Math.abs(candidate.time - edge.time) < Math.abs(nearest.time - edge.time)) {
        nearest = candidate;
      }
    }
    if (nearest) phases.push(nearest.time - edge.time);
  }

  const bRises = bEdges.filter((edge) => edge.level === 1).map((edge) => edge.time);
  const periods: number[] = [];
  for (let index = 1; index < bRises.length; index++) {
    periods.push(bRises[index] - bRises[index - 1]);
  }
  const meanPhase = mean(phases);
  const phaseStd = phases.length > 1
    ? Math.sqrt(mean(phases.map((phase) => (phase - meanPhase) ** 2)))
    : 0;

  return {
    freqPoints,
    aPulses: aEdges.filter((edge) => edge.level === 1).length,
    bPulses: bRises.length,
    aEdges: aEdges.length,
    bEdges: bEdges.length,
    cycles: forwardCycles + reverseCycles,
    forwardCycles,
    reverseCycles,
    invalidTransitions,
    meanPeriod: mean(periods),
    meanPhase,
    phaseStd,
    phaseLead: Math.abs(meanPhase) < (phaseStd || 1e-15)
      ? '无明显超前'
      : meanPhase > 0 ? 'A 超前 B' : 'B 超前 A',
  };
}
