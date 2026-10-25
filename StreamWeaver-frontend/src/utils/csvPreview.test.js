import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCsvLine, parsePreview, estimateRows, headerIssues } from './csvPreview.js';

test('splitCsvLine handles quotes, commas inside quotes and doubled quotes', () => {
  assert.deepEqual(splitCsvLine('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(splitCsvLine('"Smith, John",42,"say ""hi"""'), ['Smith, John', '42', 'say "hi"']);
  assert.deepEqual(splitCsvLine(' a , b '), ['a', 'b']);
  assert.deepEqual(splitCsvLine('a,,c'), ['a', '', 'c']);
});

test('parsePreview reads header + rows, strips a BOM, handles CRLF and short rows', () => {
  const { columns, rows } = parsePreview('\uFEFFid,name\r\n1,Ann\r\n2\r\n\r\n3,Cy\r\n');
  assert.deepEqual(columns, ['id', 'name']);
  assert.deepEqual(rows, [
    { id: '1', name: 'Ann' },
    { id: '2', name: '' }, // missing value -> empty, like the backend
    { id: '3', name: 'Cy' },
  ]);
});

test('parsePreview drops the half-cut last line of a partial slice and honours the row limit', () => {
  const text = 'id\n1\n2\n3\n4';
  assert.equal(parsePreview(text, { isWholeFile: false }).rows.length, 3); // "4" may be incomplete
  assert.equal(parsePreview(text, { isWholeFile: true }).rows.length, 4);
  assert.equal(parsePreview(text, { rowLimit: 2 }).rows.length, 2);
  assert.deepEqual(parsePreview('').columns, []);
});

test('estimateRows is exact for small files and proportional for big ones', () => {
  assert.equal(estimateRows({ fileSize: 100, bytesParsed: 100, rowsParsed: 9, isWholeFile: true }), 9);
  // 1,000 rows in ~20KB => ~20 bytes/row; a 20MB file ~ 1,000,000 rows
  const est = estimateRows({ fileSize: 20_000_000, bytesParsed: 20_020, rowsParsed: 1000, isWholeFile: false });
  assert.ok(est > 900_000 && est < 1_100_000, String(est));
  assert.equal(estimateRows({ fileSize: 10, bytesParsed: 0, rowsParsed: 0, isWholeFile: false }), 0);
});

test('a small file is counted exactly even though the preview only shows 1,000 rows', () => {
  const text = 'id\n' + Array.from({ length: 5000 }, (_, i) => i + 1).join('\n') + '\n';
  const parsed = parsePreview(text, { isWholeFile: true });
  assert.equal(parsed.rows.length, 1000);
  assert.equal(parsed.rowsInSlice, 5000);
  assert.equal(estimateRows({ fileSize: text.length, ...parsed, isWholeFile: true }), 5000);
});

test('headerIssues warns about empty and duplicate column names', () => {
  assert.deepEqual(headerIssues(['a', 'b']), []);
  assert.match(headerIssues(['a', '', 'c'])[0], /Column 2 has no name/);
  assert.match(headerIssues(['id', 'name', 'id'])[0], /"id" appears 2 times/);
});
