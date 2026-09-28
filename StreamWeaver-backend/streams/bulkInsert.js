const DEFAULT_BATCH_SIZE = 1000;

class BulkInserter {
  /**
   * @param {import("mongoose").Model} model - Mongoose model to insert into.
   * @param {object} [options]
   * @param {number} [options.batchSize=1000]
   * @param {boolean} [options.ordered=false] - false lets valid rows insert
   *   even if some rows in the same batch fail validation.
   */
  constructor(model, { batchSize = DEFAULT_BATCH_SIZE, ordered = false } = {}) {
    if (!model) throw new Error("BulkInserter requires a Mongoose model");
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error("batchSize must be a positive integer");
    }
    this.model = model;
    this.batchSize = batchSize;
    this.ordered = ordered;
    this.buffer = [];
    this.stats = { inserted: 0, failed: 0, batches: 0, batchErrors: [] };
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

  // Send whatever is currently buffered to MongoDB and clear the buffer.
  async flush() {
    if (this.buffer.length === 0) {
      return { insertedCount: 0 };
    }

    const ops = this.buffer;
    this.buffer = [];
    this.stats.batches += 1;

    try {
      const result = await this.model.bulkWrite(ops, { ordered: this.ordered });
      const insertedCount =
        result.insertedCount ?? Object.keys(result.insertedIds || {}).length;
      this.stats.inserted += insertedCount;
      return result;
    } catch (err) {
      if (err.writeErrors && err.writeErrors.length) {
        // Partial failure: some ops in this batch were rejected, but
        // MongoDB still processed (and inserted) the rest.
        const failedCount = err.writeErrors.length;
        const insertedCount = ops.length - failedCount;
        this.stats.inserted += insertedCount;
        this.stats.failed += failedCount;
        return { insertedCount, writeErrors: err.writeErrors };
      }

      // Total failure: the whole batch never reached MongoDB (e.g. a
      // dropped connection). Nothing in it was inserted — do NOT count
      // these as successes.
      this.stats.failed += ops.length;
      this.stats.batchErrors.push({
        batch: this.stats.batches,
        size: ops.length,
        message: err.message,
      });
      return { insertedCount: 0, error: err.message };
    }
  }

  // Call once after the last row so nothing is left un-flushed.
  async finish() {
    await this.flush();
    return this.stats;
  }
}

module.exports = { BulkInserter, DEFAULT_BATCH_SIZE };
