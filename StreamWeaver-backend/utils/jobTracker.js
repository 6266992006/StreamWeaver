/**
 * JobTracker — keeps a TransformJob document in sync while an import runs.
 *
 * It owns the job lifecycle (pending -> processing -> done | failed) and
 * the live counters (rowsProcessed / rowsFailed / rowsPerSec) that the
 * Upload History dashboard and the Week 3 WebSocket feed read.
 *
 * Two things it does on purpose:
 *  - Throttles progress writes (default: at most one per 500ms). A fast
 *    import flushes a batch every few milliseconds; writing the job doc
 *    each time would just add load to the database being written to.
 *    start(), complete() and fail() always write immediately.
 *  - Caps errorLog at MAX_ERROR_LOG entries with $push + $slice, so a huge
 *    file full of bad rows can't grow the job past MongoDB's 16MB
 *    document limit. rowsFailed keeps the true total.
 */

const MAX_ERROR_LOG = 1000;
const DEFAULT_PROGRESS_INTERVAL_MS = 500;

class JobTracker {
  /**
   * @param {*} jobId - _id of an existing TransformJob
   * @param {object} [options]
   * @param {import("mongoose").Model} [options.model] - defaults to the TransformJob model
   * @param {number} [options.progressIntervalMs=500]
   * @param {() => number} [options.now=Date.now] - injectable clock (tests)
   * @param {number} [options.maxErrorLog=1000]
   */
  constructor(jobId, options = {}) {
    if (!jobId) throw new Error("JobTracker requires a jobId");
    this.jobId = jobId;
    this.model = options.model || require("../models/TransformJob");
    this.progressIntervalMs = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
    this.now = options.now || Date.now;
    this.maxErrorLog = options.maxErrorLog ?? MAX_ERROR_LOG;

    this.startedAtMs = null;
    this.lastWriteMs = 0;
    this.pendingErrors = [];
    this.errorsQueued = 0; // errors accepted so far (persisted + pending)
    this.latest = { processed: 0, failed: 0 };
  }

  /** Create the TransformJob document and return a tracker for it. */
  static async create(fields, options = {}) {
    const model = options.model || require("../models/TransformJob");
    const job = await model.create({ ...fields, status: "pending" });
    return new JobTracker(job._id, { ...options, model });
  }

  /** Mark the job as running. Pass totalRows if it's known up front. */
  async start(totalRows = 0) {
    this.startedAtMs = this.now();
    this.lastWriteMs = this.startedAtMs;
    await this.model.updateOne(
      { _id: this.jobId },
      {
        $set: {
          status: "processing",
          startedAt: new Date(this.startedAtMs),
          finishedAt: null,
          errorMessage: null,
          totalRows,
          rowsProcessed: 0,
          rowsFailed: 0,
          rowsPerSec: 0,
          errorLog: [],
        },
      }
    );
  }

  /** Queue per-row errors ({ row, reason }) for the next write. */
  addErrors(errors) {
    for (const e of errors) {
      if (this.errorsQueued >= this.maxErrorLog) return; // capped
      this.pendingErrors.push(e);
      this.errorsQueued += 1;
    }
  }

  _rowsPerSec(processed, failed) {
    const elapsedSec = Math.max((this.now() - (this.startedAtMs ?? this.now())) / 1000, 0.001);
    return Math.round((processed + failed) / elapsedSec);
  }

  async _write(extraSet = {}) {
    const { processed, failed } = this.latest;
    const update = {
      $set: {
        rowsProcessed: processed,
        rowsFailed: failed,
        rowsPerSec: this._rowsPerSec(processed, failed),
        ...extraSet,
      },
    };

    if (this.pendingErrors.length > 0) {
      update.$push = { errorLog: { $each: this.pendingErrors, $slice: this.maxErrorLog } };
      this.pendingErrors = [];
    }

    this.lastWriteMs = this.now();
    await this.model.updateOne({ _id: this.jobId }, update);
  }

  /**
   * Report cumulative counts so far. Cheap to call often: it only writes
   * to the database when the progress interval has elapsed (or force=true).
   */
  async progress({ processed, failed }, { force = false } = {}) {
    this.latest = { processed, failed };
    if (!force && this.now() - this.lastWriteMs < this.progressIntervalMs) return false;
    await this._write();
    return true;
  }

  /** Finish successfully. `total` is the number of rows seen. */
  async complete({ processed, failed, total }) {
    this.latest = { processed, failed };
    await this._write({
      status: "done",
      totalRows: total ?? processed + failed,
      finishedAt: new Date(this.now()),
    });
  }

  /** Stop the job as failed, keeping whatever counts we had. */
  async fail(message) {
    await this._write({
      status: "failed",
      errorMessage: String(message || "Import failed").slice(0, 500),
      finishedAt: new Date(this.now()),
    });
  }
}

module.exports = { JobTracker, MAX_ERROR_LOG, DEFAULT_PROGRESS_INTERVAL_MS };
