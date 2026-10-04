// Pure helpers for the failed-row error UI (no React, so they can be
// unit-tested with `npm test`).
//
// The backend stores each failed row as { row, reason }, where `row` is the
// 1-based data-row number (row 1 = first row after the CSV header) and
// `reason` is one or more messages joined with "; " — e.g.
// "email must be a valid email; age is required".

export const ERROR_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'required', label: 'Missing value' },
  { id: 'type', label: 'Wrong format' },
  { id: 'database', label: 'Database' },
  { id: 'other', label: 'Other' },
];

const CATEGORY_LABEL = Object.fromEntries(ERROR_CATEGORIES.map((c) => [c.id, c.label]));

export function categoryLabel(id) {
  return CATEGORY_LABEL[id] || CATEGORY_LABEL.other;
}

// One reason string -> which kind of problem it is.
export function categorizeReason(reason) {
  const r = String(reason ?? '').toLowerCase();
  if (r.includes('is required')) return 'required';
  if (r.includes('must be a valid')) return 'type';
  if (/duplicate|e11000|database|insert|write|batch/.test(r)) return 'database';
  return 'other';
}

// "a; b" -> ["a", "b"]. Always returns at least one entry.
export function splitReasons(reason) {
  const parts = String(reason ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : ['Unknown error'];
}

// Every category a row's reasons fall into.
function categoriesOf(error) {
  return new Set(splitReasons(error.reason).map(categorizeReason));
}

export function filterErrors(errors, { query = '', category = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return errors.filter((e) => {
    if (category !== 'all' && !categoriesOf(e).has(category)) return false;
    if (!q) return true;
    return String(e.row).includes(q) || String(e.reason ?? '').toLowerCase().includes(q);
  });
}

// How many failed rows fall in each filter chip.
export function countByCategory(errors) {
  const counts = { all: errors.length, required: 0, type: 0, database: 0, other: 0 };
  for (const e of errors) for (const c of categoriesOf(e)) counts[c] += 1;
  return counts;
}

// The server caps the stored error list (rowsFailed holds the true total),
// so the list can be shorter than the number of failed rows.
export function hiddenErrorCount(errors, totalFailed) {
  const total = Number.isFinite(totalFailed) ? totalFailed : 0;
  return Math.max(0, total - errors.length);
}

// Turns a failed error-list request into something the user can act on.
export function describeErrorsError(err, apiBase = '') {
  const status = err?.response?.status;
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 404) {
    return 'The error details for this file are not available. If the backend was just updated, restart it and try again.';
  }
  if (status === 429) return 'Too many requests. Wait a moment, then try again.';
  if (!err?.response) return `Can't reach the backend${apiBase ? ` at ${apiBase}` : ''}. Is it running?`;
  return err.response?.data?.message || 'Could not load the failed rows.';
}
