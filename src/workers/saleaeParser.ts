/// <reference lib="webworker" />

import { parseSaleaeFile } from '../saleaeFormat';

self.onmessage = function (e: MessageEvent) {
  if (e.data.type !== 'parse') return;
  const u8 = new Uint8Array(e.data.buffer as ArrayBuffer);

  try {
    const result = parseSaleaeFile(u8);

    (self as unknown as Worker).postMessage(
      {
        type: 'done',
        samplingRate: result.samplingRate,
        sampleCount: result.sampleCount,
        risingEdges: result.risingEdges,
        fallingEdges: result.fallingEdges,
        transTimes: result.transTimes,
        transLevels: result.transLevels,
        format: 'saleae',
      },
      [
        result.risingEdges.buffer,
        result.fallingEdges.buffer,
        result.transTimes.buffer,
        result.transLevels.buffer,
      ]
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
