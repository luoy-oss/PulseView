import { AbAnalysis, AbChannel } from './types';

export function computeAbAnalysis(a: AbChannel, b: AbChannel): AbAnalysis {
  const events: { time: number; channel: 0 | 1; level: number }[] = [];
  for (let i = 1; i < a.transitions.length; i++) events.push({ time: a.transitions[i], channel: 0, level: a.levels[i] });
  for (let i = 1; i < b.transitions.length; i++) events.push({ time: b.transitions[i], channel: 1, level: b.levels[i] });
  events.sort((x, y) => x.time - y.time);
  let state = ((a.levels[0] || 0) << 1) | (b.levels[0] || 0);
  let forwardCycles = 0;
  let reverseCycles = 0;
  let invalidTransitions = 0;
  const periods: number[] = [];
  const aEdges: { time: number; level: number }[] = [];
  const bEdges: { time: number; level: number }[] = [];
  for (const event of events) {
    (event.channel === 0 ? aEdges : bEdges).push({ time: event.time, level: event.level });
  }
  const forwardTransitions = new Set(['0>1', '1>3', '3>2', '2>0']);
  const reverseTransitions = new Set(['0>2', '2>3', '3>1', '1>0']);
  for (const event of events) {
    const nextState = event.channel === 0 ? ((event.level << 1) | (state & 1)) : ((state & 2) | event.level);
    const transition = `${state}>${nextState}`;
    if (forwardTransitions.has(transition)) forwardCycles += nextState === 0 ? 1 : 0;
    else if (reverseTransitions.has(transition)) reverseCycles += nextState === 0 ? 1 : 0;
    else if (nextState !== state) invalidTransitions++;
    state = nextState;
  }
  const phases: number[] = [];
  for (const edge of aEdges) {
    let nearest: { time: number; level: number } | null = null;
    for (const candidate of bEdges) {
      if (candidate.level !== edge.level) continue;
      if (!nearest || Math.abs(candidate.time - edge.time) < Math.abs(nearest.time - edge.time)) nearest = candidate;
    }
    if (nearest) phases.push(nearest.time - edge.time);
  }
  const bRises = bEdges.filter((edge) => edge.level === 1).map((edge) => edge.time);
  for (let i = 1; i < bRises.length; i++) periods.push(bRises[i] - bRises[i - 1]);
  const mean = (values: number[]) => values.length ? values.reduce((x, y) => x + y, 0) / values.length : 0;
  const meanPhase = mean(phases);
  const phaseStd = phases.length > 1 ? Math.sqrt(mean(phases.map((p) => (p - meanPhase) ** 2))) : 0;
  const quarter = phases.length ? mean(phases.map((p) => Math.abs(p))) : 0;
  const cycles = forwardCycles + reverseCycles;
  return {
    aEdges: Math.max(0, a.transitions.length - 1),
    bEdges: Math.max(0, b.transitions.length - 1),
    cycles,
    forwardCycles,
    reverseCycles,
    invalidTransitions,
    meanPeriod: periods.length ? mean(periods) : quarter * 4,
    meanPhase,
    phaseStd,
    phaseLead: Math.abs(meanPhase) < (phaseStd || 1e-15) ? '无明显超前' : meanPhase > 0 ? 'A 超前 B' : 'B 超前 A',
  };
}
