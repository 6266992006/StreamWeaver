const { Writable } = require("node:stream");

/**
 * Batched bulk-insert logic.
 *
 * Buffers documents and flushes them to MongoDB with bulkWrite in fixed
 * batches (default 1,000), so a multi-million-row file never sits in
 * memory and never becomes one giant insert that times out.
 *
 * Failure model (see tests/bulkInsert.test.js):
 *  - some rows in a batch rejected (duplicate key, ...) -> only those
 *    rows count as failed and are recorded in stats.writeErrors; the rest
 *    of the batch is still inserted.
 *  - the whole batch failed (connection dropped, ...) -> every row in it
 *    counts as failed and the error is recorded in stats.batchErrors.
 *    They are never silently counted as inserted.
 */

const DEFAULT_BATCH_SIZE = 1000;
const MAX_TRACKED_ERRORS = 1000;

// Documents can carry the row number they came from under this
// (non-enumerable) key, so a database error on the 3rd document of a
// batch is reported as e.g. "row 4012" — the row the user sees in their
// file — even when earlier rows were dropped by validation.
const ROW_NUMBER = Symbol.for("streamweaver.rowNumber");

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

class BulkInserter {
  /**
   * @param {import("mongoose").Model} model - Mongoose model to insert into.
   * @param {object} [options]
   * @param {number} [options.batchSize=1000]
   * @param {boolean} [options.ordered=false] - false lets valid rows insert
   *   even if other rows in the same batch fail.
   * @param {(info: object) => Promise<void>|void} [options.onBatch] - called
   *   after every flush with { batch, insertedCount, failedCount, errors, stats }.
   *   Used for progress reporting; failures inside it never abort the import.
   * @param {number} [options.maxTrackedErrors=1000] - cap on stats.writeErrors.
   */
  constructor(
    model,
    { batchSize = DEFAULT_BATCH_SIZE, ordered = false, onBatch = null, maxTrackedErrors = MAX_TRACKED_ERRORS } = {}
  ) {
    if (!model) throw new Error("BulkInserter requires a Mongoose model");
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("batchSize must be a positive integer");
    }
    this.model = model;
    this.batchSize = batchSize;
    this.ordered = ordered;
    this.onBatch = onBatch;
    this.maxTrackedErrors = maxTrackedErrors;
    this.buffer = [];
    this.flushedOps = 0; // ops already sent in earlier batches (for absolute positions)
    this.stats = { inserted: 0, failed: 0, batches: 0, batchErrors: [], writeErrors: [] };
  }

  // Add one document; auto-flushes once the buffer hits batchSize.
  async add(doc) {
    this.buffer.push({ insertOne: { document: doc } });
    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  // Convenience for adding several documents in one call.
  async addMany(docs) {
    for (const doc of docs) {
      await this.add(doc);
    }
  }

  _trackError(entry, batchErrors) {
    batchErrors.push(entry);
    if (this.stats.writeErrors.length < this.maxTrackedErrors) {
      this.stats.writeErrors.push(entry);
    }
  }

  // Send whatever is currently buffered to MongoDB and clear the buffer.
  // Never throws for database errors — they're reported through stats.
  async flush() {
    if (this.buffer.length === 0) {
      return { insertedCount: 0, failedCount: 0, errors: [] };
    }

    const ops = this.buffer;
    this.buffer = [];
    const offset = this.flushedOps; // position of ops[0] in the whole import
    this.flushedOps += ops.length;
    this.stats.batches += 1;

    const errors = []; // errors from this batch only (for onBatch)
    let insertedCount = 0;
    let failedCount = 0;

    try {
      const result = await this.model.bulkWrite(ops, { ordered: this.ordered });
      insertedCount =
        result.insertedCount ?? Object.keys(result.insertedIds || {}).length;

      // Mongoose skips documents that fail schema validation (when
      // ordered:false) instead of throwing, so the count can come up short.
      const skipped = ops.length - insertedCount;
      if (skipped > 0) {
        failedCount = skipped;
        this._trackError(
          { row: null, reason: `${skipped} document(s) rejected by schema validation` },
          errors
        );
      }
    } catch (err) {
      const writeErrors = asArray(err.writeErrors);

      if (writeErrors.length > 0) {
        // Partial failure: MongoDB processed the batch but rejected some ops.
        failedCount = writeErrors.length;
        insertedCount = Number.isInteger(err.insertedCount)
          ? err.insertedCount
          : ops.length - failedCount;

        for (const e of writeErrors) {
          const position = e.index ?? 0;
          const doc = ops[position]?.insertOne?.document;
          this._trackError(
            {
              // source row number if the doc carries one, else 1-based position
              row: doc?.[ROW_NUMBER] ?? offset + position + 1,
              reason: e.errmsg || e.message || "Insert failed",
            },
            errors
          );
        }

        // ordered:true stops at the first error, so later ops never ran.
        const notRun = ops.length - insertedCount - failedCount;
        if (notRun > 0) failedCount += notRun;
      } else {
        // Total failure: nothing in this batch reached MongoDB.
        insertedCount = 0;
        failedCount = ops.length;
        this.stats.batchErrors.push({
          batch: this.stats.batches,
          size: ops.length,
          message: err.message,
        });
      }
    }

    this.stats.inserted += insertedCount;
    this.stats.failed += failedCount;

    const summary = { insertedCount, failedCount, errors };

    if (this.onBatch) {
      try {
        await this.onBatch({ ...summary, batch: this.stats.batches, stats: this.stats });
      } catch {
        // Progress reporting is best-effort; never let it abort the import.
      }
    }

    return summary;
  }

  // Call once after the last row so nothing is left un-flushed.
  async finish() {
    await this.flush();
    return this.stats;
  }
}

/**
 * A Writable (object mode) wrapper so BulkInserter can sit at the end of
 * stream.pipeline(). write() only calls back once the current batch is
 * flushed, which gives real backpressure: a slow database slows the
 * upstream CSV reader instead of buffering the file in memory.
 *
 * The underlying inserter is exposed as `stream.inserter`.
 */
function createBulkInsertStream(model, options = {}) {
  const inserter = new BulkInserter(model, options);

  const stream = new Writable({
    objectMode: true,
    write(doc, _encoding, callback) {
      inserter.add(doc).then(() => callback(), callback);
    },
    final(callback) {
      inserter.flush().then(() => callback(), callback);
    },
  });

  stream.inserter = inserter;
  return stream;
}

module.exports = { BulkInserter, createBulkInsertStream, DEFAULT_BATCH_SIZE, MAX_TRACKED_ERRORS, ROW_NUMBER };
