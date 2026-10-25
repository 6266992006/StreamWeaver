import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guessType,
  suggestFieldName,
  buildInitialRows,
  transformExpression,
  validateDestName,
  validateRows,
  buildImportPayload,
  checkValue,
  summarizeSampleChecks,
  activeTransforms,
  TRANSFORM_PRESETS,
} from './mappingUtils.js';

test('guessType recognises numbers, emails, dates, booleans and falls back to text', () => {
  assert.equal(guessType(['1', '2.5', '-3']), 'number');
  assert.equal(guessType(['a@b.co', 'c@d.io']), 'email');
  assert.equal(guessType(['2024-01-31', '2023-12-01T10:00:00Z']), 'date');
  assert.equal(guessType(['true', 'FALSE']), 'boolean');
  assert.equal(guessType(['Bob', '12']), 'string');
  assert.equal(guessType(['', '  ']), 'string');
  assert.equal(guessType(['1', '', '3']), 'number'); // blanks are ignored
  // dirty data: a few bad values don't change the verdict (validation catches them)
  const emails = Array.from({ length: 19 }, (_, i) => `u${i}@x.co`).concat('oops');
  assert.equal(guessType(emails), 'email');
  assert.equal(guessType(['1', '2', 'n/a', 'x']), 'string'); // half and half is text
  // leading zeros mean "identifier", not "number"
  assert.equal(guessType(['02134', '10001', '94105']), 'string');
  assert.equal(guessType(['0', '10', '0.5']), 'number'); // a lone 0 / 0.5 is still numeric
});

test('suggestFieldName makes names the database accepts', () => {
  assert.equal(suggestFieldName('first.name'), 'first_name');
  assert.equal(suggestFieldName('$price'), 'price');
  assert.equal(suggestFieldName('  City '), 'City');
});

test('buildInitialRows maps every named column to itself with a guessed type', () => {
  const rows = buildInitialRows(['id', 'email', ''], [{ id: '1', email: 'a@b.co' }, { id: '2', email: 'c@d.io' }]);
  assert.equal(rows.length, 2); // the unnamed column is skipped
  assert.deepEqual(rows.map((r) => [r.source, r.dest, r.type]), [['id', 'id', 'number'], ['email', 'email', 'email']]);
  assert.ok(rows.every((r) => r.include && !r.required && r.preset === 'none'));
});

test('presets compile to the expressions the sandbox runs', () => {
  const row = (preset, custom = '') => ({ preset, custom });
  assert.equal(transformExpression(row('none')), '');
  assert.equal(transformExpression(row('uppercase')), 'String(value).toUpperCase()');
  assert.equal(transformExpression(row('custom', '  value + "!"  ')), 'value + "!"');
  // every non-custom preset really evaluates, with `value` in scope
  for (const p of TRANSFORM_PRESETS.filter((x) => x.expr)) {
    assert.doesNotThrow(() => new Function('value', `return (${p.expr});`)('  hello World '), p.id);
  }
  const run = (id, v) => new Function('value', `return (${TRANSFORM_PRESETS.find((p) => p.id === id).expr});`)(v);
  assert.equal(run('trim', '  x '), 'x');
  assert.equal(run('capitalize', 'jOHN o smith'), 'John O Smith');
  assert.equal(run('number', '$1,200.50'), 1200.5);
  assert.equal(run('number', 'n/a'), '');
  assert.equal(run('digits', '(555) 123-4567'), '5551234567');
});

test('validateDestName rejects names MongoDB would mangle', () => {
  assert.equal(validateDestName('ok_name'), null);
  assert.match(validateDestName(' '), /name/i);
  assert.match(validateDestName('a.b'), /dot/);
  assert.match(validateDestName('$x'), /\$/);
  assert.match(validateDestName('dup', new Set(['dup'])), /already/);
});

test('validateRows flags duplicate names, empty custom scripts and an empty selection', () => {
  const base = { include: true, type: 'string', required: false, preset: 'none', custom: '' };
  const rows = [
    { ...base, id: 'a', source: 'a', dest: 'same' },
    { ...base, id: 'b', source: 'b', dest: 'same' },
    { ...base, id: 'c', source: 'c', dest: 'c', preset: 'custom', custom: '' },
    { ...base, id: 'd', source: 'd', dest: 'd', include: false, dest2: 'ignored' },
  ];
  const { errors, problem } = validateRows(rows);
  assert.ok(errors.a && errors.b && errors.c);
  assert.equal(errors.d, undefined); // excluded rows aren't checked
  assert.equal(problem, null);
  assert.match(validateRows(rows.map((r) => ({ ...r, include: false }))).problem, /at least one/i);
});

test('buildImportPayload produces the backend mapping + transforms (renames, types, required)', () => {
  const rows = [
    { id: '1', source: 'Full Name', dest: 'fullName', include: true, type: 'string', required: true, preset: 'uppercase', custom: '' },
    { id: '2', source: 'Age', dest: 'age', include: true, type: 'number', required: false, preset: 'none', custom: '' },
    { id: '3', source: 'Skip', dest: 'skip', include: false, type: 'string', required: false, preset: 'trim', custom: '' },
  ];
  assert.deepEqual(buildImportPayload(rows), {
    mapping: { fullName: { source: 'Full Name', required: true }, age: { source: 'Age', type: 'number' } },
    // transforms are keyed by the SOURCE column (they run before renaming)
    fieldTransforms: { 'Full Name': 'String(value).toUpperCase()' },
  });
  assert.deepEqual(activeTransforms(rows), { 'Full Name': 'String(value).toUpperCase()' });
});

test('checkValue mirrors the backend messages', () => {
  assert.equal(checkValue('', { required: true }, 'name'), 'name is required');
  assert.equal(checkValue('x', { type: 'number' }, 'age'), 'age must be a valid number');
  assert.equal(checkValue('nope', { type: 'email' }, 'email'), 'email must be a valid email');
  assert.equal(checkValue('', { type: 'email' }, 'email'), null); // blank is "required"'s job
  assert.equal(checkValue('maybe', { type: 'boolean' }, 'ok'), 'ok must be a valid boolean');
  assert.equal(checkValue('2024-02-30x', { type: 'date' }, 'd'), 'd must be a valid date');
  assert.equal(checkValue('1', { type: 'boolean' }, 'ok'), null);
});

test('summarizeSampleChecks counts failing cells and rows', () => {
  const rows = [
    { id: 'e', source: 'email', dest: 'email', include: true, type: 'email', required: false },
    { id: 'n', source: 'name', dest: 'name', include: true, type: 'string', required: true },
  ];
  const sample = [
    { email: 'a@b.co', name: 'A' },
    { email: 'bad', name: '' },
    { email: 'bad2', name: 'C' },
  ];
  const s = summarizeSampleChecks(rows, sample);
  assert.deepEqual(s.perColumn, { e: 2, n: 1 });
  assert.equal(s.failingRowCount, 2);
  assert.equal(s.sampleSize, 3);
});
