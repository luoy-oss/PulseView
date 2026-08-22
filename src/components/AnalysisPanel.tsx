import { useState, useCallback, useRef, useEffect } from 'react';
import { Chart, ChartData, ChartOptions } from 'chart.js/auto';
import { FreqPoint, AccelSegment } from '../types';
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
  theme: ThemeId;
}

export function AnalysisPanel({
  allFreqPts,
  cursorA,
  cursorB,
  freqPts,
  accelSegs,
  risingEdges,
  onAccelDetect,
  onCursorChange,
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
}

function CursorPane({
  freqPts,
  cursorA,
  cursorB,
  risingEdges,
  onCursorChange,
}: {
  freqPts: FreqPoint[];
  cursorA: number | null;
  cursorB: number | null;
  risingEdges: Float64Array | null;
  onCursorChange: (which: 'A' | 'B', idx: number | null) => void;
}) {
  const a = cursorA !== null ? freqPts[cursorA] : null;
  const b = cursorB !== null ? freqPts[cursorB] : null;
  const pulseCount =
    a && b && risingEdges ? countPulsesBetween(risingEdges, a.time, b.time) : null;

  return (
    <div>
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
            titleColor: colors.text,
            bodyColor: colors.text2,
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
