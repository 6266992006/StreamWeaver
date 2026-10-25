/**
 * Week 4 — the HTTP side of an import, tying the pieces together:
 *
 *   browser ──(1) POST /api/jobs              { fileName, mapping, fieldTransforms }
 *                  -> creates a Dataset + a pending TransformJob, returns { jobId }
 *           ──(2) WebSocket subscribe(jobId)   live progress (sockets/progressSocket.js)
 *           ──(3) POST /api/jobs/:jobId/file   the CSV, streamed
 *                  -> CsvLine -> CsvRowToJson -> sandboxed JS transforms
 *                  -> validate + map -> buffered bulkWrite (streams/importPipeline.js)
 *
 * Two requests (not one) because a browser only sees a response after the
 * whole upload has finished — the UI needs the jobId *before* that, to
 * subscribe to progress while the file is still streaming in.
 *
 * Nothing here buffers the file: bytes flow through Node streams with
 * backpressure, so a multi-GB CSV costs the same memory as a small one.
 */
const { pipeline } = require("node:stream");
const busboy = require("busboy");
const mongoose = require("mongoose");

const Dataset = require("../models/Dataset");
const TransformJob = require("../models/TransformJob");
const DatasetRow = require("../models/DatasetRow");
const User = require("../models/User");
const RowSandbox = require("../sandbox/rowSandbox");
const CsvLineStream = require("../streams/csvLineStream");
const CsvRowToJsonStream = require("../streams/csvRowToJsonStream");
const SandboxRowTransform = require("../streams/sandboxRowTransform");
const { runImportPipeline } = require("../streams/importPipeline");
const { JobTracker } = require("../utils/jobTracker");
const { sendCompletionNotificationEmail } = require("../utils/emailService");

const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB, same as the raw upload
const MAX_FIELDS = 500;
const MAX_TRANSFORMS = 100;
const MAX_NAME_LEN = 128;
const MAX_EXPR_LEN = 2000;
const COLUMN_TYPES = ["number", "email", "date", "boolean"]; // "string" = no type check

// Mongo field names can't contain "." or start with "$" — and a name that
// does would silently corrupt the stored documents.
const validFieldName = (name) =>
  typeof name === "string" &&
  name.length > 0 &&
  name.length <= MAX_NAME_LEN &&
  !name.includes(".") &&
  !name.startsWith("$") &&
  !/[\u0000-\u001f]/.test(name);

class BadRequest extends Error {}

// { destField: { source, type?, required? } }  ->  the cleaned config
function cleanMapping(mapping) {
  if (mapping == null) return {};
  if (typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new BadRequest("mapping must be an object of { destinationField: { source, type, required } }");
  }
  const entries = Object.entries(mapping);
  if (entries.length > MAX_FIELDS) throw new BadRequest(`mapping can have at most ${MAX_FIELDS} fields`);

  const out = {};
  for (const [dest, rule] of entries) {
    if (!validFieldName(dest)) {
      throw new BadRequest(`"${String(dest).slice(0, 40)}" isn't a valid field name (no dots, can't start with $)`);
    }
    if (!rule || typeof rule !== "object" || typeof rule.source !== "string" || rule.source === "") {
      throw new BadRequest(`mapping for "${dest}" needs a source column`);
    }
    const cleaned = { source: rule.source };
    if (rule.type && rule.type !== "string") {
      if (!COLUMN_TYPES.includes(rule.type)) {
        throw new BadRequest(`type for "${dest}" must be one of: string, ${COLUMN_TYPES.join(", ")}`);
      }
      cleaned.type = rule.type;
    }
    if (rule.required) cleaned.required = true;
    out[dest] = cleaned;
  }
  return out;
}

