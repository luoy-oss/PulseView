import assert from 'node:assert/strict';
import { FORMAT_LABELS, MODE_FORMATS, buildIssueUrl } from '../src/formats.ts';

assert.deepEqual(Object.keys(MODE_FORMATS), ['normal', 'ab', 'direction']);
assert.match(MODE_FORMATS.normal.formats, /\.vcd/);
assert.match(MODE_FORMATS.normal.formats, /\.csv/);
assert.match(MODE_FORMATS.ab.formats, /\.vcd/);
assert.match(MODE_FORMATS.ab.hint, /单比特/);
assert.match(MODE_FORMATS.direction.formats, /\.vcd/);
assert.equal(FORMAT_LABELS.vcd, 'VCD');
assert.equal(FORMAT_LABELS.saleae, 'BIN/CSV');

const url = new URL(buildIssueUrl({ fileName: 'a b.vcd', format: 'VCD', error: 'boom\nline2' }));
assert.equal(url.origin + url.pathname, 'https://github.com/luoy-oss/PulseView/issues/new');
assert.equal(url.searchParams.get('title'), '无法解析文件：a b.vcd');
const body = url.searchParams.get('body') ?? '';
assert.match(body, /boom/);
assert.match(body, /line2/);
assert.match(body, /无法分析的文件/);
assert.match(body, /a b\.vcd/);

console.log('formats tests passed');
