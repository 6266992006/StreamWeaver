const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");

const { _internal } = require("../controllers/exportController");
const { streamCsv, streamJson, FLUSH_BYTES } = _internal;

/**
 * Week 4 (Day 4): proves the export's memory claim with a REAL stream, not a
 * mock that accepts everything instantly. A slow client is simulated with a
 * Writable that takes a macrotask per chunk and has a small buffer — exactly
 * the situation where res.write() returns false. If the export ignored
 * backpressure, writableLength (bytes queued in memory) would balloon.
 */

class SlowRes extends Writable {
  constructor({ highWaterMark = 16 * 1024, destroyAfterBytes = Infinity } = {}) {
    super({ highWaterMark });
    this.bytes = 0;
    this.lines = 0;
    this.writes = 0;
    this.peakQueued = 0;
    this.destroyAfterBytes = destroyAfterBytes;
    this.on("error", () => {}); // a destroyed stream may emit; irrelevant here
  }
  _write(chunk, enc, cb) {
    this.writes += 1;
    this.peakQueued = Math.max(this.peakQueued, this.writableLength);
    this.bytes += chunk.length;
    for (const b of chunk) if (b === 10) this.lines += 1;
    if (this.bytes >= this.destroyAfterBytes) return this.destroy();
    setImmediate(cb); // the "slow network"
  }
}

function makeCursor(total, stats) {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 1; i <= total; i++) {
        stats.pulled = i;
        yield { data: { id: i, name: `User ${i}`, email: `user${i}@example.com`, note: "x".repeat(20) } };
      }
    },
    async close() {
      stats.closed = true;
    },
  };
}

test("CSV export to a slow client keeps queued memory bounded and delivers every row", async () => {
  const ROWS = 100_000;
  const stats = {};
  const res = new SlowRes();
  await streamCsv(makeCursor(ROWS, stats), res);
  await new Promise((r) => res.once("finish", r));

  assert.equal(res.lines, ROWS + 1); // header + every row
  // Queued bytes never grew past roughly one flush chunk + the stream's own
  // buffer. Ignoring backpressure would queue the whole ~9MB export here.
  assert.ok(res.peakQueued < FLUSH_BYTES * 3, `peak queued ${res.peakQueued} bytes — backpressure isn't working`);
  assert.ok(stats.closed, "cursor should be closed when the export finishes");
});

test("JSON export to a slow client is bounded and still valid JSON", async () => {
  const ROWS = 30_000;
  const chunks = [];
  const res = new SlowRes();
  const origWrite = res._write.bind(res);
  res._write = (chunk, enc, cb) => {
    chunks.push(Buffer.from(chunk));
    return origWrite(chunk, enc, cb);
  };
  await streamJson(makeCursor(ROWS, {}), res);
  await new Promise((r) => res.once("finish", r));

  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(parsed.length, ROWS);
  assert.equal(parsed[ROWS - 1].id, ROWS);
  assert.ok(res.peakQueued < FLUSH_BYTES * 3);
});

test("a client that disconnects mid-export stops the cursor instead of reading everything", async () => {
  const TOTAL = 2_000_000;
  const stats = {};
  const res = new SlowRes({ destroyAfterBytes: 256 * 1024 });
  await streamCsv(makeCursor(TOTAL, stats), res); // must resolve, not throw or hang

  assert.ok(stats.pulled < TOTAL / 10, `pulled ${stats.pulled} rows after the client left`);
  assert.equal(stats.closed, true, "cursor must be closed on abort");
});

test("rows are written in ~64KB chunks, not one write per row", async () => {
  const writes = [];
  const res = { write: (c) => (writes.push(c.length), true), end() {} }; // plain, always-ready sink
  await streamCsv(makeCursor(20_000, {}), res);

  assert.ok(writes.length < 100, `${writes.length} writes for 20,000 rows`);
  assert.ok(writes.slice(0, -1).every((n) => n >= FLUSH_BYTES), "every chunk except the last should be a full flush");
});
