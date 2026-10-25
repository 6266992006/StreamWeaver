const mongoose = require("mongoose");
const Dataset = require("../models/Dataset");
const DatasetRow = require("../models/DatasetRow");
const TransformJob = require("../models/TransformJob");
const { isAdmin } = require("../utils/roles");
const { toCsvRow } = require("../utils/csvFormat");
const { buildErrorReport, reportToCsv, reportFileName, safeFileBase } = require("../utils/errorReportGenerator");

const SUPPORTED_FORMATS = ["csv", "json"];

async function findOwnedDataset(datasetId, ownerId, admin = false) {
  if (!mongoose.Types.ObjectId.isValid(datasetId)) return null;
  return Dataset.findOne(admin ? { _id: datasetId } : { _id: datasetId, ownerId }).lean();
}

// ---------------------------------------------------------------------
// Streaming helpers (Week 4 Day 3)
//
// A multi-million-row export must never pile up in server memory. Three
// things make that true:
//   1. Backpressure — res.write() returns false when the socket's buffer is
//      full (a slow client); we wait for "drain" before pulling more rows
//      from MongoDB, so memory stays flat no matter how slow the download.
//   2. Abort — if the client disconnects, we stop reading the cursor
//      instead of pulling millions of rows nobody will receive.
//   3. Chunked writes — rows are joined into ~64KB chunks before each
//      write, far fewer syscalls than one write per row.
// ---------------------------------------------------------------------
const FLUSH_BYTES = 64 * 1024;
const CURSOR_BATCH_SIZE = 2000;
// An import that hasn't updated its job for this long is treated as crashed,
// not "still running" — otherwise a dead job would block exports forever.
const STALE_JOB_MS = 2 * 60 * 1000;

function createSink(res) {
  let buffer = "";
  let aborted = false;
  const canListen = typeof res.once === "function";

  // 'close' fires when the client goes away (and also after a normal end —
  // harmless, we're done by then).
  if (canListen) res.once("close", () => (aborted = true));

  async function flush() {
    if (!buffer || aborted) {
      buffer = "";
      return;
    }
    const chunk = buffer;
    buffer = "";
    const ok = res.write(chunk);
    if (ok === false && canListen && !aborted) {
      await new Promise((resolve) => {
        const done = () => {
          res.off("drain", done);
          res.off("close", done);
          resolve();
        };
        res.once("drain", done);
        res.once("close", done);
      });
    }
  }

  return {
    get aborted() {
      return aborted;
    },
    async push(text) {
      buffer += text;
      if (buffer.length >= FLUSH_BYTES) await flush();
    },
    async finish() {
      await flush();
      if (!aborted) res.end();
    },
  };
}

// Closes the MongoDB cursor if the loop stopped early (client left, error).
async function closeCursor(cursor) {
  if (cursor && typeof cursor.close === "function") {
    await Promise.resolve(cursor.close()).catch(() => {});
  }
}

// Streams every row as a single JSON array, without ever building the
// full array in memory — "[" then each row's JSON separated by commas,
// then "]", written to the response as the cursor yields rows.
async function streamJson(cursor, res) {
  const sink = createSink(res);
  await sink.push("[");
  let first = true;
  try {
    for await (const row of cursor) {
      if (sink.aborted) break;
      await sink.push((first ? "" : ",") + JSON.stringify(row.data ?? {}));
      first = false;
    }
    await sink.push("]");
  } finally {
    await closeCursor(cursor);
  }
  await sink.finish();
}

// Streams a CSV: column headers from the first row's keys (every row in a
// dataset comes from the same mapping config, so the shape is consistent),
// then one escaped row per document. A 0-row dataset ends with no header
// at all — there's nothing to name columns after.
async function streamCsv(cursor, res) {
  const sink = createSink(res);
  let columns = null;
  try {
    for await (const row of cursor) {
      if (sink.aborted) break;
      const data = row.data ?? {};
      if (!columns) {
        columns = Object.keys(data);
        await sink.push(toCsvRow(columns) + "\r\n");
      }
      await sink.push(toCsvRow(columns.map((col) => data[col])) + "\r\n");
    }
  } finally {
    await closeCursor(cursor);
  }
  await sink.finish();
}

// True if an import for this dataset is actively running, i.e. an export
// right now would silently be missing rows.
async function hasActiveImport(datasetId) {
  const since = new Date(Date.now() - STALE_JOB_MS);
  const job = await TransformJob.findOne({
    datasetId,
    status: { $in: ["pending", "processing"] },
    updatedAt: { $gte: since },
  })
    .select("_id")
    .lean();
  return Boolean(job);
}

// @route  GET /api/export/:datasetId?format=csv|json[&force=true]  (protected)
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

  try {
    const dataset = await findOwnedDataset(datasetId, req.userId, isAdmin(req));
    if (!dataset) {
      return res.status(404).json({ success: false, message: "Dataset not found" });
    }

    // Exporting mid-import would hand over a silently incomplete file.
    // ?force=true is the escape hatch for someone who wants it anyway.
    if (String(req.query.force) !== "true" && (await hasActiveImport(dataset._id))) {
      return res.status(409).json({
        success: false,
        message: "This file is still being imported, so the export would be incomplete. Wait for it to finish (or add ?force=true to download what's there so far).",
      });
    }

    const baseName = safeFileBase(dataset.originalFileName, "export");
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.${format}"`);
    res.setHeader(
      "Content-Type",
      format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8"
    );

    // Only the mapped fields leave MongoDB (not _id / datasetId / jobId), and
    // rows come back in big batches. The sort is served by the unique
    // { datasetId, rowNumber } index, so there's no in-memory sort.
    const cursor = DatasetRow.find({ datasetId: dataset._id }, { data: 1, rowNumber: 1, _id: 0 })
      .sort({ rowNumber: 1 })
      .lean()
      .cursor({ batchSize: CURSOR_BATCH_SIZE });

    try {
      await (format === "json" ? streamJson(cursor, res) : streamCsv(cursor, res));
    } catch (err) {
      console.error("Export stream error:", err.message);
      // Headers (and likely some body) are already sent by this point, so a
      // JSON error response isn't possible — just stop the stream cleanly.
      res.end();
    }
  } catch (err) {
    console.error("Export failed:", err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: "Could not export this file" });
    }
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
    const admin = isAdmin(req);
    const job = await TransformJob.findOne(admin ? { _id: jobId } : { _id: jobId, ownerId: req.userId })
      .select("datasetId status totalRows rowsProcessed rowsFailed errorLog")
      .lean();
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const dataset = await Dataset.findOne(admin ? { _id: job.datasetId } : { _id: job.datasetId, ownerId: req.userId })
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
exports._internal = { findOwnedDataset, streamCsv, streamJson, createSink, hasActiveImport, SUPPORTED_FORMATS, FLUSH_BYTES };
