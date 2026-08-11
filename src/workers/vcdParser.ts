/// <reference lib="webworker" />

self.onmessage = function (e: MessageEvent) {
  if (e.data.type !== 'parse') return;
  const buf: ArrayBuffer = e.data.buffer;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
  const lines = text.split(/\r?\n/);

  let timescaleNs = 1;
  let commentSampleRate: number | null = null;
  let varId: string | null = null;
  const mult: Record<string, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };

  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];

    const tsMatch = line.match(/\$timescale\s+([0-9.]+)\s*(ns|us|ms|s)\s*\$end/i);
    if (tsMatch) {
      const v = parseFloat(tsMatch[1]);
      const u = tsMatch[2].toLowerCase();
      timescaleNs = v * ({ ns: 1, us: 1000, ms: 1e6, s: 1e9 }[u] || 1);
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
        prevLevel = lvl;
      }
    }
  }

  let samplingRate = commentSampleRate;
  if (!samplingRate) {
    const allTimes = [...risingArr, ...fallingArr].sort((a, b) => a - b);
    if (allTimes.length > 1) {
      let minDt = Infinity;
      for (let g = 1; g < Math.min(allTimes.length, 1000); g++) {
        const dt = allTimes[g] - allTimes[g - 1];
        if (dt > 0 && dt < minDt) minDt = dt;
      }
      if (minDt < Infinity) samplingRate = 1 / (minDt * 2);
    }
  }
  if (!samplingRate) samplingRate = 24e6;

  const re = new Float64Array(risingArr);
  const fe = new Float64Array(fallingArr);

  (self as unknown as Worker).postMessage(
    {
      type: 'done',
      samplingRate,
      sampleCount,
      risingEdges: re,
      fallingEdges: fe,
      format: 'vcd',
    },
    [re.buffer, fe.buffer]
  );
};
