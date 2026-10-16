const mongoose = require("mongoose");

/**
 * ProcessedRow — Week 4 Day 4. Where transformed CSV rows land once
 * they've gone through the full pipeline (parse -> saved transform ->
 * buffered bulk insert). Schema is intentionally loose (Mixed) because
 * every upload can have different columns — this is a generic ETL
 * sink, not a fixed business table. `userId` and `jobId` are what make
 * rows from one upload queryable as a group, and keep one user's data
 * separate from another's.
 */
const processedRowSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    jobId: { type: String, required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ProcessedRow", processedRowSchema);
