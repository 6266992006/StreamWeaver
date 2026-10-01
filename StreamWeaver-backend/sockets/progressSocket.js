/**
 * Week 3 (Day 2): WebSocket server that pushes live job progress.
 *
 * Reads the counters JobTracker writes into the TransformJob document
 * (rowsProcessed / rowsFailed / rowsPerSec / status) and streams them to
 * the browser, so Akshaya's progress bar + "rows/sec" indicator update
 * without polling the REST API.
 *
 * ---- Protocol (JSON text frames) -----------------------------------------
 *
 * Connect:  ws://<host>/ws/progress?token=<JWT>
 *   (browsers can't set an Authorization header on a WebSocket, so the same
 *   JWT used for REST goes in the query string. Bad/missing token -> HTTP 401
 *   during the upgrade, the socket is never opened.)
 *
 * Client -> server
 *   { "type": "subscribe",   "jobId": "<TransformJob _id>" }
 *   { "type": "unsubscribe", "jobId": "<TransformJob _id>" }
 *   { "type": "ping" }
 *
 * Server -> client
 *   { "type": "ready" }                       sent once after connect
 *   { "type": "progress", "jobId", "status", "totalRows", "rowsProcessed",
 *     "rowsFailed", "rowsPerSec", "percent", "startedAt", "finishedAt",
 *     "errorMessage" }                        snapshot on subscribe, then
 *                                             only when something changed
 *   { "type": "error", "jobId?", "message" }
 *   { "type": "pong" }
 *
 * `percent` is 0-100 (one decimal), or null while totalRows is still unknown.
 * When a job reaches "done" or "failed" the final snapshot is sent and the
 * subscription is dropped automatically.
 *
 * ---- Design notes ---------------------------------------------------------
 *  - ONE batched query per tick ($in over every job anyone is watching),
 *    not one per client. 50 browsers watching 50 jobs is still 1 query.
 *  - Polling the DB (instead of calling the socket from JobTracker) keeps
 *    this working when the import runs in a different Node process or when
 *    Mohan's server is scaled out.
 *  - errorLog is never selected: it can hold 1,000 entries; progress frames
 *    must stay tiny.
 *  - A user can only subscribe to their own jobs (ownerId check).
 *  - The poll timer only runs while there is at least one subscription.
 */

const { WebSocketServer } = require("ws");

const WS_PATH = "/ws/progress";
const POLL_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_SUBSCRIPTIONS_PER_SOCKET = 20;
const MAX_BUFFERED_BYTES = 1024 * 1024; // skip a frame for a client that is >1MB behind
const MAX_MESSAGE_BYTES = 4 * 1024; // client messages are tiny; reject anything larger
const TERMINAL_STATUSES = new Set(["done", "failed"]);
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const PROJECTION =
  "ownerId status totalRows rowsProcessed rowsFailed rowsPerSec startedAt finishedAt errorMessage";

/** Turn a TransformJob document into the frame sent to the client. */
function buildProgressPayload(job) {
  const total = job.totalRows || 0;
  const handled = (job.rowsProcessed || 0) + (job.rowsFailed || 0);

  let percent = null;
  if (job.status === "done") percent = 100;
  else if (total > 0) percent = Math.min(100, Math.round((handled / total) * 1000) / 10);

  return {
    type: "progress",
    jobId: String(job._id),
    status: job.status,
    totalRows: total,
    rowsProcessed: job.rowsProcessed || 0,
    rowsFailed: job.rowsFailed || 0,
    rowsPerSec: job.rowsPerSec || 0,
    percent,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    errorMessage: job.errorMessage || null,
  };
}

// What counts as "changed" — startedAt/finishedAt only move together with status.
function changeKey(p) {
  return `${p.status}|${p.totalRows}|${p.rowsProcessed}|${p.rowsFailed}|${p.rowsPerSec}`;
}

