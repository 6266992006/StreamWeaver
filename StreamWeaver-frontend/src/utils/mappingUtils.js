// Column-mapping logic for the Mapping page: build the editable table from the
// CSV's columns, check it, and turn it into what the backend expects.
//
//   mapping         { destField: { source, type?, required? } }
//   fieldTransforms { sourceColumn: "jsExpression using `value`" }

export const TYPE_OPTIONS = [
  { id: 'string', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'email', label: 'Email' },
  { id: 'date', label: 'Date' },
  { id: 'boolean', label: 'True / False' },
];

// One-click cleanups, compiled to the JavaScript the sandbox runs per value.
// `value` is the cell's text. "custom" lets you write your own expression.
export const TRANSFORM_PRESETS = [
  { id: 'none', label: 'No change', expr: '' },
  { id: 'trim', label: 'Trim spaces', expr: 'String(value).trim()' },
  { id: 'uppercase', label: 'UPPERCASE', expr: 'String(value).toUpperCase()' },
  { id: 'lowercase', label: 'lowercase', expr: 'String(value).toLowerCase()' },
  {
    id: 'capitalize',
    label: 'Capitalize Each Word',
    expr: 'String(value).toLowerCase().replace(/(^|\\s)\\S/g, function (c) { return c.toUpperCase(); })',
  },
  {
    id: 'number',
    label: 'Extract number ($1,200 → 1200)',
    expr: "(function () { var n = String(value).replace(/[^0-9.\\-]/g, ''); return n === '' ? '' : Number(n); })()",
  },
  { id: 'digits', label: 'Digits only', expr: "String(value).replace(/\\D/g, '')" },
  { id: 'custom', label: 'Custom JavaScript…', expr: '' },
];

export const CUSTOM_EXAMPLE = 'value.split(" ")[0]';

const MAX_NAME_LEN = 128;

// --- type detection from sample values ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Real files are messy: one bad email shouldn't stop a whole column being
// recognised as emails (the bad ones are exactly what validation should catch).
// So a type wins when nearly all — 90% — of the filled values fit it.
const MOSTLY = 0.9;

export function guessType(values) {
  const filled = values.map((v) => String(v ?? '').trim()).filter((v) => v !== '');
  if (filled.length === 0) return 'string';
  const mostly = (test) => filled.filter(test).length / filled.length >= MOSTLY;

  if (mostly((v) => ['true', 'false'].includes(v.toLowerCase()))) return 'boolean';
  // Numbers with leading zeros (zip codes, phone numbers, ids like "007") are
  // text: turning them into numbers would silently drop the zeros.
  const hasLeadingZeros = filled.some((v) => /^0\d/.test(v));
  if (!hasLeadingZeros && mostly((v) => !Number.isNaN(Number(v)))) return 'number';
  if (mostly((v) => EMAIL_RE.test(v))) return 'email';
  if (mostly((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)))) return 'date';
  return 'string';
}

// Suggests a database-friendly field name for a column header.
export function suggestFieldName(column) {
  const cleaned = String(column ?? '')
    .trim()
    .replace(/\./g, '_')
    .replace(/^\$+/, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, MAX_NAME_LEN);
  return cleaned;
}

// Starting point: every column imported under its own name, type guessed.
export function buildInitialRows(columns, sampleRows = []) {
  return columns
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => source !== '') // an unnamed column can't be addressed
    .map(({ source, index }) => ({
      id: `col-${index}`,
      source,
      include: true,
      dest: suggestFieldName(source),
      type: guessType(sampleRows.slice(0, 200).map((r) => r[source])),
      required: false,
      preset: 'none',
      custom: '',
    }));
}

// --- the expression a row's transform compiles to ---

export function transformExpression(row) {
  if (row.preset === 'custom') return row.custom.trim();
  return TRANSFORM_PRESETS.find((p) => p.id === row.preset)?.expr || '';
}

// --- validation of the mapping table ---

export function validateDestName(name, takenByOthers = new Set()) {
  if (name.trim() === '') return 'Give this field a name.';
  if (name.length > MAX_NAME_LEN) return `Keep it under ${MAX_NAME_LEN} characters.`;
  if (name.includes('.')) return "Field names can't contain a dot (.).";
  if (name.startsWith('$')) return "Field names can't start with $.";
  if (takenByOthers.has(name)) return 'Another column already uses this name.';
  return null;
}

// -> { errors: { [rowId]: message }, problem: string | null }
export function validateRows(rows) {
  const errors = {};
  const included = rows.filter((r) => r.include);

  const counts = new Map();
  included.forEach((r) => counts.set(r.dest, (counts.get(r.dest) || 0) + 1));

  for (const row of included) {
    const taken = counts.get(row.dest) > 1 ? new Set([row.dest]) : new Set();
    const nameError = validateDestName(row.dest, taken);
    if (nameError) errors[row.id] = nameError;
    else if (row.preset === 'custom' && row.custom.trim() === '') {
      errors[row.id] = 'Write the JavaScript, or pick another option.';
    }
  }

  const problem = included.length === 0 ? 'Include at least one column to import.' : null;
  return { errors, problem };
}

// --- what gets sent to the backend ---

export function buildImportPayload(rows) {
  const mapping = {};
  const fieldTransforms = {};

  for (const row of rows.filter((r) => r.include)) {
    const rule = { source: row.source };
    if (row.type && row.type !== 'string') rule.type = row.type;
    if (row.required) rule.required = true;
    mapping[row.dest] = rule;

    const expr = transformExpression(row);
    if (expr) fieldTransforms[row.source] = expr;
  }
  return { mapping, fieldTransforms };
}

// --- client-side mirror of the backend's row checks (utils/dbValidators.js) ---
// Used only to flag cells in the preview that WOULD fail; the server is still
// the authority when the import runs.

export function checkValue(value, { type, required } = {}, dest = 'This field') {
  const v = value;
  const blank = v === undefined || v === null || String(v).trim() === '';
  if (required && blank) return `${dest} is required`;
  if (blank) return null; // nothing to type-check
  const s = String(v).trim();
  if (type === 'number' && Number.isNaN(Number(s))) return `${dest} must be a valid number`;
  if (type === 'email' && !EMAIL_RE.test(s)) return `${dest} must be a valid email`;
  if (type === 'date' && Number.isNaN(Date.parse(s))) return `${dest} must be a valid date`;
  if (type === 'boolean' && !['true', 'false', '0', '1'].includes(s.toLowerCase())) {
    return `${dest} must be a valid boolean`;
  }
  return null;
}

// How many of the sample rows would fail, per included column and in total.
export function summarizeSampleChecks(rows, sampleRows, transformedRows = sampleRows) {
  const perColumn = {};
  const failingRows = new Set();
  const included = rows.filter((r) => r.include);

  transformedRows.forEach((t, i) => {
    for (const row of included) {
      const reason = checkValue(t?.[row.source], { type: row.type, required: row.required }, row.dest);
      if (reason) {
        perColumn[row.id] = (perColumn[row.id] || 0) + 1;
        failingRows.add(i);
      }
    }
  });
  return { perColumn, failingRowCount: failingRows.size, sampleSize: sampleRows.length };
}

// Sandbox transforms are keyed by source column; only send non-empty ones.
export function activeTransforms(rows) {
  const out = {};
  for (const row of rows.filter((r) => r.include)) {
    const expr = transformExpression(row);
    if (expr) out[row.source] = expr;
  }
  return out;
}
