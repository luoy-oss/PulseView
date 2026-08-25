/// <reference lib="webworker" />

import { parseSaleaeFile } from '../saleaeFormat';

self.onmessage = function (e: MessageEvent) {
  if (e.data.type !== 'parse') return;
  const u8 = new Uint8Array(e.data.buffer as ArrayBuffer);

  try {
    const result = parseSaleaeFile(u8);
    const transferables: Transferable[] = [result.risingEdges.buffer, result.fallingEdges.buffer, result.transTimes.buffer, result.transLevels.buffer];
    for (const channel of result.channels ?? []) {
      for (const buffer of [channel.risingEdges.buffer, channel.fallingEdges.buffer, channel.transTimes.buffer, channel.transLevels.buffer]) {
        if (!transferables.includes(buffer)) transferables.push(buffer);
      }
    }

    (self as unknown as Worker).postMessage(
      {
        type: 'done',
        samplingRate: result.samplingRate,
        sampleCount: result.sampleCount,
        risingEdges: result.risingEdges,
        fallingEdges: result.fallingEdges,
        transTimes: result.transTimes,
        transLevels: result.transLevels,
        channels: result.channels,
        format: 'saleae',
      },
      transferables
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
