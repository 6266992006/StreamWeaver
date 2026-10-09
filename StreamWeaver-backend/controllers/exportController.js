const mongoose = require("mongoose");
const Dataset = require("../models/Dataset");
const DatasetRow = require("../models/DatasetRow");
const TransformJob = require("../models/TransformJob");
const { toCsvRow } = require("../utils/csvFormat");
const { buildErrorReport, reportToCsv, reportFileName, safeFileBase } = require("../utils/errorReportGenerator");

const SUPPORTED_FORMATS = ["csv", "json"];

async function findOwnedDataset(datasetId, ownerId) {
  if (!mongoose.Types.ObjectId.isValid(datasetId)) return null;
  return Dataset.findOne({ _id: datasetId, ownerId }).lean();
}

// Streams every row as a single JSON array, without ever building the
// full array in memory — "[" then each row's JSON separated by commas,
// then "]", written straight to the response as the cursor yields rows.
async function streamJson(cursor, res) {
  res.write("[");
  let first = true;
  for await (const row of cursor) {
    res.write((first ? "" : ",") + JSON.stringify(row.data ?? {}));
    first = false;
  }
  res.write("]");
  res.end();
}

// Streams a CSV: column headers from the first row's keys (every row in a
// dataset comes from the same mapping config, so the shape is consistent),
// then one escaped row per document. A 0-row dataset ends with no header
// at all — there's nothing to name columns after.
async function streamCsv(cursor, res) {
  let columns = null;
  for await (const row of cursor) {
    const data = row.data ?? {};
    if (!columns) {
      columns = Object.keys(data);
      res.write(toCsvRow(columns) + "\r\n");
    }
    res.write(toCsvRow(columns.map((col) => data[col])) + "\r\n");
  }
  res.end();
}

// @route  GET /api/export/:datasetId?format=csv|json  (protected)
// Streams a cursor over DatasetRow straight to the response — a
// multi-million-row dataset exports the same way a 10-row one does,
// never buffered fully in memory on the server.
exports.exportDataset = async (req, res) => {
  const { datasetId } = req.params;
  const format = String(req.query.format || "csv").toLowerCase();

  if (!SUPPORTED_FORMATS.includes(format)) {
    return res.status(400).json({
      success: false,
      message: `format must be one of: ${SUPPORTED_FORMATS.join(", ")}`,
    });
  }

  const dataset = await findOwnedDataset(datasetId, req.userId);
  if (!dataset) {
    return res.status(404).json({ success: false, message: "Dataset not found" });
  }

  const baseName = safeFileBase(dataset.originalFileName, "export");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.${format}"`);
  res.setHeader(
    "Content-Type",
    format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8"
  );

  const cursor = DatasetRow.find({ datasetId: dataset._id }).sort({ rowNumber: 1 }).lean().cursor();

  try {
    await (format === "json" ? streamJson(cursor, res) : streamCsv(cursor, res));
  } catch (err) {
    console.error("Export stream error:", err.message);
    // Headers (and likely some body) are already sent by this point, so a
    // JSON error response isn't possible — just stop the stream cleanly.
    res.end();
  }
};

// @route  GET /api/export/job/:jobId/errors?format=csv|json  (protected)
// Downloadable report of the rows that failed validation in one import run.
// The error log is capped server-side (rowsFailed is the true total), so the
// report carries `truncated` — as a JSON field, and as X-* headers for CSV —
// to say when the file lists fewer rows than actually failed.
exports.exportJobErrors = async (req, res) => {
  try {
    const { jobId } = req.params;
    const format = String(req.query.format || "csv").toLowerCase();

    if (!SUPPORTED_FORMATS.includes(format)) {
      return res.status(400).json({
        success: false,
        message: `format must be one of: ${SUPPORTED_FORMATS.join(", ")}`,
      });
    }
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: "Invalid job id" });
    }

    // ownerId in the filter: someone else's job looks exactly like a missing one.
    const job = await TransformJob.findOne({ _id: jobId, ownerId: req.userId })
      .select("datasetId status totalRows rowsProcessed rowsFailed errorLog")
      .lean();
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const dataset = await Dataset.findOne({ _id: job.datasetId, ownerId: req.userId })
      .select("originalFileName")
      .lean();
    const report = buildErrorReport(job, dataset?.originalFileName);

    res.setHeader("Content-Disposition", `attachment; filename="${reportFileName(report.fileName, format)}"`);
    res.setHeader("X-Total-Failed", String(report.rowsFailed));
    res.setHeader("X-Errors-Included", String(report.included));
    res.setHeader("X-Errors-Truncated", String(report.truncated));
    // Lets the browser (cross-origin fetch/axios) read the X-* headers above.
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, X-Total-Failed, X-Errors-Included, X-Errors-Truncated");

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(JSON.stringify(report, null, 2));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.send(reportToCsv(report));
  } catch (err) {
    console.error("Error report export failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not build the error report" });
  }
};

// Exposed for unit tests only.
exports._internal = { findOwnedDataset, streamCsv, streamJson, SUPPORTED_FORMATS };
