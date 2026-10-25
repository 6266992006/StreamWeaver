const { Transform } = require("node:stream");
const RowSandbox = require("../sandbox/rowSandbox");
const { PRE_FAILED } = require("./importPipeline");

/**
 * Applies the user's per-column JavaScript (run in an isolated-vm sandbox)
 * to every row of an import.
 *
 * Unlike FieldTransformStream (which fails the whole upload on the first bad
 * row), a row whose script throws or times out is REPORTED and skipped: it
 * becomes a placeholder carrying the reason, so the import carries on, the
 * row shows up in the failed-rows list with the right row number, and one
 * bad value in 5 million rows doesn't throw away the other 4,999,999.
 *
 * A sandbox that has itself died (e.g. it hit its memory limit) can't
 * recover, so that fails the import instead of failing every later row.
 */
class SandboxRowTransform extends Transform {
  constructor(sandbox) {
    super({ readableObjectMode: true, writableObjectMode: true });
    this._sandbox = sandbox;
  }

  static async create(fieldTransforms, options = {}) {
    const sandbox = new RowSandbox(fieldTransforms, { memoryLimitMb: 16, timeoutMs: 200, ...options });
    await sandbox.init();
    return new SandboxRowTransform(sandbox);
  }

  async _transform(row, _encoding, callback) {
    try {
      callback(null, await this._sandbox.transformRow(row));
    } catch (err) {
      if (this._sandbox._isolate && this._sandbox._isolate.isDisposed) return callback(err);
      const failed = {};
      Object.defineProperty(failed, PRE_FAILED, { value: err.message, enumerable: false });
      callback(null, failed);
    }
  }

  dispose() {
    this._sandbox.dispose();
  }
}

module.exports = SandboxRowTransform;
