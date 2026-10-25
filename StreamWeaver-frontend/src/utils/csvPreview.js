// Client-side CSV preview parsing.
//
// Mirrors how the backend reads a CSV (streams/csvLineStream.js +
// csvRowToJsonStream.js): one record per line, "quoted, fields" and doubled
// quotes ("") supported, values trimmed. Quoted fields that span several lines
// are NOT supported by the backend, so the preview doesn't pretend to either —
// what you see here is what the import will see.

export const PREVIEW_ROW_LIMIT = 1000;
export const PREVIEW_BYTES = 2 * 1024 * 1024; // comfortably more than 1,000 CSV rows

export function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (insideQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      insideQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

// text: the first slice of the file. `isWholeFile` false means the slice was
// cut somewhere, so its last line may be half a row and is dropped.
export function parsePreview(text, { isWholeFile = true, rowLimit = PREVIEW_ROW_LIMIT } = {}) {
  // Excel's "CSV UTF-8" starts the file with a byte-order mark.
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let lines = clean.split(/\r\n|\n/);
  if (!isWholeFile) lines = lines.slice(0, -1);
  lines = lines.filter((line) => line.length > 0);
  if (lines.length === 0) return { columns: [], rows: [], rowsParsed: 0, bytesParsed: 0, rowsInSlice: 0 };

  const columns = splitCsvLine(lines[0]);
  const dataLines = lines.slice(1, rowLimit + 1);
  const rows = dataLines.map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i] ?? '';
    });
    return row;
  });

  // Bytes covered by the header + the rows we parsed (for the row estimate).
  const consumed = lines.slice(0, dataLines.length + 1).join('\n');
  return { columns, rows, rowsParsed: rows.length, rowsInSlice: lines.length - 1, bytesParsed: new TextEncoder().encode(consumed).length + dataLines.length };
}

// Rough total rows from the preview: average bytes per row x file size.
// Exact when the whole file fit in the preview.
export function estimateRows({ fileSize, bytesParsed, rowsParsed, rowsInSlice, isWholeFile }) {
  // The preview shows at most 1,000 rows, but a small file was read entirely: count them all.
  if (isWholeFile) return rowsInSlice ?? rowsParsed;
  if (!rowsParsed || !bytesParsed) return 0;
  const bytesPerRow = bytesParsed / (rowsParsed + 1); // +1: the header line
  return Math.max(rowsParsed, Math.round(fileSize / bytesPerRow));
}

// Problems in the header row that would silently lose or mangle data.
export function headerIssues(columns) {
  const issues = [];
  const seen = new Map();
  columns.forEach((c, i) => {
    if (c === '') issues.push(`Column ${i + 1} has no name — it can't be mapped.`);
    seen.set(c, (seen.get(c) || 0) + 1);
  });
  for (const [name, count] of seen) {
    if (name !== '' && count > 1) {
      issues.push(`"${name}" appears ${count} times — only the last one is kept. Rename the duplicates in your file.`);
    }
  }
  return issues;
}
