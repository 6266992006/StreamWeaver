const { Transform } = require("stream");

/**
 * RowWrapStream — Week 4 Day 4. Small adapter between
 * FieldTransformStream (which emits plain `{ field: value, ... }` row
 * objects) and BufferedBulkInserter feeding the `ProcessedRow` model
 * (which expects `{ userId, jobId, data }` documents). Keeps
 * BufferedBulkInserter itself generic — it just stamps `extraFields`
 * onto whatever object arrives — while this one piece knows the actual
 * shape ProcessedRow wants.
 */
class RowWrapStream extends Transform {
  constructor({ userId, jobId }, options = {}) {
    super({ ...options, readableObjectMode: true, writableObjectMode: true });
    this.userId = userId;
    this.jobId = jobId;
  }

  _transform(row, encoding, callback) {
    callback(null, { userId: this.userId, jobId: this.jobId, data: row });
  }
}

module.exports = RowWrapStream;
