/// <reference lib="webworker" />

self.onmessage = function (e: MessageEvent) {
  if (e.data.type !== 'parse') return;
  const buf: ArrayBuffer = e.data.buffer;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
  const lines = text.split(/\r?\n/);

  if (e.data.mode === 'ab' || e.data.mode === 'direction') {
    const channelDefs: { id: string; name: string }[] = [];
    let timescaleNsAb = 1;
    let headerEnd = 0;
    for (; headerEnd < lines.length; headerEnd++) {
      const line = lines[headerEnd];
      const ts = line.match(/\$timescale\s+([0-9.]+)\s*(ps|ns|us|ms|s)\s*\$end/i);
      if (ts) {
        timescaleNsAb = parseFloat(ts[1]) * ({ ps: 0.001, ns: 1, us: 1000, ms: 1e6, s: 1e9 }[ts[2].toLowerCase()] || 1);
      }
      const vm = line.match(/^\s*\$var\s+(?:wire|reg)\s+1\s+(\S+)\s+(.+?)\s+\$end\s*$/);
      if (vm) channelDefs.push({ id: vm[1], name: vm[2].trim() });
      if (line.includes('$enddefinitions')) { headerEnd++; break; }
    }
    if (channelDefs.length < 2) {
      (self as unknown as Worker).postMessage({ type: 'error', message: 'AB 相模式至少需要两个单比特 $var 通道。' });
      return;
    }
    const times = new Map<string, number[]>();
    const levels = new Map<string, number[]>();
    for (const ch of channelDefs) { times.set(ch.id, []); levels.set(ch.id, []); }
    let sampleCountAb = 0;
    let maxTime = 0;
    let currentTime = 0;
    for (let k = headerEnd; k < lines.length; k++) {
      const line = lines[k].trim();
      const timeMatch = line.match(/^#(\d+)\s*(.*)$/);
      const valueText = timeMatch ? timeMatch[2] : line;
      if (timeMatch) currentTime = parseFloat(timeMatch[1]);
      if (!timeMatch && !/^[01xXzZ]/.test(valueText)) continue;
      const t = currentTime * timescaleNsAb * 1e-9;
      for (const change of valueText.matchAll(/([01xXzZ])\s*(\S+)/g)) {
        const id = change[2];
        if (!times.has(id)) continue;
        if (!/^[01]$/.test(change[1])) continue;
        const level = change[1] === '1' ? 1 : 0;
        const ta = times.get(id)!;
        const la = levels.get(id)!;
        if (la.length === 0 || la[la.length - 1] !== level) {
          ta.push(t);
          la.push(level);
        }
        sampleCountAb++;
      }
      maxTime = Math.max(maxTime, t);
    }
    let samplingRateAb = 0;
    const allTransitions = channelDefs.flatMap((ch) => times.get(ch.id)!);
    allTransitions.sort((a, b) => a - b);
    for (let k = 1; k < Math.min(allTransitions.length, 1000); k++) {
      const dt = allTransitions[k] - allTransitions[k - 1];
      if (dt > 0 && (!samplingRateAb || dt < 1 / samplingRateAb)) samplingRateAb = 1 / dt;
    }
    if (!samplingRateAb) samplingRateAb = 24e6;
    const channels = channelDefs.map((ch) => ({
      id: ch.id,
      name: ch.name,
      transitions: new Float64Array(times.get(ch.id)!),
      levels: new Int8Array(levels.get(ch.id)!),
    }));
    (self as unknown as Worker).postMessage({ type: 'done-ab', samplingRate: samplingRateAb, sampleCount: sampleCountAb, duration: maxTime, channels, format: 'vcd' });
    return;
  }

  let timescaleNs = 1;
  let commentSampleRate: number | null = null;
  let varId: string | null = null;
  const mult: Record<string, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };

  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];

    const tsMatch = line.match(/\$timescale\s+([0-9.]+)\s*(ps|ns|us|ms|s)\s*\$end/i);
    if (tsMatch) {
      const v = parseFloat(tsMatch[1]);
      const u = tsMatch[2].toLowerCase();
      timescaleNs = v * ({ ps: 0.001, ns: 1, us: 1000, ms: 1e6, s: 1e9 }[u] || 1);
    }

    const rateMatch = line.match(
      /Acquisition\s+with\s+\d+\/\d+\s+channels\s+at\s+([0-9.]+)\s*(Hz|kHz|MHz|GHz)/i
    );
    if (rateMatch) {
      commentSampleRate =
        parseFloat(rateMatch[1]) * (mult[rateMatch[2].toLowerCase()] || 1);
    }

    if (line.indexOf('$var') !== -1 && line.indexOf('D0') !== -1) {
      const parts = line.split(/\s+/);
      for (let j = 1; j < parts.length; j++) {
        if (parts[j] === 'wire' || parts[j] === 'reg') {
          if (j + 2 < parts.length) {
            varId = parts[j + 2];
          }
          break;
        }
      }
    }

    if (line.indexOf('$enddefinitions') !== -1) {
      i++;
      break;
    }
  }

  if (!varId) varId = '!';

  const tsScaleSec = timescaleNs * 1e-9;
  let prevLevel: number | null = null;
  const risingArr: number[] = [];
  const fallingArr: number[] = [];
  // 所有跳变，按时间顺序排列
  const transTimesArr: number[] = [];
  const transLevelsArr: number[] = [];
  let sampleCount = 0;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.charAt(0) !== '#') continue;

    const dm = line.match(/^#(\d+)\s+([01xXzZ])\s*([a-zA-Z0-9]*)\s*$/);
    if (!dm) continue;

    const id = dm[3];
    if (id !== varId) continue;

    const timestampTicks = parseFloat(dm[1]);
    const timeSec = timestampTicks * tsScaleSec;
    const level = dm[2] === '1' ? 1 : 0;
    sampleCount++;

    if (prevLevel === null || level !== prevLevel) {
      if (level === 1) {
        risingArr.push(timeSec);
      } else {
        fallingArr.push(timeSec);
      }
      transTimesArr.push(timeSec);
      transLevelsArr.push(level);
      prevLevel = level;
    }
  }

  // Fallback parsing
  if (risingArr.length === 0 && fallingArr.length === 0) {
    prevLevel = null;
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k].trim();
      const am = line.match(/#(\d+)\s+([01])\s*!/);
      if (!am) continue;
      const ts = parseFloat(am[1]) * tsScaleSec;
      const lvl = parseInt(am[2]);
      sampleCount++;
      if (prevLevel === null || lvl !== prevLevel) {
        if (lvl === 1) risingArr.push(ts);
        else fallingArr.push(ts);
        transTimesArr.push(ts);
        transLevelsArr.push(lvl);
        prevLevel = lvl;
      }
    }
  }

  let samplingRate = commentSampleRate;
  if (!samplingRate) {
    if (transTimesArr.length > 1) {
      let minDt = Infinity;
      for (let g = 1; g < Math.min(transTimesArr.length, 1000); g++) {
        const dt = transTimesArr[g] - transTimesArr[g - 1];
        if (dt > 0 && dt < minDt) minDt = dt;
      }
      if (minDt < Infinity) samplingRate = 1 / (minDt * 2);
    }
  }
  if (!samplingRate) samplingRate = 24e6;

  const re = new Float64Array(risingArr);
  const fe = new Float64Array(fallingArr);
  const tt = new Float64Array(transTimesArr);
  const tl = new Int8Array(transLevelsArr);

  (self as unknown as Worker).postMessage(
    {
      type: 'done',
      samplingRate,
      sampleCount,
      risingEdges: re,
      fallingEdges: fe,
      transTimes: tt,
      transLevels: tl,
      format: 'vcd',
    },
    [re.buffer, fe.buffer, tt.buffer, tl.buffer]
  );
};