class ProgressHub {
  /**
   * @param {object} [options]
   * @param {import("mongoose").Model} [options.model] - defaults to TransformJob
   * @param {(token: string) => string} [options.verifyToken] - returns the userId or throws
   * @param {number} [options.pollIntervalMs=500]
   * @param {number} [options.heartbeatMs=30000]
   * @param {number} [options.maxSubscriptions=20] - per socket
   * @param {(...args) => void} [options.log]
   */
  constructor(options = {}) {
    this.model = options.model || require("../models/TransformJob");
    this.verifyToken = options.verifyToken || defaultVerifyToken;
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS;
    this.maxSubscriptions = options.maxSubscriptions ?? MAX_SUBSCRIPTIONS_PER_SOCKET;
    this.log = options.log || console.error;

    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.polling = false; // guards against overlapping ticks on a slow DB
    this.server = null;
    this._onUpgrade = null;

    this.wss.on("connection", (ws, req) => this._onConnection(ws, req));
  }

  /** Start handling WebSocket upgrades for WS_PATH on an http.Server. */
  attach(server) {
    this.server = server;
    // Only claim our own path — leave any other upgrade (e.g. a future
    // Socket.io endpoint) alone.
    this._onUpgrade = (req, socket, head) => {
      let url;
      try {
        url = new URL(req.url, "http://localhost");
      } catch {
        return rejectUpgrade(socket, 400, "Bad Request");
      }
      if (url.pathname !== WS_PATH) {
        // Not ours. If another module (e.g. a future Socket.io endpoint)
        // also listens for upgrades, leave it to them; if we're the only
        // listener nobody will ever answer, so close the socket instead of
        // letting it dangle open forever.
        if (server.listenerCount("upgrade") <= 1) rejectUpgrade(socket, 404, "Not Found");
        return;
      }

      let userId;
      try {
        const token = url.searchParams.get("token");
        if (!token) throw new Error("No token provided");
        userId = this.verifyToken(token);
        if (!userId) throw new Error("Invalid token");
      } catch {
        return rejectUpgrade(socket, 401, "Unauthorized");
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        ws.userId = String(userId);
        this.wss.emit("connection", ws, req);
      });
    };
    server.on("upgrade", this._onUpgrade);

