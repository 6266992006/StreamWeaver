/**
 * Week 4 (Day 4) — export streaming benchmark.
 *
 *   npm run bench:export              # 500,000 rows
 *   npm run bench:export -- 2000000   # custom row count
 *
 * Runs the REAL export code (controllers/exportController streamCsv) against
 * a generated row source and two kinds of client — a fast one and a slow one
 * — and reports throughput and memory. It needs no database, so it measures
 * the streaming layer only (backpressure, chunking, memory); MongoDB's own
 * read speed is separate and depends on your deployment.
 */
const { Writable } = require("node:stream");
const { _internal } = require("../controllers/exportController");

const ROWS = Number(process.argv[2]) || 500_000;
const mb = (n) => (n / 1024 / 1024).toFixed(1);

function makeCursor(total) {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 1; i <= total; i++) {
        yield { data: { id: i, name: `User ${i}`, email: `user${i}@example.com`, age: 20 + (i % 50), city: "Bengaluru" } };
      }
    },
    async close() {},
  };
}

class Client extends Writable {
  constructor(slow) {
    super({ highWaterMark: 16 * 1024 });
    this.slow = slow;
    this.bytes = 0;
    this.peakQueued = 0;
  }
  _write(chunk, enc, cb) {
    this.bytes += chunk.length;
    this.peakQueued = Math.max(this.peakQueued, this.writableLength);
    this.slow ? setImmediate(cb) : cb();
  }
}

async function run(label, slow) {
  global.gc && global.gc();
  const baseRss = process.memoryUsage().rss;
  let peakRss = baseRss;
  const sampler = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 20);

  const client = new Client(slow);
  const t0 = process.hrtime.bigint();
  await _internal.streamCsv(makeCursor(ROWS), client);
  await new Promise((r) => client.once("finish", r));
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  clearInterval(sampler);

  console.log(
    `${label.padEnd(12)} ${ROWS.toLocaleString()} rows  ${secs.toFixed(2)}s  ` +
      `${Math.round(ROWS / secs).toLocaleString()} rows/s  ${mb(client.bytes)}MB out  ` +
      `peak queued ${(client.peakQueued / 1024).toFixed(0)}KB  RSS growth ${mb(peakRss - baseRss)}MB`
  );
}

(async () => {
  await run("fast client", false);
  await run("slow client", true);
})();
