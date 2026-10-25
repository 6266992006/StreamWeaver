import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPercent, displayPercent, etaSeconds, formatDuration, formatRate } from './progressUtils.js';
import { filenameFromDisposition } from './download.js';

test('displayPercent never shows 100% until the job is actually done', () => {
  assert.equal(displayPercent(null), 0);
  assert.equal(displayPercent({ status: 'processing', percent: 100 }), 99);
  assert.equal(displayPercent({ status: 'processing', percent: 42.4 }), 42.4);
  assert.equal(displayPercent({ status: 'processing', percent: null }), 0);
  assert.equal(displayPercent({ status: 'done', percent: 17 }), 100);
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent(NaN), 0);
});

test('etaSeconds needs a total and a rate, and is 0 once everything is handled', () => {
  assert.equal(etaSeconds({ totalRows: 0, rowsPerSec: 100 }), null);
  assert.equal(etaSeconds({ totalRows: 1000, rowsProcessed: 0, rowsPerSec: 0 }), null);
  assert.equal(etaSeconds({ totalRows: 1000, rowsProcessed: 400, rowsFailed: 100, rowsPerSec: 100 }), 5);
  assert.equal(etaSeconds({ totalRows: 1000, rowsProcessed: 1000, rowsPerSec: 100 }), 0);
});

test('formatDuration and formatRate are readable', () => {
  assert.equal(formatDuration(7), '7s');
  assert.equal(formatDuration(75), '1m 15s');
  assert.equal(formatDuration(3725), '1h 02m');
  assert.equal(formatDuration(null), '—');
  assert.equal(formatRate(12345.6), `${(12346).toLocaleString()} rows/s`);
  assert.equal(formatRate(0), '—');
});

test('filenameFromDisposition reads the download name from the header', () => {
  assert.equal(filenameFromDisposition('attachment; filename="people-errors.csv"'), 'people-errors.csv');
  assert.equal(filenameFromDisposition("attachment; filename*=UTF-8''my%20file.json"), 'my file.json');
  assert.equal(filenameFromDisposition(undefined, 'fallback.csv'), 'fallback.csv');
});