    this.heartbeatTimer = setInterval(() => this._heartbeat(), this.heartbeatMs);
    this.heartbeatTimer.unref?.();
    return this;
  }

  // ---- connection handling -------------------------------------------------

  _onConnection(ws) {
    ws.isAlive = true;
    ws.subs = new Map(); // jobId -> last changeKey sent ("" = nothing yet)

    ws.on("pong", () => {
      ws.isAlive = true;
    });
    ws.on("message", (data) => this._onMessage(ws, data));
    ws.on("close", () => {
      ws.subs.clear();
      this._stopPollingIfIdle();
    });
    ws.on("error", () => ws.terminate());

    this._send(ws, { type: "ready" });
  }

  async _onMessage(ws, data) {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return this._send(ws, { type: "error", message: "Invalid JSON" });
    }
    if (!msg || typeof msg !== "object") {
      return this._send(ws, { type: "error", message: "Invalid message" });
    }

    try {
      if (msg.type === "ping") return this._send(ws, { type: "pong" });
      if (msg.type === "subscribe") return await this._subscribe(ws, msg.jobId);
      if (msg.type === "unsubscribe") {
        ws.subs.delete(String(msg.jobId));
        return this._stopPollingIfIdle();
      }
      return this._send(ws, { type: "error", message: `Unknown message type: ${msg.type}` });
    } catch (err) {
      this.log("progressSocket message error:", err.message);
      return this._send(ws, { type: "error", message: "Server error" });
    }
  }

  async _subscribe(ws, jobId) {
    jobId = String(jobId || "");
    if (!OBJECT_ID_RE.test(jobId)) {
      return this._send(ws, { type: "error", jobId, message: "Invalid jobId" });
    }
    if (!ws.subs.has(jobId) && ws.subs.size >= this.maxSubscriptions) {
      return this._send(ws, { type: "error", jobId, message: "Too many subscriptions" });
    }

    // ownerId in the filter: users can only watch their own jobs, and a job
    // that belongs to someone else looks exactly like one that doesn't exist.
    const job = await this.model
      .findOne({ _id: jobId, ownerId: ws.userId })
      .select(PROJECTION)
      .lean();
    if (!job) return this._send(ws, { type: "error", jobId, message: "Job not found" });

    const payload = buildProgressPayload(job);

    // Already finished: one snapshot is all they need, nothing to track.
    if (TERMINAL_STATUSES.has(job.status)) return this._send(ws, payload);

    // Re-check the cap *after* the await: a client that pipelines many
    // subscribe messages would otherwise slip them all past the check above
    // before any of them is recorded.
    if (!ws.subs.has(jobId) && ws.subs.size >= this.maxSubscriptions) {
      return this._send(ws, { type: "error", jobId, message: "Too many subscriptions" });
    }

    this._send(ws, payload);
    ws.subs.set(jobId, changeKey(payload));
    this._startPolling();
  }

  // ---- polling -------------------------------------------------------------

  _startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this._tick(), this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  _stopPollingIfIdle() {
    if (!this.pollTimer) return;
    for (const ws of this.wss.clients) {
      if (ws.subs && ws.subs.size > 0) return;
    }
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** One batched read for every watched job, then fan out to subscribers. */
  async _tick() {
    if (this.polling) return;
    this.polling = true;
    try {
      const watched = new Set();
      for (const ws of this.wss.clients) {
        if (ws.subs) for (const id of ws.subs.keys()) watched.add(id);
      }
      if (watched.size === 0) return this._stopPollingIfIdle();

      const jobs = await this.model
        .find({ _id: { $in: [...watched] } })
        .select(PROJECTION)
        .lean();
      const byId = new Map(jobs.map((j) => [String(j._id), j]));

      for (const ws of this.wss.clients) {
        if (!ws.subs) continue;
        for (const [jobId, lastKey] of ws.subs) {
          const job = byId.get(jobId);
          if (!job) {
            // Deleted while being watched.
            this._send(ws, { type: "error", jobId, message: "Job not found" });
            ws.subs.delete(jobId);
            continue;
          }
          const payload = buildProgressPayload(job);
          const key = changeKey(payload);
          if (key !== lastKey) {
            this._send(ws, payload);
            ws.subs.set(jobId, key);
          }
          if (TERMINAL_STATUSES.has(job.status)) ws.subs.delete(jobId);
        }
      }
      this._stopPollingIfIdle();
    } catch (err) {
      // A DB hiccup must not kill the timer — the next tick retries.
      this.log("progressSocket poll error:", err.message);
    } finally {
      this.polling = false;
    }
  }

  // ---- helpers -------------------------------------------------------------

  _send(ws, payload) {
    if (ws.readyState !== ws.OPEN) return false;
    // Progress frames are snapshots: dropping one for a slow client is safe,
    // the next tick carries newer numbers anyway. Never let one stuck
    // browser tab balloon server memory.
    if (payload.type === "progress" && ws.bufferedAmount > MAX_BUFFERED_BYTES) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  _heartbeat() {
    for (const ws of this.wss.clients) {
      if (!ws.isAlive) {
        ws.terminate(); // missed the last ping -> dead connection
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }

  /** Stop timers, drop every client, detach from the http server. */
  async close() {
    clearInterval(this.pollTimer);
    clearInterval(this.heartbeatTimer);
    this.pollTimer = null;
    this.heartbeatTimer = null;
    if (this.server && this._onUpgrade) this.server.off("upgrade", this._onUpgrade);
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise((resolve) => this.wss.close(resolve));
  }
}

function defaultVerifyToken(token) {
  const jwt = require("jsonwebtoken");
  return jwt.verify(token, process.env.JWT_SECRET).id; // same claim authMiddleware reads
}

function rejectUpgrade(socket, code, text) {
  socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Convenience wrapper used by server.js. */
function attachProgressSocket(server, options = {}) {
  return new ProgressHub(options).attach(server);
}

module.exports = {
  attachProgressSocket,
  ProgressHub,
  buildProgressPayload,
  WS_PATH,
  POLL_INTERVAL_MS,
};
