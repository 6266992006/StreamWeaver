const mongoose = require("mongoose");

// --- Week 1: TransformJob schema ---
// One document per "run" of a dataset through the mapping/transform
// pipeline. Progress fields here are what the Week 3 WebSocket layer
// will read from to push live updates to the frontend.
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
      type: mongoose.Schema.Types.Mixed, // { sourceColumn: destinationField, ... }
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "failed"],
      default: "pending",
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    rowsProcessed: {
      type: Number,
      default: 0,
    },
    rowsFailed: {
      type: Number,
      default: 0,
    },
    rowsPerSec: {
      type: Number,
      default: 0,
    },
    errorLog: [
      {
        row: Number,
        reason: String,
      },
    ],
  },
  { timestamps: true }
);

// Dashboard/status queries per user, and progress lookups per dataset.
transformJobSchema.index({ ownerId: 1, status: 1 });
transformJobSchema.index({ datasetId: 1 });

module.exports = mongoose.model("TransformJob", transformJobSchema);
