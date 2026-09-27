const Dataset = require("../models/Dataset");

// @route  GET /api/jobs  (protected)
// Returns the logged-in user's upload history for the Dashboard.
// This route didn't exist before — the frontend's Dashboard/jobApi.js
// was already built against this exact contract, it just had nothing
// to call.
exports.getHistory = async (req, res) => {
  try {
    const datasets = await Dataset.find({ ownerId: req.userId })
      .sort({ createdAt: -1 })
      .limit(100);

    const jobs = datasets.map((d) => ({
      id: d._id,
      fileName: d.originalFileName,
      uploadedAt: d.createdAt,
      totalRows: d.rowCount,
      rowsFailed: 0, // no transform pipeline wired up yet (Week 2/3 work)
      status: d.status,
    }));

    return res.status(200).json({ success: true, jobs });
  } catch (err) {
    console.error("History fetch error:", err.message);
    return res.status(500).json({ success: false, message: "Could not fetch upload history" });
  }
};
