/**
 * Minimal RFC 4180-style CSV field escaping. A field only needs quoting
 * when it contains a comma, a quote, or a newline — those are the only
 * characters that would otherwise break the column/row structure. Any
 * quote already in the value is doubled, per the CSV spec.
 */
function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values) {
  return values.map(escapeCsvField).join(",");
}

module.exports = { escapeCsvField, toCsvRow };
