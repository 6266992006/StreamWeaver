/**
 * Week 2 (Day 1): Batched bulk-insert logic.
 *
 * Buffers incoming rows (e.g. parsed CSV rows) and flushes them to
 * MongoDB using bulkWrite in fixed-size batches (default 1,000).
 * This avoids holding an entire large file in memory and avoids
 * sending one giant insertMany that could time out on huge uploads.
 */

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
    this.model = model;
    this.batchSize = batchSize;
    this.ordered = ordered;
    this.buffer = [];
    this.stats = { inserted: 0, failed: 0, batches: 0 };
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
      // With ordered:false, MongoDB still inserts the valid docs in the
      // batch and reports the rest as per-op failures in err.writeErrors.
      const writeErrors = err.writeErrors || [];
      const failedCount = writeErrors.length;
      const insertedCount = ops.length - failedCount;
      this.stats.inserted += insertedCount;
      this.stats.failed += failedCount;
      return { insertedCount, writeErrors };
    }
  }

  // Call once after the last row so nothing is left un-flushed.
  async finish() {
    await this.flush();
    return this.stats;
  }
}

module.exports = { BulkInserter, DEFAULT_BATCH_SIZE };
