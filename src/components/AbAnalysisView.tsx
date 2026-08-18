import { useMemo, useState } from 'react';
import { AbChannel, AbFreqPoint } from '../types';
import { computeAbAnalysis } from '../computeAb';
import { fmtFreq, fmtTime } from '../utils';

interface Props { channels: AbChannel[]; fileName: string; samplingRate: number; onFile: (file: File, mode?: 'normal' | 'ab') => void; }

export function AbAnalysisView({ channels, fileName, samplingRate, onFile }: Props) {
  const [aId, setAId] = useState(channels[0]?.id || '');
  const [bId, setBId] = useState(channels[1]?.id || '');
  const a = channels.find((c) => c.id === aId) || channels[0];
  const b = channels.find((c) => c.id === bId) || channels[1];
  const result = useMemo(() => a && b ? computeAbAnalysis(a, b) : null, [a, b]);
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.vcd';
  input.onchange = () => { const f = input.files?.[0]; if (f) onFile(f, 'ab'); };
  return <div className="ab-root">
    <header className="app-header"><div className="header-l"><div className="logo-mark">⚡</div><span className="title">PulseView · AB 相分析</span><span className="fname">{fileName}</span></div><div className="header-r"><button className="btn" onClick={() => input.click()}>打开 AB 文件</button><button className="btn" onClick={() => window.location.reload()}>返回</button></div></header>
    <main className="ab-main">
      <section className="ab-toolbar"><div><span className="ctrl-label">A 相通道</span><select value={aId} onChange={(e) => { const nextA = e.target.value; setAId(nextA); if (nextA === bId) setBId(channels.find((c) => c.id !== nextA)?.id || ''); }}>{channels.map((c) => <option key={c.id} value={c.id}>{c.name} [{c.id}]</option>)}</select></div><div><span className="ctrl-label">B 相通道</span><select value={bId} onChange={(e) => setBId(e.target.value)}>{channels.map((c) => <option key={c.id} value={c.id} disabled={c.id === aId}>{c.name} [{c.id}]</option>)}</select></div><span className="ab-note">请按实际接线指定 A/B；00 → 01 → 11 → 10 为正向</span></section>
      {a && b && result && <>
        <section className="ab-wave"><Wave channel={a} label="A" color="var(--teal)" /><Wave channel={b} label="B" color="var(--green)" /></section>
        <section className="ab-grid"><Metric label="A 脉冲数" value={result.aPulses.toLocaleString()} cls="teal" /><Metric label="B 脉冲数" value={result.bPulses.toLocaleString()} cls="green" /><Metric label="A 边沿数" value={result.aEdges.toLocaleString()} /><Metric label="B 边沿数" value={result.bEdges.toLocaleString()} /><Metric label="正向周期" value={result.forwardCycles.toLocaleString()} cls="green" /><Metric label="反向周期" value={result.reverseCycles.toLocaleString()} cls="rose" /><Metric label="平均周期" value={fmtTime(result.meanPeriod)} /><Metric label="平均相位差" value={fmtTime(result.meanPhase)} cls="teal" /><Metric label="相位标准差" value={fmtTime(result.phaseStd)} /><Metric label="非法跳变" value={result.invalidTransitions.toLocaleString()} cls={result.invalidTransitions ? 'rose' : 'green'} /></section>
        <section className="ab-frequency"><div className="ab-section-title">带符号频率 - 时间</div><SignedFrequencyChart points={result.freqPoints} /></section>
        <div className="ab-foot">采样频率 {fmtFreq(samplingRate)} · A/B 可在上方重新指定，所有统计会即时更新</div>
      </>}
    </main>
  </div>;
}

function Metric({ label, value, cls }: { label: string; value: string; cls?: string }) { return <div className="ab-metric"><span>{label}</span><strong className={cls}>{value}</strong></div>; }
function SignedFrequencyChart({ points }: { points: AbFreqPoint[] }) {
  if (points.length === 0) return <div className="ab-chart-empty">未形成完整 AB 周期</div>;
  const minTime = points[0].time;
  const maxTime = points[points.length - 1].time || minTime + 1;
  const maxAbs = Math.max(...points.map((point) => Math.abs(point.freq)), 1);
  const step = Math.max(1, Math.ceil(points.length / 1500));
  const segments: { direction: 'forward' | 'reverse'; points: string[] }[] = [];
  for (let i = 0; i < points.length; i += step) {
    const point = points[i];
    const x = 4 + ((point.time - minTime) / Math.max(maxTime - minTime, 1e-15)) * 92;
    const y = 50 - (point.freq / maxAbs) * 42;
    const direction = point.freq >= 0 ? 'forward' : 'reverse';
    const previous = segments[segments.length - 1];
    if (!previous || previous.direction !== direction) segments.push({ direction, points: [] });
    segments[segments.length - 1].points.push(`${x},${y}`);
  }
  return <div className="ab-chart-wrap"><div className="ab-chart-label positive">+ 正向</div><div className="ab-chart-label negative">- 反向</div><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="4" y1="50" x2="96" y2="50" stroke="var(--border)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />{segments.map((segment, index) => <polyline key={index} points={segment.points.join(' ')} fill="none" stroke={segment.direction === 'forward' ? 'var(--green)' : 'var(--rose)'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}</svg></div>;
}
function Wave({ channel, label, color }: { channel: AbChannel; label: string; color: string }) {
  const max = channel.transitions[channel.transitions.length - 1] || 1;
  const points: string[] = [];
  for (let i = 0; i < channel.transitions.length; i++) {
    const x = (channel.transitions[i] / max) * 100;
    const y = channel.levels[i] ? 12 : 52;
    if (i > 0) points.push(`${x},${channel.levels[i - 1] ? 12 : 52}`);
    points.push(`${x},${y}`);
  }
  return <div className="ab-wave-row"><b style={{ color }}>{label} · {channel.name}</b><svg viewBox="0 0 100 64" preserveAspectRatio="none"><polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></svg></div>;
}
