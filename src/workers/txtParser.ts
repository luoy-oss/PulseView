/// <reference lib="webworker" />

self.onmessage = function (e: MessageEvent) {
  if (e.data.type !== 'parse') return;
  const buf: ArrayBuffer = e.data.buffer;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));

  const ratePat =
    /Acquisition\s+with\s+\d+\/\d+\s+channels\s+at\s+([0-9]+(?:\.[0-9]+)?)\s*([kMGT]?Hz)/i;
  const mult: Record<string, number> = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9, thz: 1e12 };
  let samplingRate: number | null = null;
  let sampleCount = 0;
  let prevLevel: number | null = null;
  const risingArr: number[] = [];
  const fallingArr: number[] = [];
  let lineStart = 0;
  let lastReport = 0;

  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== '\n' && text[i] !== '\r') continue;
    const line = text.substring(lineStart, i).trim();
    lineStart = i + 1;
    if (!line) continue;

    if (samplingRate === null) {
      const m = line.match(ratePat);
      if (m) samplingRate = parseFloat(m[1]) * (mult[m[2].toLowerCase()] || 1);
    }

    if (line.substring(0, 3) !== 'D0:') continue;
    const payload = line.substring(3);
    for (let j = 0; j < payload.length; j++) {
      const ch = payload[j];
      if (ch === '"' || ch === '1') {
        if (prevLevel === 0) risingArr.push(sampleCount);
        prevLevel = 1;
      } else if (ch === '.' || ch === '0') {
        if (prevLevel === 1) fallingArr.push(sampleCount);
        prevLevel = 0;
      } else if (ch === '/') {
        if (prevLevel === 0) risingArr.push(sampleCount);
        prevLevel = 1;
      } else if (ch === '\\') {
        if (prevLevel === 1) fallingArr.push(sampleCount);
        prevLevel = 0;
      } else {
        continue;
      }
      sampleCount++;
    }

    if (sampleCount - lastReport >= 2000000) {
      lastReport = sampleCount;
      (self as unknown as Worker).postMessage({ type: 'progress', sampleCount });
    }
  }

  if (samplingRate) {
    for (let i = 0; i < risingArr.length; i++) risingArr[i] = risingArr[i] / samplingRate;
    for (let i = 0; i < fallingArr.length; i++) fallingArr[i] = fallingArr[i] / samplingRate;
  }

  const re = new Float64Array(risingArr);
  const fe = new Float64Array(fallingArr);

  (self as unknown as Worker).postMessage(
    {
      type: 'done',
      samplingRate,
      sampleCount,
      risingEdges: re,
      fallingEdges: fe,
      format: 'txt',
    },
    [re.buffer, fe.buffer]
  );
};
