import assert from 'node:assert/strict';
import { isTxtEdgeList, parseTxtEdgeList } from '../src/txtFormat.ts';

const lines = [
  'Time[s], Channel 2',
  '0.000000000, 0',
  '1.000000000, 1',
  '1.000000100, 1',
  '1.500000000, 0',
  '2.000000000, 1',
];

assert.equal(isTxtEdgeList(lines), true);
const result = parseTxtEdgeList(lines);
assert.equal(result.sampleCount, 5);
assert.deepEqual([...result.transTimes], [0, 1, 1.5, 2]);
assert.deepEqual([...result.transLevels], [0, 1, 0, 1]);
assert.deepEqual([...result.risingEdges], [1, 2]);
assert.deepEqual([...result.fallingEdges], [1.5]);
assert.equal(result.samplingRate, 2);

console.log('txt edge parser tests passed');
