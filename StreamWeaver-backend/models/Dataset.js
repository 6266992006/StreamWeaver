const mongoose = require("mongoose");

// --- Week 1: Dataset schema ---
// Stores metadata about every file a user uploads (not the raw rows —
// those get streamed straight into TransformJob / bulk inserts).
const datasetSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    storedFileName: {
      type: String,
      required: true,
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "text/csv",
    },
    columns: [{ type: String }], // detected CSV headers, filled after upload parse
    rowCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["uploaded", "processing", "processed", "failed"],
      default: "uploaded",
    },
  },
  { timestamps: true }
);

// Upload History does .find({ ownerId }).sort({ createdAt: -1 }).limit(100).
// A single-field { ownerId: 1 } index finds the right documents but still
// forces MongoDB to sort every match in memory before applying the limit —
// fine for a handful of uploads, expensive once a user has thousands. This
// compound index lets Mongo walk it in already-sorted order and stop at 100.
datasetSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model("Dataset", datasetSchema);
