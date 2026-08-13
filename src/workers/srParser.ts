/// <reference lib="webworker" />

import {
  readZipEntries,
  parseSrMetadata,
  inflateBlock,
  scanLogicBlocks,
} from '../srFormat';

self.onmessage = async function (e: MessageEvent) {
  if (e.data.type !== 'parse') return;
  const u8 = new Uint8Array(e.data.buffer as ArrayBuffer);

  try {
    const entries = readZipEntries(u8);

    // metadata 可能为 store 或 deflate 压缩，统一解压读取
    const metaEntry = entries.find((en) => en.name === 'metadata');
    if (!metaEntry) throw new Error('缺少 metadata 文件，不是有效的 .sr 文件');
    const metaBytes = await inflateBlock(metaEntry, u8);
    const metaText = new TextDecoder('utf-8').decode(metaBytes);
    const meta = parseSrMetadata(metaText);
    if (!meta.samplerate) throw new Error('metadata 中未找到采样频率（samplerate）');
    if (!meta.capturefile) throw new Error('metadata 中未找到数据文件名（capturefile）');

    // 收集逻辑数据块（capturefile 或 capturefile-N，按序号排序）
    const prefix = meta.capturefile;
    const blocks: { seq: number; entry: (typeof entries)[number] }[] = [];
    for (const entry of entries) {
      if (entry.name === prefix) {
        blocks.push({ seq: 0, entry });
      } else {
        const m = entry.name.match(/^(.+)-(\d+)$/);
        if (m && m[1] === prefix) blocks.push({ seq: parseInt(m[2], 10), entry });
      }
    }
    blocks.sort((a, b) => a.seq - b.seq);
    if (!blocks.length) throw new Error('未找到逻辑数据块 ' + prefix);

    // 逐块解压并报告进度
    const raws: Uint8Array[] = [];
    let reportedSamples = 0;
    for (const b of blocks) {
      const raw = await inflateBlock(b.entry, u8);
      raws.push(raw);
      reportedSamples += Math.floor(raw.length / meta.unitsize);
      (self as unknown as Worker).postMessage({ type: 'progress', sampleCount: reportedSamples });
    }

    const result = scanLogicBlocks(raws, meta.unitsize, meta.samplerate);

    (self as unknown as Worker).postMessage(
      {
        type: 'done',
        samplingRate: meta.samplerate,
        sampleCount: result.sampleCount,
        risingEdges: result.risingEdges,
        fallingEdges: result.fallingEdges,
        transTimes: result.transTimes,
        transLevels: result.transLevels,
        format: 'sr',
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
