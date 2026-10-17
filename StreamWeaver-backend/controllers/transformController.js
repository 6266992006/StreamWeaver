const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const busboy = require("busboy");
const ivm = require("isolated-vm");
const SandboxRunner = require("../sandbox/sandboxRunner");
const RowSandbox = require("../sandbox/rowSandbox");
const transformStore = require("../models/transformStore");
const outputFileStore = require("../models/outputFileStore");
const CsvLineStream = require("../streams/csvLineStream");
const CsvRowToJsonStream = require("../streams/csvRowToJsonStream");
const FieldTransformStream = require("../streams/fieldTransformStream");
const NdjsonStringifyStream = require("../streams/ndjsonStringifyStream");
const RowWrapStream = require("../streams/rowWrapStream");
const BufferedBulkInserter = require("../streams/bufferedBulkInserter");
const ProcessedRow = require("../models/ProcessedRow");
const User = require("../models/User");
const { sendCompletionNotificationEmail } = require("../utils/emailService");

const runner = new SandboxRunner({ memoryLimitMb: 8, timeoutMs: 1000 });

// Where Day 5's generated NDJSON output files live. Fixed, never built
// from user input, so there is no path-traversal surface here — the
// only user-influenced piece is fileId, and that's validated against a
// strict hex pattern before it's ever used to build a path (see
// downloadOutput below).
const OUTPUT_DIR = path.join(__dirname, "..", "outputs");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// @route  POST /api/sandbox/run  (protected) — Week 3 Day 1
// Body: { "code": "value.toUpperCase()", "value": "hello" }
exports.runSnippet = async (req, res) => {
  const { code, value } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ success: false, message: "code (string) is required" });
  }

  try {
    const result = await runner.run(code, { value: value !== undefined ? value : null });
    return res.status(200).json({ success: true, result });
  } catch (err) {
    // Timeout, syntax error, runtime error inside the sandbox, or
    // memory limit — all land here. The sandbox contained the damage;
    // we just report it back as a normal 400, server stays healthy.
    return res.status(400).json({
      success: false,
      message: "Sandbox execution failed",
      error: err.message,
    });
  }
};

// @route  POST /api/sandbox/transform-row  (protected) — Week 3 Day 2
// Body: {
//   "row": { "name": "john doe", "score": "21" },
//   "fieldTransforms": { "name": "value.toUpperCase()", "score": "Number(value) * 2" }
// }
exports.transformRow = async (req, res) => {
  const { row, fieldTransforms } = req.body;

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return res.status(400).json({ success: false, message: "row (object) is required" });
  }
  if (!fieldTransforms || typeof fieldTransforms !== "object" || Array.isArray(fieldTransforms)) {
    return res.status(400).json({ success: false, message: "fieldTransforms (object) is required" });
  }

  const sandbox = new RowSandbox(fieldTransforms, { memoryLimitMb: 16, timeoutMs: 200 });
  try {
    await sandbox.init();
    const transformed = await sandbox.transformRow(row);
    return res.status(200).json({ success: true, original: row, transformed });
  } catch (err) {
    return res.status(400).json({ success: false, message: "Row transform failed", error: err.message });
  } finally {
    sandbox.dispose();
  }
};

/**
 * Validates that every script in fieldTransforms at least COMPILES
 * (catches syntax errors like `value.toUpperCase(` immediately). This
 * does not guarantee it will run without error against real data —
 * runtime errors (e.g. calling .toUpperCase() on a number) still
 * surface later, per-row, when the pipeline actually runs it — but it
 * stops the obviously broken configs at save time instead of failing
 * silently deep into a 50,000-row upload.
 */
async function validateFieldTransforms(fieldTransforms) {
  const isolate = new ivm.Isolate({ memoryLimit: 8 });
  try {
    for (const [field, expr] of Object.entries(fieldTransforms)) {
      try {
        await isolate.compileScript(expr);
      } catch (err) {
        throw new Error(`Invalid script for field "${field}": ${err.message}`);
      }
    }
  } finally {
    isolate.dispose();
  }
}