// { sourceColumn: "jsExpression" } — and the scripts must actually compile.
async function cleanTransforms(fieldTransforms) {
  if (fieldTransforms == null) return {};
  if (typeof fieldTransforms !== "object" || Array.isArray(fieldTransforms)) {
    throw new BadRequest("fieldTransforms must be an object of { column: jsExpression }");
  }
  const entries = Object.entries(fieldTransforms);
  if (entries.length > MAX_TRANSFORMS) throw new BadRequest(`at most ${MAX_TRANSFORMS} transforms are allowed`);

  const out = {};
  for (const [column, expr] of entries) {
    if (typeof expr !== "string" || expr.trim() === "") continue; // blank = no transform
    if (expr.length > MAX_EXPR_LEN) throw new BadRequest(`the transform for "${column}" is too long`);
    out[column] = expr;
  }
  if (Object.keys(out).length === 0) return out;

  const sandbox = new RowSandbox(out, { memoryLimitMb: 8, timeoutMs: 200 });
  try {
    await sandbox.init(); // compiles every script; a syntax error throws here
  } catch (err) {
    throw new BadRequest(`A transform doesn't compile: ${err.message}`);
  } finally {
    sandbox.dispose();
  }
  return out;
}

// @route  POST /api/jobs  (protected)
// Body: { fileName, sizeBytes?, columns?, estimatedRows?, mapping?, fieldTransforms? }
exports.createImportJob = async (req, res) => {
  try {
    const { fileName, sizeBytes, columns, estimatedRows } = req.body || {};
    if (typeof fileName !== "string" || fileName.trim() === "" || fileName.length > 255) {
      return res.status(400).json({ success: false, message: "fileName is required" });
    }

    const mappingConfig = cleanMapping(req.body.mapping);
    const fieldTransforms = await cleanTransforms(req.body.fieldTransforms);

    const dataset = await Dataset.create({
      ownerId: req.userId,
      originalFileName: fileName.trim(),
      storedFileName: `streamed-${Date.now()}`, // the CSV itself is streamed through, not kept
      fileSizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
      columns: Array.isArray(columns) ? columns.filter((c) => typeof c === "string").slice(0, MAX_FIELDS) : [],
      status: "uploaded",
    });

    const job = await TransformJob.create({
      datasetId: dataset._id,
      ownerId: req.userId,
      mappingConfig,
      fieldTransforms,
      status: "pending",
      // Only a hint so the progress bar has a denominator while rows stream in.
      totalRows: Number.isFinite(estimatedRows) && estimatedRows > 0 ? Math.round(estimatedRows) : 0,
    });

    return res.status(201).json({
      success: true,
      jobId: String(job._id),
      datasetId: String(dataset._id),
    });
  } catch (err) {
    if (err instanceof BadRequest) {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error("Create import job error:", err.message);
    return res.status(500).json({ success: false, message: "Could not create the import job" });
  }
};

// @route  POST /api/jobs/:jobId/file  (protected, multipart)
// Streams the CSV through the whole pipeline and answers when it's done.
exports.uploadImportFile = async (req, res) => {
  const { jobId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return res.status(400).json({ success: false, message: "Invalid job id" });
  }

  // Claim the job: only a pending job owned by this user can start, and only
  // once — a double-click or retry can't run the same import twice.
  let job;
  try {
    job = await TransformJob.findOneAndUpdate(
      { _id: jobId, ownerId: req.userId, status: "pending" },
      { $set: { status: "processing", startedAt: new Date() } },
      { new: true }
    ).lean();
    if (!job) {
      const exists = await TransformJob.exists({ _id: jobId, ownerId: req.userId });
      return exists
        ? res.status(409).json({ success: false, message: "This import has already been started" })
        : res.status(404).json({ success: false, message: "Job not found" });
    }
  } catch (err) {
    console.error("Import claim error:", err.message);
    return res.status(500).json({ success: false, message: "Could not start the import" });
  }

  let responded = false;
  const respond = (status, body) => {
    if (responded) return;
    responded = true;
    res.status(status).json(body);
  };
  const failJob = async (message) => {
    await TransformJob.updateOne(
      { _id: job._id, status: { $in: ["pending", "processing"] } },
      { $set: { status: "failed", errorMessage: String(message).slice(0, 500), finishedAt: new Date() } }
    ).catch(() => {});
    await Dataset.updateOne({ _id: job.datasetId }, { $set: { status: "failed" } }).catch(() => {});
  };

  let bb;
  try {
    bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_BYTES } });
  } catch {
    await failJob("Request was not a file upload");
    return respond(400, { success: false, message: "Send the CSV as multipart/form-data" });
  }

  let fileSeen = false;
  let transformStream = null;

  bb.on("file", (_field, fileStream) => {
    fileSeen = true;
    runFile(fileStream).catch(async (err) => {
      console.error("Import failed:", err.message);
      await failJob(err.message);
      respond(500, { success: false, jobId, message: "The import failed", error: err.message });
    });
  });

  async function runFile(fileStream) {
    fileStream.on("limit", () => fileStream.destroy(new Error("File exceeds the 5GB limit")));

    const lineStream = new CsvLineStream();
    const jsonStream = new CsvRowToJsonStream();
    const stages = [fileStream, lineStream, jsonStream];

    if (job.fieldTransforms && Object.keys(job.fieldTransforms).length > 0) {
      transformStream = await SandboxRowTransform.create(job.fieldTransforms);
      stages.push(transformStream);
    }
    // pipeline() (not .pipe) so an error or a dropped connection in ANY stage
    // tears the whole chain down instead of leaving streams hanging.
    const source = pipeline(...stages, () => {});

    const tracker = new JobTracker(job._id);
    const result = await runImportPipeline({
      source,
      mappingConfig: job.mappingConfig || {},
      model: DatasetRow,
      tracker,
      buildDocument: DatasetRow.toDocument(job.datasetId, job._id),
      totalRows: job.totalRows || 0,
    });

    await Dataset.updateOne(
      { _id: job.datasetId },
      {
        $set: {
          status: result.status === "done" ? "processed" : "failed",
          rowCount: result.rowsProcessed,
          columns: jsonStream.headers || [],
        },
      }
    ).catch(() => {});

    if (result.status !== "done") {
      return respond(500, { success: false, jobId, message: result.errorMessage || "The import failed" });
    }

    respond(200, {
      success: true,
      jobId,
      datasetId: String(job.datasetId),
      status: result.status,
      totalRows: result.totalRows,
      rowsProcessed: result.rowsProcessed,
      rowsFailed: result.rowsFailed,
      errorsTruncated: result.errorsTruncated,
      durationMs: result.durationMs,
    });

    notifyDone(req.userId, job, result);
  }

  bb.on("close", async () => {
    if (!fileSeen) {
      await failJob("No file received");
      respond(400, { success: false, message: "No file received" });
    }
  });
  bb.on("error", async (err) => {
    await failJob(err.message);
    respond(400, { success: false, message: "The upload could not be read", error: err.message });
  });

  // The user closed the tab / lost connection mid-upload.
  req.on("aborted", () => failJob("Upload cancelled before it finished"));
  res.on("close", () => transformStream && transformStream.dispose());

  req.pipe(bb);
};

// Completion email — a side effect AFTER the response, so any failure
// (no such user, SMTP down) is logged and never affects the import itself.
function notifyDone(userId, job, result) {
  Dataset.findById(job.datasetId)
    .select("originalFileName")
    .lean()
    .then(async (dataset) => {
      const user = await User.findById(userId).select("email").lean();
      if (!user) return;
      return sendCompletionNotificationEmail(user.email, {
        fileName: dataset?.originalFileName || "your file",
        totalRows: result.rowsProcessed,
        batches: result.batches,
      });
    })
    .catch((err) => console.error("Completion notification failed (non-fatal):", err.message));
}

exports._internal = { cleanMapping, cleanTransforms, validFieldName, BadRequest };
