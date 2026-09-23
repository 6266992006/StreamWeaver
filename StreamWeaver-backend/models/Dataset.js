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

// Fast "my uploads" queries — powers the Upload History Dashboard.
datasetSchema.index({ ownerId: 1 });

module.exports = mongoose.model("Dataset", datasetSchema);
