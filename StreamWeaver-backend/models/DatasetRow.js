const mongoose = require("mongoose");

// --- DatasetRow schema ---
// Destination for the rows the import pipeline inserts. One shared
// collection (not one collection per upload) so thousands of uploads
// don't mean thousands of collections, and so Week 4's export can stream
// a single cursor: DatasetRow.find({ datasetId }).sort({ rowNumber: 1 }).
const datasetRowSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dataset",
      required: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransformJob",
      default: null,
    },
    // 1-based data row number (row 1 = first row after the CSV header),
    // the same numbering used in TransformJob.errorLog.
    rowNumber: {
      type: Number,
      required: true,
    },
    // The mapped destination fields, e.g. { name: "Ada", age: 36 }.
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { minimize: false, versionKey: false }
);

// Also guards against accidentally importing the same dataset twice:
// the second run's inserts fail with a duplicate-key error, which the
// pipeline reports per row instead of silently doubling the data.
datasetRowSchema.index({ datasetId: 1, rowNumber: 1 }, { unique: true });

// Call before re-running an import for a dataset.
datasetRowSchema.statics.clearDataset = function clearDataset(datasetId) {
  return this.deleteMany({ datasetId });
};

// Builds the document the import pipeline hands to BulkInserter.
datasetRowSchema.statics.toDocument = function toDocument(datasetId, jobId = null) {
  return (data, rowNumber) => ({ datasetId, jobId, rowNumber, data });
};

module.exports = mongoose.model("DatasetRow", datasetRowSchema);
