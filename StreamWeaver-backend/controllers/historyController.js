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

exports.buildHistoryItem = buildHistoryItem;
