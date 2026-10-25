const Dataset = require("../models/Dataset");
const TransformJob = require("../models/TransformJob");
const User = require("../models/User");
const { isAdmin } = require("../utils/roles");

// Combines an uploaded file (Dataset) with its most recent import run
// (TransformJob, if any) into the row the Upload History dashboard shows.
//  - no job yet  -> status/counts come from the upload itself ("uploaded")
//  - has a job   -> status and live counters come from that job
// A job that hasn't been touched for this long while still "pending" or
// "processing" was abandoned — the tab was closed, the connection dropped, or
// the server restarted mid-import. Showing it as running forever would keep the
// dashboard polling and confuse the user, so it's reported as failed.
const STALE_JOB_MS = 15 * 60 * 1000;

function effectiveStatus(job, now = Date.now()) {
  if (!job) return null;
  if (job.status === "pending" || job.status === "processing") {
    const last = new Date(job.updatedAt || job.createdAt || now).getTime();
    if (now - last > STALE_JOB_MS) return "failed";
  }
  return job.status;
}

function buildHistoryItem(dataset, job, now = Date.now()) {
  const status = job ? effectiveStatus(job, now) : dataset.status;
  const abandoned = job && status === "failed" && job.status !== "failed";
  return {
    id: String(dataset._id),
    fileName: dataset.originalFileName,
    uploadedAt: dataset.createdAt,
    sizeBytes: dataset.fileSizeBytes ?? 0,
    status,
    totalRows: job?.totalRows || dataset.rowCount || 0,
    rowsProcessed: job?.rowsProcessed ?? 0,
    rowsFailed: job?.rowsFailed ?? 0,
    rowsPerSec: job?.rowsPerSec ?? 0,
    jobId: job ? String(job._id) : null,
    finishedAt: job?.finishedAt ?? null,
    errorMessage: abandoned ? "The import never finished — the page was closed or the connection dropped." : job?.errorMessage ?? null,
  };
}

// @route  GET /api/jobs  (protected)
// The logged-in user's upload history, newest first.
exports.getHistory = async (req, res) => {
  try {
    // ?scope=all is the admin view of everyone's imports.
    const wantsAll = req.query?.scope === "all";
    if (wantsAll && !isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const datasets = await Dataset.find(wantsAll ? {} : { ownerId: req.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // One query for all their jobs (errorLog excluded: it can be large),
    // newest first, so the first job seen per dataset is its latest run.
    const latestJobByDataset = new Map();
    if (datasets.length > 0) {
      const jobs = await TransformJob.find({ datasetId: { $in: datasets.map((d) => d._id) } })
        .sort({ createdAt: -1 })
        .select("-errorLog")
        .lean();
      for (const job of jobs) {
        const key = String(job.datasetId);
        if (!latestJobByDataset.has(key)) latestJobByDataset.set(key, job);
      }
    }

    const items = datasets.map((d) => buildHistoryItem(d, latestJobByDataset.get(String(d._id))));

    if (wantsAll && items.length > 0) {
      const owners = await User.find({ _id: { $in: [...new Set(datasets.map((d) => String(d.ownerId)))] } })
        .select("name email")
        .lean();
      const byId = new Map(owners.map((u) => [String(u._id), { name: u.name, email: u.email }]));
      datasets.forEach((d, i) => {
        items[i].owner = byId.get(String(d.ownerId)) || null;
      });
    }
    return res.status(200).json({ success: true, scope: wantsAll ? "all" : "mine", jobs: items });
  } catch (err) {
    console.error("History fetch error:", err.message);
    return res.status(500).json({ success: false, message: "Could not fetch upload history" });
  }
};

// @route  GET /api/jobs/:jobId/errors  (protected)
// The per-row failures of one import run, for the frontend's ErrorTable.
// `errors` is capped server-side (see JobTracker.MAX_ERROR_LOG); rowsFailed
// is the true total, so `truncated` tells the UI there are more than shown.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

exports.getJobErrors = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!OBJECT_ID_RE.test(jobId)) {
      return res.status(400).json({ success: false, message: "Invalid job id" });
    }

    // ownerId in the filter: someone else's job looks exactly like a missing one.
    const job = await TransformJob.findOne(isAdmin(req) ? { _id: jobId } : { _id: jobId, ownerId: req.userId })
      .select("status rowsFailed errorLog")
      .lean();
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    const errors = (job.errorLog || []).map(({ row, reason }) => ({ row, reason }));
    const rowsFailed = job.rowsFailed ?? 0;
    return res.status(200).json({
      success: true,
      jobId: String(job._id ?? jobId),
      status: job.status,
      rowsFailed,
      errors,
      truncated: rowsFailed > errors.length,
    });
  } catch (err) {
    console.error("Job errors fetch error:", err.message);
    return res.status(500).json({ success: false, message: "Could not fetch failed rows" });
  }
};

// ---------------------------------------------------------------------
// Raw-upload records (UploadRecord), kept from the original upload flow.
// Served at GET /api/upload/history, /api/history and /api/uploads.
// ---------------------------------------------------------------------
const UploadRecord = require("../models/UploadRecord");

exports.getUploadHistory = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const records = await UploadRecord.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const history = records.map((r) => ({
      id: String(r._id),
      fileName: r.fileName,
      status: r.status,
      size: r.size,
      mimeType: r.mimeType,
      jobId: r.jobId,
      totalRows: r.totalRows,
      batches: r.batches,
      error: r.error,
      uploadedAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return res.status(200).json({ success: true, count: history.length, history, uploads: history });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch upload history", error: err.message });
  }
};

exports.buildHistoryItem = buildHistoryItem;
