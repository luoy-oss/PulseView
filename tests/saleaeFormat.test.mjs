import assert from 'node:assert/strict';
import { parseSaleaeFile } from '../src/saleaeFormat.ts';

const csv = [
  '; Sample rate: 20 MHz',
  'SystemTime, Time(s), Channel 0, Channel 1, Channel 9',
  "'2026-08-24 00:00:00.000,0,0,0,1",
  "'2026-08-24 00:00:00.100,0.1,1,0,1",
  "'2026-08-24 00:00:00.200,0.2,1,1,1",
  "'2026-08-24 00:00:00.300,0.3,0,1,1",
  "'2026-08-24 00:00:00.400,0.4,1,0,1",
].join('\n');

const result = parseSaleaeFile(new TextEncoder().encode(csv));
assert.deepEqual(result.channels?.map((channel) => channel.id), ['0', '1']);
assert.equal(result.channels?.[0].name, 'Channel 0');
assert.deepEqual([...result.transTimes], [0, 0.1, 0.3, 0.4]);
assert.deepEqual([...result.transLevels], [0, 1, 0, 1]);
assert.equal(result.samplingRate, 20e6);

const legacyCsv = [
  'Time,Channel 0',
  '0,0',
  '0.1,1',
  '0.2,0',
  '0.3,1',
].join('\n');
const legacyResult = parseSaleaeFile(new TextEncoder().encode(legacyCsv));
assert.deepEqual([...legacyResult.transTimes], [0, 0.1, 0.2, 0.3]);

const missingSampleCsv = [
  '; Sample rate: 2 kHz',
  'Time(s),Channel 0',
  '0,0',
  '0.1,',
  '0.2,1',
  '0.3,0',
].join('\n');
const missingSampleResult = parseSaleaeFile(new TextEncoder().encode(missingSampleCsv));
assert.deepEqual([...missingSampleResult.transTimes], [0, 0.2, 0.3]);
assert.equal(missingSampleResult.samplingRate, 2e3);

const megaRateResult = parseSaleaeFile(new TextEncoder().encode(csv.replace('20 MHz', '3 MHz')));
assert.equal(megaRateResult.samplingRate, 3e6);

console.log('Saleae multi-channel CSV tests passed');
