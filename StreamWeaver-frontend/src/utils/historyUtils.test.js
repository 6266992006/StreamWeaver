import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatBytes,
  formatCount,
  timeAgo,
  progressPercent,
  filterJobs,
  sortJobs,
  summarizeJobs,
  countByGroup,
  hasActiveJobs,
  paginate,
  describeHistoryError,
  statusMeta,
} from './historyUtils.js';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

const jobs = [
  { id: 'a', fileName: 'Sales-Q1.csv', uploadedAt: ago(3600e3), status: 'done', totalRows: 1000, rowsProcessed: 990, rowsFailed: 10 },
  { id: 'b', fileName: 'customers.csv', uploadedAt: ago(60e3), status: 'uploaded', totalRows: 50, rowsProcessed: 0, rowsFailed: 0 },
  { id: 'c', fileName: 'events.csv', uploadedAt: ago(86400e3 * 2), status: 'processing', totalRows: 400, rowsProcessed: 100, rowsFailed: 0 },
  { id: 'd', fileName: 'broken.csv', uploadedAt: ago(5000e3), status: 'failed', totalRows: 0, rowsProcessed: 0, rowsFailed: 0 },
];

test('formatBytes picks a sensible unit', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(171225), '167 KB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB');
  assert.equal(formatBytes(undefined), '0 B');
});

test('formatCount groups thousands and survives junk', () => {
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(formatCount(undefined), '0');
});

test('timeAgo walks through its ranges', () => {
  assert.equal(timeAgo(ago(10e3), NOW), 'just now');
  assert.equal(timeAgo(ago(5 * 60e3), NOW), '5 min ago');
  assert.equal(timeAgo(ago(3 * 3600e3), NOW), '3 h ago');
  assert.equal(timeAgo(ago(2 * 86400e3), NOW), '2 d ago');
  assert.equal(timeAgo(new Date(NOW + 60e3).toISOString(), NOW), 'just now'); // clock skew
  assert.equal(timeAgo(null, NOW), '—');
  assert.equal(timeAgo('not a date', NOW), '—');
  assert.match(timeAgo(ago(30 * 86400e3), NOW), /May/); // falls back to a date after a week
});

test('progressPercent is null without a total and is clamped', () => {
  assert.equal(progressPercent({ totalRows: 0 }), null);
  assert.equal(progressPercent({}), null);
  assert.equal(progressPercent({ totalRows: 400, rowsProcessed: 100, rowsFailed: 0 }), 25);
  assert.equal(progressPercent({ totalRows: 100, rowsProcessed: 90, rowsFailed: 30 }), 100);
});

test('statusMeta covers backend statuses and unknowns', () => {
  assert.equal(statusMeta('done').label, 'Done');
  assert.equal(statusMeta('processed').group, 'done');
  assert.equal(statusMeta('pending').label, 'Queued');
  assert.equal(statusMeta('weird').label, 'weird');
  assert.equal(statusMeta(undefined).label, 'Unknown');
});

test('filterJobs by text (case-insensitive) and by status group', () => {
  assert.deepEqual(filterJobs(jobs, { query: 'SALES' }).map((j) => j.id), ['a']);
  assert.deepEqual(filterJobs(jobs, { group: 'waiting' }).map((j) => j.id), ['b']);
  assert.deepEqual(filterJobs(jobs, { group: 'done', query: 'sales' }).map((j) => j.id), ['a']);
  assert.deepEqual(filterJobs(jobs, { group: 'done', query: 'events' }), []);
  assert.equal(filterJobs(jobs, { query: '  ' }).length, 4);
  assert.equal(filterJobs(jobs).length, 4);
});

test('sortJobs: by date both ways, by name, by rows; does not mutate input', () => {
  const before = jobs.map((j) => j.id);
  assert.deepEqual(sortJobs(jobs, { key: 'uploadedAt', dir: 'desc' }).map((j) => j.id), ['b', 'a', 'd', 'c']);
  assert.deepEqual(sortJobs(jobs, { key: 'uploadedAt', dir: 'asc' }).map((j) => j.id), ['c', 'd', 'a', 'b']);
  assert.deepEqual(sortJobs(jobs, { key: 'fileName', dir: 'asc' }).map((j) => j.id), ['d', 'b', 'c', 'a']);
  assert.deepEqual(sortJobs(jobs, { key: 'totalRows', dir: 'desc' }).map((j) => j.id), ['a', 'c', 'b', 'd']);
  assert.deepEqual(jobs.map((j) => j.id), before);
});

test('sortJobs falls back to date for an unknown key and keeps ties stable', () => {
  const same = [{ id: 1, totalRows: 5 }, { id: 2, totalRows: 5 }, { id: 3, totalRows: 5 }];
  assert.deepEqual(sortJobs(same, { key: 'totalRows', dir: 'desc' }).map((j) => j.id), [1, 2, 3]);
  assert.equal(sortJobs(jobs, { key: 'nonsense' }).length, 4);
});

test('summarizeJobs totals the columns', () => {
  assert.deepEqual(summarizeJobs(jobs), { files: 4, rows: 1450, processed: 1090, failed: 10 });
  assert.deepEqual(summarizeJobs([]), { files: 0, rows: 0, processed: 0, failed: 0 });
});

test('countByGroup and hasActiveJobs', () => {
  assert.deepEqual(countByGroup(jobs), { all: 4, waiting: 1, processing: 1, done: 1, failed: 1 });
  assert.equal(hasActiveJobs(jobs), true);
  assert.equal(hasActiveJobs(jobs.filter((j) => j.status !== 'processing')), false);
  assert.equal(hasActiveJobs([{ status: 'pending' }]), true);
  assert.equal(hasActiveJobs([]), false);
});

test('paginate clamps the page and reports the visible range', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  const p1 = paginate(items, 1, 10);
  assert.deepEqual([p1.items.length, p1.pageCount, p1.from, p1.to], [10, 3, 1, 10]);
  const p3 = paginate(items, 3, 10);
  assert.deepEqual([p3.items.length, p3.from, p3.to], [3, 21, 23]);
  assert.equal(paginate(items, 99, 10).page, 3); // too high -> last page
  assert.equal(paginate(items, -4, 10).page, 1); // too low -> first page
  const empty = paginate([], 1, 10);
  assert.deepEqual([empty.pageCount, empty.from, empty.to], [1, 0, 0]);
});

test('describeHistoryError gives an actionable message per failure', () => {
  assert.match(describeHistoryError({ response: { status: 401 } }), /sign in again/i);
  assert.match(describeHistoryError({ response: { status: 404 } }), /npm run dev/);
  assert.match(describeHistoryError({ response: { status: 429 } }), /Too many/);
  assert.match(describeHistoryError(new Error('Network Error'), 'http://localhost:5000'), /Can't reach the backend at http:\/\/localhost:5000/);
  assert.equal(describeHistoryError({ response: { status: 500, data: { message: 'Could not fetch upload history' } } }), 'Could not fetch upload history');
  assert.equal(describeHistoryError({ response: { status: 500, data: {} } }), 'Could not load upload history.');
});