// @route  POST /api/sandbox/config  (protected) — Week 3 Day 3
// Body: { "fieldTransforms": { "name": "value.toUpperCase()", "score": "Number(value) * 2" } }
// Saves a per-user set of field-level JS transforms, after validating
// each one compiles. Day 4/5 pull this saved config into the streaming
// pipeline — same relationship as Week 2 Day 3's /api/mapping.
exports.saveConfig = async (req, res) => {
  const { fieldTransforms } = req.body;

  if (!fieldTransforms || typeof fieldTransforms !== "object" || Array.isArray(fieldTransforms)) {
    return res.status(400).json({
      success: false,
      message: "fieldTransforms is required and must be an object of { fieldName: jsExpression }",
    });
  }
  if (Object.keys(fieldTransforms).length === 0) {
    return res.status(400).json({ success: false, message: "fieldTransforms cannot be empty" });
  }

  try {
    await validateFieldTransforms(fieldTransforms);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  transformStore.setTransformConfig(req.userId, fieldTransforms);

  return res.status(200).json({
    success: true,
    message: "Transform config saved",
    fieldTransforms,
  });
};

// @route  GET /api/sandbox/config  (protected) — Week 3 Day 3
exports.getConfig = (req, res) => {
  const saved = transformStore.getTransformConfig(req.userId);

  if (!saved) {
    return res.status(404).json({ success: false, message: "No transform config set yet" });
  }

  return res.status(200).json({ success: true, ...saved });
};

// @route  POST /api/sandbox/transform-upload  (protected) — Week 3 Day 4
// Upload a CSV, stream it through CsvLineStream -> CsvRowToJsonStream ->
// FieldTransformStream, applying the user's SAVED transform config
// (from Day 3) to every row live as it streams — no separate call per
// row (that was Day 2), no buffering the whole file into memory.
//
// Requires a transform config to already be saved via
// POST /api/sandbox/config, same relationship Week 2 Day 4 had with
// its saved column mapping.
exports.transformUpload = async (req, res) => {
  const saved = transformStore.getTransformConfig(req.userId);

  if (!saved) {
    return res.status(404).json({
      success: false,
      message: "No transform config set yet — POST /api/sandbox/config first",
    });
  }

  let transformStream;
  try {
    transformStream = await FieldTransformStream.create(saved.fieldTransforms, {
      memoryLimitMb: 16,
      timeoutMs: 200,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to initialize sandbox", error: err.message });
  }

  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  let fileReceived = false;
  let responded = false;
  const previewRows = [];

  const sendOnce = (status, body) => {
    if (responded) return;
    responded = true;
    transformStream.dispose();
    res.status(status).json(body);
  };

  bb.on("file", (fieldname, fileStream, info) => {
    fileReceived = true;
    const lineStream = new CsvLineStream();
    const jsonStream = new CsvRowToJsonStream();

    fileStream.pipe(lineStream).pipe(jsonStream).pipe(transformStream);

    transformStream.on("data", (row) => {
      if (previewRows.length < 5) previewRows.push(row);
    });
    transformStream.on("end", () => {
      sendOnce(200, {
        success: true,
        fileName: info.filename,
        headers: jsonStream.headers,
        totalRows: transformStream.rowCount,
        fieldTransforms: saved.fieldTransforms,
        preview: previewRows,
      });
    });
    // A bad script on real data (e.g. `.toUpperCase()` on a numeric
    // field) surfaces here as a stream error — the sandbox already
    // contained the damage, we just report it cleanly.
    transformStream.on("error", (err) => {
      sendOnce(400, { success: false, message: "Transform failed during streaming", error: err.message });
    });
    jsonStream.on("error", (err) => {
      sendOnce(500, { success: false, message: "Failed to convert CSV rows to JSON", error: err.message });
    });
    lineStream.on("error", (err) => {
      sendOnce(500, { success: false, message: "Failed to parse file into lines", error: err.message });
    });
  });

  bb.on("close", () => {
    if (!fileReceived) sendOnce(400, { success: false, message: "No file received" });
  });
  bb.on("error", (err) => {
    sendOnce(500, { success: false, message: "Upload failed", error: err.message });
  });

  req.pipe(bb);
};

// A download token must look like this (32 bytes hex) or it's rejected
// outright before ever touching the filesystem or the store.
const FILE_ID_PATTERN = /^[a-f0-9]{64}$/;

// @route  POST /api/sandbox/transform-download  (protected) — Week 3 Day 5
// Same pipeline as Day 4's transform-upload, but instead of just
// returning a preview, the FULL transformed output is streamed straight
// to an NDJSON file on disk (never buffered in memory) and the caller
// gets back a one-time fileId to fetch it with via GET
// /api/sandbox/download/:fileId. This is the "end-to-end" piece Day 4
// explicitly left for today: upload -> parse -> transform -> save ->
// download, all without the server ever holding the whole file in RAM.
exports.transformUploadToFile = async (req, res) => {
  const saved = transformStore.getTransformConfig(req.userId);

  if (!saved) {
    return res.status(404).json({
      success: false,
      message: "No transform config set yet — POST /api/sandbox/config first",
    });
  }

  let transformStream;
  try {
    transformStream = await FieldTransformStream.create(saved.fieldTransforms, {
      memoryLimitMb: 16,
      timeoutMs: 200,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to initialize sandbox", error: err.message });
  }

  const fileId = crypto.randomBytes(32).toString("hex");
  const outputPath = path.join(OUTPUT_DIR, `${fileId}.ndjson`);

  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  let fileReceived = false;
  let responded = false;

  const cleanupPartialFile = () => {
    fs.unlink(outputPath, () => {}); // best-effort; file may not exist yet
  };

  const sendOnce = (status, body) => {
    if (responded) return;
    responded = true;
    transformStream.dispose();
    if (status >= 400) cleanupPartialFile();
    res.status(status).json(body);
  };

  bb.on("file", (fieldname, fileStream, info) => {
    fileReceived = true;
    const lineStream = new CsvLineStream();
    const jsonStream = new CsvRowToJsonStream();
    const ndjsonStream = new NdjsonStringifyStream();
    const writeStream = fs.createWriteStream(outputPath);

    fileStream.pipe(lineStream).pipe(jsonStream).pipe(transformStream).pipe(ndjsonStream).pipe(writeStream);

    writeStream.on("finish", () => {
      outputFileStore.registerFile(fileId, {
        userId: req.userId,
        filePath: outputPath,
        fileName: `${(info.filename || "output").replace(/\.csv$/i, "")}.ndjson`,
        rowCount: transformStream.rowCount,
      });
      sendOnce(200, {
        success: true,
        message: "File transformed and saved. Use fileId to download it.",
        fileId,
        fileName: `${(info.filename || "output").replace(/\.csv$/i, "")}.ndjson`,
        totalRows: transformStream.rowCount,
        fieldTransforms: saved.fieldTransforms,
        downloadUrl: `/api/sandbox/download/${fileId}`,
      });
    });
    writeStream.on("error", (err) => {
      sendOnce(500, { success: false, message: "Failed to write output file", error: err.message });
    });
    // A bad script on real data surfaces here as a stream error — same
    // as Day 4. The partial output file is deleted (see sendOnce).
    transformStream.on("error", (err) => {
      sendOnce(400, { success: false, message: "Transform failed during streaming", error: err.message });
    });
    jsonStream.on("error", (err) => {
      sendOnce(500, { success: false, message: "Failed to convert CSV rows to JSON", error: err.message });
    });
    lineStream.on("error", (err) => {
      sendOnce(500, { success: false, message: "Failed to parse file into lines", error: err.message });
    });
  });

  bb.on("close", () => {
    if (!fileReceived) sendOnce(400, { success: false, message: "No file received" });
  });
  bb.on("error", (err) => {
    sendOnce(500, { success: false, message: "Upload failed", error: err.message });
  });

  req.pipe(bb);
};

// @route  GET /api/sandbox/download/:fileId  (protected) — Week 3 Day 5
// Streams a previously generated output file back to its owner. Two
// independent checks before any file I/O happens:
//   1. fileId must match the strict 64-char-hex shape — anything else
//      (dots, slashes, short ids) is rejected immediately, so there is
//      no way to turn this into a path-traversal read of an arbitrary
//      file on disk.
//   2. The file's registered userId must match req.userId — otherwise
//      we return the SAME 404 as "file doesn't exist" (never a 403),
//      so a caller can't use this endpoint to probe which fileIds exist
//      for other users.
exports.downloadOutput = (req, res) => {
  const { fileId } = req.params;

  if (!FILE_ID_PATTERN.test(fileId)) {
    return res.status(400).json({ success: false, message: "Invalid fileId" });
  }

  const record = outputFileStore.getFile(fileId);

  if (!record || record.userId !== req.userId) {
    return res.status(404).json({ success: false, message: "File not found" });
  }

  if (!fs.existsSync(record.filePath)) {
    return res.status(404).json({ success: false, message: "File not found" });
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Content-Disposition", `attachment; filename="${record.fileName}"`);
  const readStream = fs.createReadStream(record.filePath);
  readStream.on("error", () => {
    if (!res.headersSent) res.status(500).json({ success: false, message: "Failed to read file" });
  });
  readStream.pipe(res);
};

// @route  POST /api/sandbox/transform-upload-db  (protected) — Week 4 Day 4
// Same CSV -> parse -> saved-transform pipeline as Week 3 Day 4/5, but
// the final sink is MongoDB instead of an NDJSON file: rows are wrapped
// with { userId, jobId, data } (RowWrapStream) and fed into
// BufferedBulkInserter (Day 3), which buffers up to 5000 rows at a time
// and fires one bulkWrite per batch against the ProcessedRow collection
// — never one insert per row, never the whole file in memory.
//
// Requires a saved transform config (Day 3 of Week 3), same as
// transform-upload / transform-download.
exports.transformUploadToDb = async (req, res) => {
  const saved = transformStore.getTransformConfig(req.userId);

  if (!saved) {
    return res.status(404).json({
      success: false,
      message: "No transform config set yet — POST /api/sandbox/config first",
    });
  }

  let transformStream;
  try {
    transformStream = await FieldTransformStream.create(saved.fieldTransforms, {
      memoryLimitMb: 16,
      timeoutMs: 200,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to initialize sandbox", error: err.message });
  }

  const jobId = crypto.randomBytes(16).toString("hex");
  const bb = busboy({ headers: req.headers, limits: { fileSize: 5 * 1024 * 1024 * 1024 } });
  let fileReceived = false;
  let responded = false;

  const sendOnce = (status, body) => {
    if (responded) return;
    responded = true;
    transformStream.dispose();
    res.status(status).json(body);
  };

  bb.on("file", (fieldname, fileStream, info) => {
    fileReceived = true;
    const lineStream = new CsvLineStream();
    const jsonStream = new CsvRowToJsonStream();
    const wrapStream = new RowWrapStream({ userId: req.userId, jobId });
    const inserter = new BufferedBulkInserter(ProcessedRow, { batchSize: 5000, extraFields: {} });

    fileStream.pipe(lineStream).pipe(jsonStream).pipe(transformStream).pipe(wrapStream).pipe(inserter);

    const batches = [];
    inserter.on("batchFlushed", (info) => batches.push(info));

    inserter.on("finish", () => {
      sendOnce(200, {
        success: true,
        message: "File transformed and bulk-inserted into MongoDB",
        jobId,
        fileName: info.filename,
        headers: jsonStream.headers,
        totalRows: inserter.stats.totalInserted,
        batches: inserter.stats.batchesFlushed,
        fieldTransforms: saved.fieldTransforms,
      });

      // Week 4 Day 5 — completion-notification email, fired AFTER the
      // HTTP response is already on its way. The job succeeded the
      // moment the last batch was inserted; notifying the user is a
      // side effect, not something the caller should have to wait on.
      // Any failure here (no DB, no such user, SMTP down) is logged and
      // swallowed — it must never surface as a failure of the upload
      // that already succeeded.
      User.findById(req.userId)
        .select("email")
        .then((user) => {
          if (!user) return;
          return sendCompletionNotificationEmail(user.email, {
            fileName: info.filename,
            totalRows: inserter.stats.totalInserted,
            batches: inserter.stats.batchesFlushed,
          });
        })
        .catch((err) => {
          console.error("Completion notification email failed (non-fatal):", err.message);
        });
    });
    // A DB error (bulkWrite failure — bad connection, validation, etc.)
    // or a bad script on real data both surface here as a stream error.
    // The sandbox / DB layer already contained the damage; we just
    // report it cleanly and the server stays up.
    inserter.on("error", (err) => {
      sendOnce(500, { success: false, message: "Bulk insert failed", error: err.message });
    });
    transformStream.on("error", (err) => {
      sendOnce(400, { success: false, message: "Transform failed during streaming", error: err.message });
    });
    jsonStream.on("error", (err) => {
      sendOnce(500, { success: false, message: "Failed to convert CSV rows to JSON", error: err.message });
    });
    lineStream.on("error", (err) => {
      sendOnce(500, { success: false, message: "Failed to parse file into lines", error: err.message });
    });
  });

  bb.on("close", () => {
    if (!fileReceived) sendOnce(400, { success: false, message: "No file received" });
  });
  bb.on("error", (err) => {
    sendOnce(500, { success: false, message: "Upload failed", error: err.message });
  });

  req.pipe(bb);
};

// jobId is always a 32-char hex string (crypto.randomBytes(16).toString("hex")),
// generated server-side in transformUploadToDb — never trust a user-supplied
// one without checking its shape first.
const JOB_ID_PATTERN = /^[a-f0-9]{32}$/;

// @route  GET /api/sandbox/job/:jobId/status  (protected) — Week 4 Day 5
// Rounds out the jobId that transformUploadToDb (Day 4) started tagging
// every inserted row with: lets the caller ask "how many rows actually
// landed for this job?" by counting ProcessedRow documents scoped to
// BOTH jobId and req.userId — so, like Week 3 Day 5's file download,
// one user can never probe whether another user's jobId exists.
exports.getJobStatus = async (req, res) => {
  const { jobId } = req.params;

  if (!JOB_ID_PATTERN.test(jobId)) {
    return res.status(400).json({ success: false, message: "Invalid jobId" });
  }

  try {
    const rowCount = await ProcessedRow.countDocuments({ userId: req.userId, jobId });

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: "No rows found for this job" });
    }

    return res.status(200).json({ success: true, jobId, rowCount });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch job status", error: err.message });
  }
};
