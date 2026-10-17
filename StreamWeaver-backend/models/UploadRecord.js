const mongoose = require("mongoose");

/**
 * UploadRecord — one row per file a user uploads, so the frontend's
 * "Upload history" page can show every file and where it stands.
 *
 * status: "uploaded"   -> raw file saved to disk (POST /api/upload)
 *         "processing" -> transform + bulk-insert job started
 *         "completed"  -> job finished, rows are in MongoDB
 *         "failed"     -> job errored out
 */
const uploadRecordSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    savedAs: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: null },
    status: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed"],
      default: "uploaded",
    },
    jobId: { type: String, default: null, index: true },
    totalRows: { type: Number, default: null },
    batches: { type: Number, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UploadRecord", uploadRecordSchema);
