const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { validateRow, mapRow } = require("../utils/dbValidators");
const { createBulkInsertStream, ROW_NUMBER } = require("./bulkInsert");
const { MAX_ERROR_LOG } = require("../utils/jobTracker");

/**
 * The whole database side of an import, as one stream pipeline:
 *
 *   source rows -> validate + map -> BulkInserter (batches of 1,000) -> MongoDB
 *                       |                     |
 *                  bad rows -> errorLog   progress -> JobTracker -> TransformJob
 *
 * `source` is any object-mode Readable / async iterable of row objects
 * (column name -> value) — e.g. the output of Mohan's csvParser. Memory
 * stays flat no matter how large the file is, and backpressure from the
 * database propagates all the way back to the source.
 *
 * Row numbers in errorLog are 1-based data rows (row 1 = first row after
 * the CSV header), i.e. what the user sees in their spreadsheet.
 */

class ValidateAndMap extends Transform {
  constructor({ mappingConfig, buildDocument, onInvalid }) {
    super({ objectMode: true });
    this.mappingConfig = mappingConfig;
    this.buildDocument = buildDocument;
    this.onInvalid = onInvalid;
    this.rowNumber = 0;
    this.invalidCount = 0;
  }

  _transform(row, _encoding, callback) {
    this.rowNumber += 1;
    const { valid, errors } = validateRow(row, this.mappingConfig);

    if (!valid) {
      this.invalidCount += 1;
      this.onInvalid({ row: this.rowNumber, reason: errors.map((e) => e.reason).join("; ") });
      return callback(); // drop the row, keep streaming
    }

    const doc = this.buildDocument(mapRow(row, this.mappingConfig), this.rowNumber);
    // Remember which source row this document is, so a later database
    // error can be reported against the right row (see bulkInsert.js).
    Object.defineProperty(doc, ROW_NUMBER, { value: this.rowNumber, enumerable: false });
    callback(null, doc);
  }
}

/**
 * @param {object} opts
 * @param {AsyncIterable<object>|import("stream").Readable} opts.source
 * @param {object} [opts.mappingConfig] - see utils/dbValidators.js
 * @param {import("mongoose").Model} opts.model - where valid rows are inserted
 * @param {import("../utils/jobTracker").JobTracker} [opts.tracker] - updates the TransformJob
 * @param {(data: object, rowNumber: number) => object} [opts.buildDocument]
 *   wraps a mapped row into the stored document. Default: the mapped row
 *   itself. For the DatasetRow model use `DatasetRow.toDocument(datasetId, jobId)`.
 * @param {number} [opts.batchSize=1000]
 * @param {number} [opts.totalRows] - if known up front, shown as the job total while running
 * @param {number} [opts.maxErrorLog=1000]
 * @returns {Promise<{ status: "done"|"failed", totalRows, rowsProcessed, rowsFailed,
 *   errorLog, errorsTruncated, batches, durationMs, errorMessage? }>}
 */
async function runImportPipeline({
  source,
  mappingConfig = {},
  model,
  tracker = null,
  buildDocument = (data) => data,
  batchSize,
  totalRows = 0,
  maxErrorLog = MAX_ERROR_LOG,
}) {
  const startedAt = Date.now();
  const invalidErrors = []; // row failed validation (never sent to the DB)
  let invalidErrorsPending = []; // not yet handed to the tracker

  const validator = new ValidateAndMap({
    mappingConfig,
    buildDocument,
    onInvalid: (err) => {
      if (invalidErrors.length < maxErrorLog) invalidErrors.push(err);
      invalidErrorsPending.push(err);
    },
  });

  const reportProgress = async (batchErrors = [], force = false) => {
    if (!tracker) return;
    tracker.addErrors(invalidErrorsPending);
    invalidErrorsPending = [];
    tracker.addErrors(batchErrors);
    await tracker.progress(
      { processed: inserter.stats.inserted, failed: validator.invalidCount + inserter.stats.failed },
      { force }
    );
  };

  const writer = createBulkInsertStream(model, {
    batchSize,
    onBatch: ({ errors }) => reportProgress(errors),
  });
  const inserter = writer.inserter;

  if (tracker) await tracker.start(totalRows);

  try {
    const input = source instanceof Readable ? source : Readable.from(source, { objectMode: true });
    await pipeline(input, validator, writer);
  } catch (err) {
    if (tracker) {
      await reportProgress([], true).catch(() => {});
      await tracker.fail(err.message).catch(() => {});
    }
    throw err;
  }

  const { inserted, failed, batches, batchErrors, writeErrors } = inserter.stats;
  const rowsFailed = validator.invalidCount + failed;
  const seen = validator.rowNumber;

  // If the database rejected every single batch, this wasn't a data
  // problem — the import as a whole failed.
  const dbDown = batchErrors.length > 0 && inserted === 0 && seen > validator.invalidCount;
  const errorMessage = dbDown ? `Database rejected every batch: ${batchErrors[0].message}` : undefined;

  if (tracker) {
    await reportProgress([], true);
    if (dbDown) {
      await tracker.fail(errorMessage);
    } else {
      await tracker.complete({ processed: inserted, failed: rowsFailed, total: seen });
    }
  }

  const allErrors = [...invalidErrors, ...writeErrors].sort((a, b) => (a.row ?? Infinity) - (b.row ?? Infinity));

  return {
    status: dbDown ? "failed" : "done",
    totalRows: seen,
    rowsProcessed: inserted,
    rowsFailed,
    errorLog: allErrors.slice(0, maxErrorLog),
    errorsTruncated: rowsFailed > Math.min(allErrors.length, maxErrorLog),
    batches,
    durationMs: Date.now() - startedAt,
    ...(errorMessage && { errorMessage }),
  };
}

module.exports = { runImportPipeline, ValidateAndMap };
