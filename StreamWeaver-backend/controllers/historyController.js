const UploadRecord = require("../models/UploadRecord");

// @route  GET /api/upload/history  (protected)
// Also served at GET /api/history and GET /api/uploads (aliases).
// Returns ONLY the logged-in user's uploads, newest first.
exports.getHistory = async (req, res) => {
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
