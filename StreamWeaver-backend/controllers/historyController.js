const Dataset = require("../models/Dataset");
const TransformJob = require("../models/TransformJob");

// Combines an uploaded file (Dataset) with its most recent import run
// (TransformJob, if any) into the row the Upload History dashboard shows.
//  - no job yet  -> status/counts come from the upload itself ("uploaded")
//  - has a job   -> status and live counters come from that job
function buildHistoryItem(dataset, job) {
  return {
    id: String(dataset._id),
    fileName: dataset.originalFileName,
    uploadedAt: dataset.createdAt,
    sizeBytes: dataset.fileSizeBytes ?? 0,
    status: job ? job.status : dataset.status,
    totalRows: job?.totalRows || dataset.rowCount || 0,
    rowsProcessed: job?.rowsProcessed ?? 0,
    rowsFailed: job?.rowsFailed ?? 0,
    rowsPerSec: job?.rowsPerSec ?? 0,
    jobId: job ? String(job._id) : null,
    finishedAt: job?.finishedAt ?? null,
    errorMessage: job?.errorMessage ?? null,
  };
}

// @route  GET /api/jobs  (protected)
// The logged-in user's upload history, newest first.
exports.getHistory = async (req, res) => {
  try {
    const datasets = await Dataset.find({ ownerId: req.userId })
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
    return res.status(200).json({ success: true, jobs: items });
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
    const job = await TransformJob.findOne({ _id: jobId, ownerId: req.userId })
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

exports.buildHistoryItem = buildHistoryItem;
