const test = require("node:test");
const assert = require("node:assert/strict");

const { runImportPipeline } = require("../streams/importPipeline");

/**
 * Week 3 (Day 4): proves the DB layer's core claim — memory stays flat no
 * matter how large the file is — on something closer to a real large
 * dataset than the 25,000-row correctness test in importPipeline.test.js.
 *
 * A fake model that actually "stores" every row (instead of discarding it,
 * like the other tests' fakes) would defeat the point: *that* array would
 * dominate memory and hide a real regression. This one counts and discards,
 * so what's actually measured is the pipeline's own buffering.
 */

const ROWS = 100_000;
const mappingConfig = {
  name: { source: "Name", required: true },
  email: { source: "Email", type: "email", required: true },
  age: { source: "Age", type: "number" },
};

function* generateRows(n) {
  for (let i = 1; i <= n; i++) {
    // 1 in 500 is invalid, so the error path stays exercised at this scale too.
    yield i % 500 === 0
      ? { Name: `User ${i}`, Email: "", Age: String(20 + (i % 50)) }
      : { Name: `User ${i}`, Email: `user${i}@example.com`, Age: String(20 + (i % 50)) };
  }
}

function countingModel() {
  let inserted = 0;
  let batches = 0;
  return {
    get inserted() {
      return inserted;
    },
    get batches() {
      return batches;
    },
    bulkWrite: async (ops) => {
      batches += 1;
      inserted += ops.length; // count and discard — never retain the documents
      return { insertedCount: ops.length };
    },
  };
}

test(`streams ${ROWS.toLocaleString()} rows with correct totals and bounded memory`, async () => {
  const model = countingModel();

  if (global.gc) global.gc(); // run with --expose-gc for a cleaner reading; works without it too
  const before = process.memoryUsage().heapUsed;
  const startedAt = Date.now();

  const result = await runImportPipeline({ source: generateRows(ROWS), mappingConfig, model });

  const durationMs = Date.now() - startedAt;
  if (global.gc) global.gc();
  const afterMB = (process.memoryUsage().heapUsed - before) / (1024 * 1024);

  const expectedInvalid = Math.floor(ROWS / 500);
  assert.equal(result.status, "done");
  assert.equal(result.totalRows, ROWS);
  assert.equal(result.rowsFailed, expectedInvalid);
  assert.equal(result.rowsProcessed, ROWS - expectedInvalid);
  assert.equal(model.inserted, ROWS - expectedInvalid);
  assert.equal(model.batches, Math.ceil((ROWS - expectedInvalid) / 1000));

  // errorLog is capped — even at this scale the job document stays well
  // under MongoDB's 16MB limit.
  assert.ok(result.errorLog.length <= 1000);
  assert.equal(result.errorsTruncated, expectedInvalid > 1000);

  // Generous bounds on purpose — this runs on shared CI hardware without
  // --expose-gc, so it's a regression tripwire (e.g. "someone accidentally
  // buffers the whole file in an array"), not a tight perf benchmark.
  assert.ok(afterMB < 150, `heap grew ${afterMB.toFixed(1)}MB for ${ROWS.toLocaleString()} rows — streaming may have regressed`);
  assert.ok(durationMs < 15_000, `took ${durationMs}ms for ${ROWS.toLocaleString()} rows`);

  console.log(`    (${ROWS.toLocaleString()} rows in ${durationMs}ms, heap +${afterMB.toFixed(1)}MB, ${model.batches} batches)`);
});

test("backpressure holds at 100,000 rows against a deliberately slow database", async () => {
  let maxInFlightRows = 0;
  let produced = 0;
  let acknowledged = 0;

  async function* slowSource() {
    for (let i = 1; i <= ROWS; i++) {
      produced += 1;
      maxInFlightRows = Math.max(maxInFlightRows, produced - acknowledged);
      yield { Name: `User ${i}`, Email: `u${i}@x.com`, Age: "30" };
    }
  }

  const model = {
    bulkWrite: async (ops) => {
      await new Promise((r) => setImmediate(r)); // simulate a slower round trip
      acknowledged += ops.length;
      return { insertedCount: ops.length };
    },
  };

  const result = await runImportPipeline({
    source: slowSource(),
    mappingConfig: { name: { source: "Name" } },
    model,
  });

  assert.equal(result.rowsProcessed, ROWS);
  // The generator can run ahead by at most a little more than one in-flight
  // batch — not anywhere close to buffering all 100,000 rows.
  assert.ok(maxInFlightRows < 5000, `source ran ${maxInFlightRows} rows ahead of the database`);
});
