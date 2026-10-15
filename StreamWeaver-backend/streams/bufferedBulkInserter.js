const { Writable } = require("stream");

/**
 * BufferedBulkInserter — Week 4 Day 3.
 *
 * Last link in the ETL pipeline: a real stream.Writable (object mode)
 * that sits where a plain "insert every row one at a time" write would
 * go, and instead buffers rows in memory up to `batchSize` (default
 * 5000, per the project's "buffer mechanism that triggers MongoDB
 * insertMany or bulkWrite operations every 5,000 records" requirement)
 * before firing ONE `bulkWrite` call for the whole batch. Any leftover
 * rows smaller than a full batch are flushed automatically when the
 * stream ends (`_final`), so nothing is ever silently dropped.
 *
 * Deliberately decoupled from Mongoose/MongoDB specifics: it only
 * requires `model.bulkWrite(ops)` to exist and resolve, so it can be
 * unit-tested against a plain mock object (no real database needed) and
 * reused against any Mongoose model or raw MongoDB driver collection.
 *
 * Usage:
 *   const inserter = new BufferedBulkInserter(SomeModel, {
 *     batchSize: 5000,
 *     extraFields: { userId, jobId },
 *   });
 *   transformStream.pipe(inserter);
 *   inserter.on("finish", () => { ...inserter.stats... });
 *   inserter.on("batchFlushed", (info) => { ... });
 */
class BufferedBulkInserter extends Writable {
  constructor(model, options = {}) {
    super({ objectMode: true });

    if (!model || typeof model.bulkWrite !== "function") {
      throw new Error("BufferedBulkInserter requires a model with a bulkWrite(ops) method");
    }

    this.model = model;
    this.batchSize = options.batchSize || 5000;
    this.extraFields = options.extraFields || {}; // e.g. { userId, jobId } stamped onto every doc
    this.buffer = [];
    this.totalInserted = 0;
    this.batchesFlushed = 0;
  }

  _write(row, encoding, callback) {
    this.buffer.push({ ...row, ...this.extraFields });

    if (this.buffer.length >= this.batchSize) {
      this._flush().then(() => callback(), callback);
    } else {
      callback();
    }
  }

  _final(callback) {
    if (this.buffer.length > 0) {
      this._flush().then(() => callback(), callback);
    } else {
      callback();
    }
  }

  async _flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer;
    this.buffer = [];

    const ops = batch.map((doc) => ({ insertOne: { document: doc } }));
    const result = await this.model.bulkWrite(ops, { ordered: false });

    const insertedCount =
      result && typeof result.insertedCount === "number" ? result.insertedCount : batch.length;

    this.totalInserted += insertedCount;
    this.batchesFlushed += 1;

    this.emit("batchFlushed", {
      batchNumber: this.batchesFlushed,
      batchSize: batch.length,
      totalInserted: this.totalInserted,
    });
  }

  get stats() {
    return { totalInserted: this.totalInserted, batchesFlushed: this.batchesFlushed };
  }
}

module.exports = BufferedBulkInserter;
