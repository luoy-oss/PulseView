import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { Chart, ChartData, ChartOptions } from 'chart.js/auto';
import { CursorMarker, FreqPoint, AccelSegment } from '../types';
import {
  fmtFreq,
  fmtFreqShort,
  fmtTime,
  fmtTimeShort,
  fmtRate,
} from '../utils';
import { detectAccelSegments, computeHistogramBins, countPulsesBetween } from '../compute';
import { ThemeId, THEME_COLORS } from '../theme';

interface Props {
  allFreqPts: FreqPoint[];
  cursorA: number | null;
  cursorB: number | null;
  freqPts: FreqPoint[];
  accelSegs: AccelSegment[];
  risingEdges: Float64Array | null;
  onAccelDetect: (segs: AccelSegment[]) => void;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
  cursorMarkers?: CursorMarker[];
  activeCursorId?: string;
  onCursorMarkersChange?: (markers: CursorMarker[], activeCursorId: string) => void;
  cursorPair?: [string, string] | null;
  onCursorPairChange?: (pair: [string, string]) => void;
  theme: ThemeId;
}

export const AnalysisPanel = memo(function AnalysisPanel({
  allFreqPts,
  cursorA,
  cursorB,
  freqPts,
  accelSegs,
  risingEdges,
  onAccelDetect,
  onCursorChange,
  cursorMarkers = [],
  activeCursorId = 'cursor-1',
  onCursorMarkersChange,
  cursorPair,
  onCursorPairChange,
  theme,
}: Props) {
  const [tab, setTab] = useState<'cursor' | 'accel' | 'hist'>('cursor');

  return (
    <div className="ana-panel">
      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === 'cursor' ? 'active' : ''}`}
          onClick={() => setTab('cursor')}
        >
          光标分析
        </button>
        <button
          className={`tab-btn ${tab === 'accel' ? 'active' : ''}`}
          onClick={() => setTab('accel')}
        >
          加减速检测
        </button>
        <button
          className={`tab-btn ${tab === 'hist' ? 'active' : ''}`}
          onClick={() => setTab('hist')}
        >
          频率分布
        </button>
      </div>
      <div className="tab-content">
        {tab === 'cursor' && (
          <CursorPane
            freqPts={freqPts}
            cursorA={cursorA}
            cursorB={cursorB}
            risingEdges={risingEdges}
            onCursorChange={onCursorChange}
            cursorMarkers={cursorMarkers}
            activeCursorId={activeCursorId}
            onCursorMarkersChange={onCursorMarkersChange}
            cursorPair={cursorPair}
            onCursorPairChange={onCursorPairChange}
          />
        )}
        {tab === 'accel' && (
          <AccelPane
            allFreqPts={allFreqPts}
            accelSegs={accelSegs}
            onDetect={onAccelDetect}
          />
        )}
        {tab === 'hist' && <HistPane allFreqPts={allFreqPts} theme={theme} />}
      </div>
    </div>
  );
});

function CursorPane({
  freqPts,
  cursorA,
  cursorB,
  risingEdges,
  onCursorChange,
  cursorMarkers,
  activeCursorId,
  onCursorMarkersChange,
  cursorPair,
  onCursorPairChange,
}: {
  freqPts: FreqPoint[];
  cursorA: number | null;
  cursorB: number | null;
  risingEdges: Float64Array | null;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
  cursorMarkers: CursorMarker[];
  activeCursorId: string;
  onCursorMarkersChange?: (markers: CursorMarker[], activeCursorId: string) => void;
  cursorPair?: [string, string] | null;
  onCursorPairChange?: (pair: [string, string]) => void;
}) {
  const pair: [string, string] = cursorPair && cursorMarkers.length >= 2 ? cursorPair : ['cursor-1', 'cursor-2'];
  const pairMarkers = pair.map((id) => cursorMarkers.find((marker) => marker.id === id));
  const selectedA = pairMarkers[0]?.index ?? cursorA;
  const selectedB = pairMarkers[1]?.index ?? cursorB;
  const a = selectedA !== null && selectedA !== undefined ? freqPts[selectedA] : null;
  const b = selectedB !== null && selectedB !== undefined ? freqPts[selectedB] : null;
  const pulseCount =
    a && b && risingEdges ? countPulsesBetween(risingEdges, a.time, b.time) : null;

  return (
    <div>
      <div className="cursor-marker-list">
        {(cursorMarkers.length ? cursorMarkers : [
          { id: 'cursor-1', label: 'A', index: cursorA, color: 'var(--teal)' },
          { id: 'cursor-2', label: 'B', index: cursorB, color: 'var(--green)' },
        ]).map((marker) => (
          <label key={marker.id} className="cursor-marker-control">
            <input type="radio" name="active-cursor" checked={marker.id === activeCursorId} onChange={() => onCursorMarkersChange?.(cursorMarkers, marker.id)} />
            {marker.label}
            <input
              type="number"
              min={0}
              max={Math.max(0, freqPts.length - 1)}
              placeholder="点索引"
              value={marker.index ?? ''}
              onChange={(e) => {
                const value = e.target.value === '' ? null : Number(e.target.value);
                const index = value === null || !Number.isFinite(value)
                  ? null
                  : Math.max(0, Math.min(freqPts.length - 1, Math.trunc(value)));
                onCursorMarkersChange?.(
                  cursorMarkers.map((item) => item.id === marker.id ? { ...item, index } : item),
                  activeCursorId
                );
              }}
            />
            {cursorMarkers.length > 2 && <button type="button" className="btn btn-sm" onClick={() => onCursorMarkersChange?.(cursorMarkers.filter((item) => item.id !== marker.id), activeCursorId === marker.id ? (cursorMarkers.find((item) => item.id !== marker.id)?.id || '') : activeCursorId)}>删除</button>}
          </label>
        ))}
        {onCursorMarkersChange && cursorMarkers.length < 6 && <button type="button" className="btn btn-sm" onClick={() => { const n = cursorMarkers.length + 1; onCursorMarkersChange([...cursorMarkers, { id: `cursor-${Date.now()}`, label: `C${n}`, index: null, color: ['var(--teal)', 'var(--green)', 'var(--rose)', 'var(--accent)', '#8ab4f8', '#d7a7ff'][n - 1] }], activeCursorId); }}>新增游标</button>}
      </div>
      {cursorMarkers.length > 2 && onCursorPairChange && (
        <div className="cursor-pair-control">
          <span className="label">统计区间</span>
          <select value={pair[0]} onChange={(e) => onCursorPairChange([e.target.value, pair[1]])}>
            {cursorMarkers.map((marker) => <option key={marker.id} value={marker.id}>{marker.label}</option>)}
          </select>
          <span>至</span>
          <select value={pair[1]} onChange={(e) => onCursorPairChange([pair[0], e.target.value])}>
            {cursorMarkers.map((marker) => <option key={marker.id} value={marker.id}>{marker.label}</option>)}
          </select>
        </div>
      )}
      <div className="cursor-row">
        <div className="cursor-card">
          <span className="cursor-tag a">A</span>
          <span className="cursor-val" id="c-a">
            {a ? (
              <>
                <span className="label">t=</span>
                {fmtTime(a.time)} &nbsp;<span className="label">f=</span>
                {fmtFreq(a.freq)}
              </>
            ) : (
              '未设置'
            )}
          </span>
        </div>
        <div className="cursor-card">
          <span className="cursor-tag b">B</span>
          <span className="cursor-val">
            {b ? (
              <>
                <span className="label">t=</span>
                {fmtTime(b.time)} &nbsp;<span className="label">f=</span>
                {fmtFreq(b.freq)}
              </>
            ) : (
              '未设置'
            )}
          </span>
        </div>
        <div className="cursor-card res">
          <span className="cursor-tag r">Δ</span>
          <span className="cursor-val">
            {a && b ? (
              <>
                <span className="label">Δt=</span>
                {fmtTime(b.time - a.time)} &nbsp;
                <span className="label">Δf=</span>
                {fmtFreq(Math.abs(b.freq - a.freq))} &nbsp;
                <span className="label">脉冲数=</span>
                {pulseCount !== null ? pulseCount.toLocaleString() : '—'} &nbsp;
                <span className="label">变化率=</span>
                {fmtRate(
                  b.time - a.time !== 0
                    ? (b.freq - a.freq) / (b.time - a.time)
                    : 0
                )}{' '}
                &nbsp;
                <span
                  style={{
                    color: b.freq - a.freq >= 0 ? 'var(--green)' : 'var(--rose)',
                  }}
                >
                  {b.freq - a.freq >= 0 ? '↑ 加速' : '↓ 减速'}
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
      </div>
      <p className="hint">
        单击放置光标 A · Ctrl+单击放置光标 B · 拖拽平移 · 滚轮缩放
      </p>
    </div>
  );
}

function AccelPane({
  allFreqPts,
  accelSegs,
  onDetect,
}: {
  allFreqPts: FreqPoint[];
  accelSegs: AccelSegment[];
  onDetect: (segs: AccelSegment[]) => void;
}) {
  const handleDetect = useCallback(() => {
    const segs = detectAccelSegments(allFreqPts);
    onDetect(segs);
  }, [allFreqPts, onDetect]);

  return (
    <div>
      <div className="accel-ctrls">
        <button className="btn btn-p btn-sm" onClick={handleDetect}>
          检测
        </button>
        <span className="accel-hint">自动识别加速 / 减速 / 匀速区间</span>
      </div>
      <div className="accel-wrap">
        <table className="accel-tbl">
          <thead>
            <tr>
              <th>类型</th>
              <th>起始时间</th>
              <th>结束时间</th>
              <th>持续</th>
              <th>起始频率</th>
              <th>结束频率</th>
              <th>变化率</th>
            </tr>
          </thead>
          <tbody>
            {accelSegs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{ color: 'var(--text-3)', textAlign: 'center', padding: 20 }}
                >
                  未检测到分段（点击"检测"自动分析加速/减速/匀速区间）
                </td>
              </tr>
            ) : (
              accelSegs.map((s, i) => (
                <tr key={i}>
                  <td
                    className={
                      s.type === 'accel'
                        ? 'type-accel'
                        : s.type === 'decel'
                          ? 'type-decel'
                          : 'type-const'
                    }
                  >
                    {s.type === 'accel'
                      ? '↑ 加速'
                      : s.type === 'decel'
                        ? '↓ 减速'
                        : '→ 匀速'}
                  </td>
                  <td>{fmtTimeShort(s.startTime)}</td>
                  <td>{fmtTimeShort(s.endTime)}</td>
                  <td>{fmtTimeShort(s.duration)}</td>
                  <td>{fmtFreq(s.startFreq)}</td>
                  <td>{fmtFreq(s.endFreq)}</td>
                  <td>{fmtRate(s.rate)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistPane({ allFreqPts, theme }: { allFreqPts: FreqPoint[]; theme: ThemeId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || allFreqPts.length === 0) return;

    const freqs = allFreqPts.map((p) => p.freq);
    const result = computeHistogramBins(freqs);
    if (!result) return;
    const colors = THEME_COLORS[theme];

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: result.labels,
        datasets: [
          {
            data: result.bins,
            backgroundColor: `${colors.accent}40`,
            borderColor: `${colors.accent}80`,
            borderWidth: 1,
            borderRadius: 2,
            barPercentage: 1.0,
            categoryPercentage: 1.0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            ticks: {
              color: colors.text3,
              font: { family: 'Source Code Pro', size: 9 },
              maxRotation: 90,
              autoSkip: true,
              maxTicksLimit: 20,
            },
            grid: { display: false },
            border: { color: `${colors.border}cc` },
          },
          y: {
            ticks: {
              color: colors.text3,
              font: { family: 'Source Code Pro', size: 10 },
            },
            grid: { color: `${colors.border}80` },
            border: { color: `${colors.border}cc` },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.tooltip,
            titleColor: colors.tooltipTitle,
            bodyColor: colors.tooltipBody,
            borderColor: `${colors.accent}26`,
            borderWidth: 1,
            cornerRadius: 8,
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [allFreqPts, theme]);

  return (
    <div className="hist-wrap">
      <canvas ref={canvasRef} />
    </div>
  );
}
