const mongoose = require("mongoose");
const Dataset = require("../models/Dataset");
const DatasetRow = require("../models/DatasetRow");
const { toCsvRow } = require("../utils/csvFormat");

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

  const baseName = (dataset.originalFileName || "export").replace(/\.[^/.]+$/, "");
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

// Exposed for unit tests only.
exports._internal = { findOwnedDataset, streamCsv, streamJson, SUPPORTED_FORMATS };
