/**
 * Week 4 (Day 2): builds the downloadable error report for one import run.
 *
 * The data comes from TransformJob.errorLog — [{ row, reason }], where `row`
 * is the 1-based data-row number (row 1 = first row after the CSV header)
 * and `reason` is one or more messages joined with "; ". JobTracker caps
 * that log at MAX_ERROR_LOG entries, while rowsFailed holds the true total,
 * so a report can legitimately contain fewer rows than rowsFailed. The
 * report says so (`truncated`) instead of pretending to be complete.
 *
 * Pure functions only (no DB, no Express) so they are easy to unit-test.
 */
const { toCsvRow } = require("./csvFormat");

// Same buckets the frontend's error filter uses (src/utils/errorUtils.js),
// so a "Wrong format" filter on screen matches the "type" column in the file.
function categorizeReason(reason) {
  const r = String(reason ?? "").toLowerCase();
  if (r.includes("is required")) return "Missing value";
  if (r.includes("must be a valid")) return "Wrong format";
  if (/duplicate|e11000|database|insert|write|batch/.test(r)) return "Database";
  return "Other";
}

// A cell starting with = + - @ is run as a formula when the CSV is opened in
// Excel/Sheets. Reasons embed user-chosen field names, so neutralise them
// with a leading apostrophe (the standard CSV-injection mitigation).
function neutraliseFormula(text) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

// Turns a stored job (+ its dataset's file name) into the report object.
function buildErrorReport(job, fileName) {
  const errors = (job.errorLog || [])
    .map(({ row, reason }) => ({
      row: Number.isFinite(row) ? row : null,
      type: categorizeReason(reason),
      reason: String(reason ?? "Unknown error"),
    }))
    .sort((a, b) => (a.row ?? Infinity) - (b.row ?? Infinity));

  const rowsFailed = job.rowsFailed ?? 0;
  return {
    jobId: String(job._id),
    fileName: fileName || null,
    status: job.status,
    totalRows: job.totalRows ?? 0,
    rowsProcessed: job.rowsProcessed ?? 0,
    rowsFailed,
    included: errors.length,
    truncated: rowsFailed > errors.length,
    errors,
  };
}

// CSV text: header + one line per failed row. A report with no failures is
// just the header, so "no errors" is a valid, openable file.
function reportToCsv(report) {
  const lines = [toCsvRow(["row", "type", "reason"])];
  for (const e of report.errors) {
    lines.push(toCsvRow([e.row, e.type, neutraliseFormula(e.reason)]));
  }
  return lines.join("\r\n") + "\r\n";
}

// File names go into a Content-Disposition header: keep to plain ASCII so a
// quote, newline or non-Latin character in an uploaded name can't break (or
// be injected into) the header.
function safeFileBase(fileName, fallback = "export") {
  const base = String(fileName || "").replace(/\.[^/.]+$/, "");
  const cleaned = base.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/^[. ]+|[. ]+$/g, "");
  // Nothing usable left (e.g. an all-non-Latin name became "_"): use the fallback.
  return /^_*$/.test(cleaned) ? fallback : cleaned;
}

function reportFileName(fileName, format) {
  return `${safeFileBase(fileName, "import")}-errors.${format}`;
}

module.exports = { buildErrorReport, reportToCsv, reportFileName, safeFileBase, categorizeReason, neutraliseFormula };
