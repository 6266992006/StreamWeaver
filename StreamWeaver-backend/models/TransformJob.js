const mongoose = require("mongoose");

// --- TransformJob schema ---
// One document per "run" of a dataset through the validate -> map ->
// bulk-insert pipeline. The progress fields below are written by
// utils/jobTracker.js while a job runs, and read by the Upload History
// dashboard (and, in Week 3, the WebSocket progress feed).
const transformJobSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dataset",
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mappingConfig: {
      type: mongoose.Schema.Types.Mixed, // { destField: { source, type, required } }
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "failed"],
      default: "pending",
    },
    totalRows: { type: Number, default: 0 },
    rowsProcessed: { type: Number, default: 0 },
    rowsFailed: { type: Number, default: 0 },
    rowsPerSec: { type: Number, default: 0 },

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    // Set when status === "failed": why the whole job stopped.
    errorMessage: { type: String, default: null },

    // Per-row failures. Capped at MAX_ERROR_LOG entries by JobTracker
    // (a 5M-row file with bad data must never push this document past
    // MongoDB's 16MB limit) — rowsFailed always holds the true total.
    errorLog: [
      {
        _id: false,
        row: Number,
        reason: String,
      },
    ],
  },
  { timestamps: true }
);

// Dashboard/status queries per user, and progress lookups per dataset.
transformJobSchema.index({ ownerId: 1, status: 1 });
transformJobSchema.index({ datasetId: 1, createdAt: -1 });

module.exports = mongoose.model("TransformJob", transformJobSchema);
