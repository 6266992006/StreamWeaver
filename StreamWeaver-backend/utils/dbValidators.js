const mongoose = require("mongoose");

/**
 * Week 2 (Day 2): Reusable field/schema validation helpers.
 *
 * Rows get checked against the user's column-mapping config *before*
 * they're handed to BulkInserter, so bad rows never reach MongoDB —
 * they get collected instead, in the shape TransformJob.errorLog
 * expects ({ row, reason }), ready for the Week 3/4 error UI + report.
 */

// Basic per-type checks. Empty/undefined values are treated as "not my
// problem" here — `required` is the rule that actually rejects blanks.
const validators = {
  required: (value) =>
    value !== undefined && value !== null && String(value).trim() !== "",

  number: (value) =>
    value === "" || value === undefined || value === null || !isNaN(Number(value)),

  email: (value) =>
    !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)),

  date: (value) => !value || !isNaN(Date.parse(value)),

  boolean: (value) =>
    value === undefined ||
    value === null ||
    value === "" ||
    ["true", "false", "0", "1", true, false].includes(value),
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Validate a single row against a mapping config.
 *
 * mappingConfig shape: {
 *   destinationField: { source: "csvColumnName", type: "number", required: true }
 * }
 *
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
 * @returns {{
 *   validRows: object[],
 *   invalidRows: { row: number, reason: string }[]  // row = index in the batch
 * }}
 */
function validateRows(rows, mappingConfig = {}) {
  const validRows = [];
  const invalidRows = [];

  rows.forEach((row, index) => {
    const { valid, errors } = validateRow(row, mappingConfig);
    if (valid) {
      validRows.push(row);
    } else {
      invalidRows.push({
        row: index,
        reason: errors.map((e) => e.reason).join("; "),
      });
    }
  });

  return { validRows, invalidRows };
}

module.exports = { validators, isValidObjectId, validateRow, validateRows };
