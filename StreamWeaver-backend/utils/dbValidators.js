const mongoose = require("mongoose");

/**
 * Reusable field/schema validation + mapping helpers.
 *
 * Rows are checked against the user's column-mapping config *before*
 * they reach BulkInserter, so bad rows never hit MongoDB — they're
 * collected instead, in the shape TransformJob.errorLog expects
 * ({ row, reason }).
 *
 * mappingConfig shape:
 * {
 *   destinationField: { source: "CSV column", type: "number", required: true }
 * }
 */

// Basic per-type checks. Empty/undefined values are treated as "not my
// problem" here — `required` is the rule that actually rejects blanks.
const validators = {
  required: (value) =>
    value !== undefined && value !== null && String(value).trim() !== "",

  number: (value) =>
    value === "" || value === undefined || value === null || !isNaN(Number(value)),

  email: (value) =>
    !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()),

  date: (value) => !value || !isNaN(Date.parse(value)),

  boolean: (value) =>
    value === undefined ||
    value === null ||
    value === "" ||
    ["true", "false", "0", "1", true, false].includes(
      typeof value === "string" ? value.trim().toLowerCase() : value
    ),
};

// Turns a (validated) raw CSV string into the real value we store.
// Blank values become null so "missing" is explicit in MongoDB.
const casters = {
  number: (v) => (v === "" || v == null ? null : Number(v)),
  email: (v) => (v ? String(v).trim().toLowerCase() : null),
  date: (v) => (v ? new Date(v) : null),
  boolean: (v) => {
    if (v === true || v === "1" || String(v).toLowerCase() === "true") return true;
    if (v === false || v === "0" || String(v).toLowerCase() === "false") return false;
    return null;
  },
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Validate a single row against a mapping config.
 * @returns {{ valid: boolean, errors: { field: string, reason: string }[] }}
 */
function validateRow(row, mappingConfig = {}) {
  const errors = [];

  for (const [destField, rule] of Object.entries(mappingConfig)) {
    const value = row[rule.source ?? destField];

    if (rule.required && !validators.required(value)) {
      errors.push({ field: destField, reason: `${destField} is required` });
      continue; // no point type-checking a missing value
    }

    if (rule.type && validators[rule.type] && !validators[rule.type](value)) {
      errors.push({ field: destField, reason: `${destField} must be a valid ${rule.type}` });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a batch of rows in one pass.
 *
 * @param {object[]} rows
 * @param {object} mappingConfig
 * @param {{ startIndex?: number }} [opts] - added to each reported row
 *   index, so callers validating a stream in chunks keep absolute numbers.
 * @returns {{ validRows: object[], invalidRows: { row: number, reason: string }[] }}
 *   `row` is the 0-based index in the batch (+ startIndex).
 */
function validateRows(rows, mappingConfig = {}, { startIndex = 0 } = {}) {
  const validRows = [];
  const invalidRows = [];

  rows.forEach((row, index) => {
    const { valid, errors } = validateRow(row, mappingConfig);
    if (valid) {
      validRows.push(row);
    } else {
      invalidRows.push({
        row: startIndex + index,
        reason: errors.map((e) => e.reason).join("; "),
      });
    }
  });

  return { validRows, invalidRows };
}

/**
 * Apply a mapping config to one raw row: rename source columns to
 * destination fields and cast to the declared type.
 * With an empty mapping the row is passed through unchanged.
 */
function mapRow(row, mappingConfig = {}) {
  const entries = Object.entries(mappingConfig);
  if (entries.length === 0) return { ...row };

  const out = {};
  for (const [destField, rule] of entries) {
    const raw = row[rule.source ?? destField];
    const value = typeof raw === "string" ? raw.trim() : raw;
    const cast = rule.type && casters[rule.type];
    out[destField] = cast ? cast(value) : value === undefined ? null : value;
  }
  return out;
}

module.exports = { validators, isValidObjectId, validateRow, validateRows, mapRow };
