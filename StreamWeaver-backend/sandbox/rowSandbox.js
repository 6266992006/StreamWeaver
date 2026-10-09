const ivm = require("isolated-vm");

/**
 * RowSandbox — Week 3 Day 2. Extends Day 1's idea for a real use case:
 * applying a user-defined JS expression to EVERY field of EVERY row in
 * a dataset (e.g. "uppercase the name column", "double the value column").
 *
 * Why not just call SandboxRunner.run() once per field per row?
 * Creating a fresh V8 isolate is relatively expensive (a few ms). For a
 * 50,000-row file with 3 transformed fields, that's 150,000 isolate
 * spin-ups — way too slow. RowSandbox instead creates ONE isolate,
 * compiles each field's script ONCE, and re-runs the same compiled
 * script per row, only updating the `value` global each time. This is
 * the pattern Day 4's streaming transform will be built on.
 *
 * Still fully sandboxed: the isolate has no access to Node internals,
 * each run has its own timeout, and a runaway script only burns time
 * on this one isolate, not the whole process.
 */
class RowSandbox {
  /**
   * @param {object} fieldTransforms  { fieldName: "jsExpressionUsingValue", ... }
   *   e.g. { name: "value.toUpperCase()", score: "Number(value) * 2" }
   * @param {object} options
   */
  constructor(fieldTransforms, options = {}) {
    this.fieldTransforms = fieldTransforms || {};
    this.memoryLimitMb = options.memoryLimitMb || 16;
    this.timeoutMs = options.timeoutMs || 200; // per-field, per-row — keep tight
    this._isolate = null;
    this._context = null;
    this._compiledScripts = null; // { fieldName: ivm.Script }
  }

  /** Must be called once before transformRow(). Compiles all scripts. */
  async init() {
    this._isolate = new ivm.Isolate({ memoryLimit: this.memoryLimitMb });
    this._context = await this._isolate.createContext();
    await this._context.global.set("global", this._context.global.derefInto());

    this._compiledScripts = {};
    for (const [field, expr] of Object.entries(this.fieldTransforms)) {
      this._compiledScripts[field] = await this._isolate.compileScript(expr);
    }
  }

  /**
   * Applies the configured transforms to one row (plain JS object).
   * Fields not listed in fieldTransforms pass through unchanged.
   * Returns a NEW object — never mutates the input.
   */
  async transformRow(row) {
    const output = { ...row };

    for (const [field, script] of Object.entries(this._compiledScripts)) {
      if (!Object.prototype.hasOwnProperty.call(row, field)) continue;

      await this._context.global.set("value", row[field], { copy: true });
      try {
        const result = await script.run(this._context, { timeout: this.timeoutMs });
        output[field] = result;
      } catch (err) {
        // A broken script for one field shouldn't silently corrupt data —
        // surface it clearly so the caller can decide (skip row, fail job, etc.)
        throw new Error(`Transform failed on field "${field}": ${err.message}`);
      }
    }

    return output;
  }

  /** Frees the isolate. Call when done processing all rows. */
  dispose() {
    if (this._isolate && !this._isolate.isDisposed) {
      this._isolate.dispose();
    }
  }
}

module.exports = RowSandbox;
