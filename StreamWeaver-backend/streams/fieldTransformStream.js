const { Transform } = require("stream");
const RowSandbox = require("../sandbox/rowSandbox");

/**
 * FieldTransformStream — Week 3 Day 4. Wraps RowSandbox in a real
 * stream.Transform so a saved transform config (Day 3) can be applied
 * to every row of a CSV WHILE it streams through the pipeline, instead
 * of one row at a time via a separate HTTP call (Day 2).
 *
 * One isolate is created up-front (in `create()`) and reused for every
 * row that flows through — same reasoning as RowSandbox itself: a fresh
 * isolate per row would be far too slow for a large file.
 *
 * Usage:
 *   const transformStream = await FieldTransformStream.create(fieldTransforms);
 *   fileStream.pipe(lineStream).pipe(jsonStream).pipe(transformStream);
 *   // ... on "end", call transformStream.dispose()
 */
class FieldTransformStream extends Transform {
  constructor(sandbox, options = {}) {
    super({ ...options, readableObjectMode: true, writableObjectMode: true });
    this._sandbox = sandbox;
    this._rowCount = 0;
    this._disposed = false;
  }

  /**
   * Async factory — RowSandbox.init() is async (creates the isolate),
   * so the stream can't be fully ready the moment `new` returns.
   */
  static async create(fieldTransforms, options = {}) {
    const sandbox = new RowSandbox(fieldTransforms, options);
    await sandbox.init();
    return new FieldTransformStream(sandbox, options);
  }

  async _transform(row, encoding, callback) {
    try {
      const transformed = await this._sandbox.transformRow(row);
      this._rowCount++;
      this.push(transformed);
      callback();
    } catch (err) {
      // A bad transform on one row shouldn't take down the whole upload
      // silently — surface it as a stream error so the caller can decide
      // (Day 4 fails the whole request; a future day could skip+log instead).
      callback(err);
    }
  }

  get rowCount() {
    return this._rowCount;
  }

  /** Frees the underlying isolate. Always call this when the stream ends. */
  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this._sandbox.dispose();
    }
  }
}

module.exports = FieldTransformStream;
