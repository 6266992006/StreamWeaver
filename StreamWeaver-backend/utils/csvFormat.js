/**
 * Minimal RFC 4180-style CSV field escaping. A field only needs quoting
 * when it contains a comma, a quote, or a newline — those are the only
 * characters that would otherwise break the column/row structure. Any
 * quote already in the value is doubled, per the CSV spec.
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  // A Date (the "date" column type) is written as a plain ISO timestamp — not
  // JSON.stringify'd, which would wrap it in extra quotes: "\"2024-01-01T…\"".
  // Other objects/arrays (nested data) are written as JSON.
  let str;
  if (value instanceof Date) str = Number.isNaN(value.getTime()) ? "" : value.toISOString();
  else if (typeof value === "object") str = JSON.stringify(value);
  else str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values) {
  return values.map(escapeCsvField).join(",");
}

module.exports = { escapeCsvField, toCsvRow };
