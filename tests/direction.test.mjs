import assert from 'node:assert/strict';
import { computeDirectionAnalysis, DIRECTION_PRESETS, suggestDirectionChannels } from '../src/computeDirection.ts';

const channel = (id, name, times, levels) => ({ id, name, transitions: new Float64Array(times), levels: new Int8Array(levels) });
const pulse = channel('!', 'D0', [0, 1, 2, 3, 4, 5], [0, 1, 0, 1, 0, 1]);
const dir = channel('"', 'D2', [0, 1.5, 3.5], [1, 0, 1]);

assert.deepEqual(DIRECTION_PRESETS.map((mapping) => [mapping.idleLevel, mapping.forwardLevel]), [[1, 0], [0, 0], [0, 1], [1, 1]]);
const forward = computeDirectionAnalysis(pulse, dir, DIRECTION_PRESETS[0]);
assert.deepEqual(forward.freqPoints.map((point) => point.freq), [-0.5, 0.5]);
assert.equal(forward.forwardCycles, 1);
assert.equal(forward.reverseCycles, 1);

const beforePulse = channel('"', 'direction', [0, 0.2, 2.2], [1, 0, 1]);
const delayed = computeDirectionAnalysis(pulse, beforePulse, DIRECTION_PRESETS[0]);
assert.equal(delayed.freqPoints[0].direction, 'forward');

const pulse2 = channel('!', 'D0 pulse', [0, 1, 2], [0, 1, 0]);
const dir2 = channel('"', 'D2 direction', [0, 0.5], [1, 0]);
const suggestion = suggestDirectionChannels([dir2, pulse2]);
assert.equal(suggestion.pulse.id, '!');
assert.equal(suggestion.direction.id, '"');
