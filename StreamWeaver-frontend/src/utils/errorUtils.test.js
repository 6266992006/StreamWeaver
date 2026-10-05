import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeReason,
  splitReasons,
  filterErrors,
  countByCategory,
  hiddenErrorCount,
  describeErrorsError,
} from './errorUtils.js';

const errors = [
  { row: 3, reason: 'email must be a valid email' },
  { row: 7, reason: 'name is required; age must be a valid number' },
  { row: 12, reason: 'E11000 duplicate key error' },
  { row: 40, reason: 'something odd' },
];

test('categorizeReason sorts messages into categories', () => {
  assert.equal(categorizeReason('name is required'), 'required');
  assert.equal(categorizeReason('age must be a valid number'), 'type');
  assert.equal(categorizeReason('E11000 duplicate key'), 'database');
  assert.equal(categorizeReason('???'), 'other');
  assert.equal(categorizeReason(undefined), 'other');
});

test('splitReasons splits on semicolons and never returns empty', () => {
  assert.deepEqual(splitReasons('a; b ;c'), ['a', 'b', 'c']);
  assert.deepEqual(splitReasons(''), ['Unknown error']);
  assert.deepEqual(splitReasons(null), ['Unknown error']);
});

test('filterErrors matches by category (any reason), row number and text', () => {
  assert.equal(filterErrors(errors, { category: 'required' }).length, 1);
  assert.equal(filterErrors(errors, { category: 'type' }).length, 2); // row 3 and row 7
  assert.deepEqual(filterErrors(errors, { query: '12' }).map((e) => e.row), [12]);
  assert.deepEqual(filterErrors(errors, { query: 'ODD' }).map((e) => e.row), [40]);
  assert.equal(filterErrors(errors).length, 4);
});

test('countByCategory counts a multi-reason row in each category it hits', () => {
  assert.deepEqual(countByCategory(errors), { all: 4, required: 1, type: 2, database: 1, other: 1 });
});

test('hiddenErrorCount reports rows beyond the stored error list', () => {
  assert.equal(hiddenErrorCount(errors, 4), 0);
  assert.equal(hiddenErrorCount(errors, 5000), 4996);
  assert.equal(hiddenErrorCount(errors, undefined), 0);
});

test('describeErrorsError gives actionable messages', () => {
  assert.match(describeErrorsError({ response: { status: 401 } }), /session has expired/);
  assert.match(describeErrorsError({}, 'http://x'), /Can't reach the backend at http:\/\/x/);
  assert.equal(describeErrorsError({ response: { status: 500, data: { message: 'boom' } } }), 'boom');
});
