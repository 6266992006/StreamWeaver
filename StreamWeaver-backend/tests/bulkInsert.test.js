const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const { BulkInserter, createBulkInsertStream } = require("../streams/bulkInsert");

const docs = (n) => Array.from({ length: n }, (_, i) => ({ n: i }));

test("write errors are counted, recorded and positioned across batches", async () => {
  // In every batch the DB rejects the op at index 1 (a single error
  // object, not an array — the real driver does this for one error).
  const model = {
    bulkWrite: async () => {
      const err = new Error("bulk failed");
      err.writeErrors = { index: 1, errmsg: "E11000 duplicate key" };
      throw err;
    },
  };
  const inserter = new BulkInserter(model, { batchSize: 5 });
  await inserter.addMany(docs(10));
  const stats = await inserter.finish();

  assert.equal(stats.inserted, 8);
  assert.equal(stats.failed, 2);
  // 1-based positions: op 2 of batch 1 -> row 2, op 2 of batch 2 -> row 7
  assert.deepEqual(stats.writeErrors.map((e) => e.row), [2, 7]);
  assert.match(stats.writeErrors[0].reason, /duplicate key/);
});

test("a doc's own row number wins over its batch position", async () => {
  const { ROW_NUMBER } = require("../streams/bulkInsert");
  const model = {
    bulkWrite: async () => {
      const err = new Error("bulk failed");
      err.writeErrors = [{ index: 1, errmsg: "dup" }];
      throw err;
    },
  };
  const a = { n: 1 };
  const b = { n: 2 };
  Object.defineProperty(b, ROW_NUMBER, { value: 4012, enumerable: false });
  const inserter = new BulkInserter(model, { batchSize: 2 });
  await inserter.addMany([a, b]);
  const stats = await inserter.finish();
  assert.deepEqual(stats.writeErrors.map((e) => e.row), [4012]);
  assert.equal(Object.keys(b).includes("Symbol(streamweaver.rowNumber)"), false); // not stored in Mongo
});

test("uses the driver's insertedCount when the error reports it", async () => {
  const model = {
    bulkWrite: async () => {
      const err = new Error("bulk failed");
      err.writeErrors = [{ index: 0, errmsg: "boom" }];
      err.insertedCount = 3; // ordered:false, 3 of 5 went in, 1 failed, 1 unknown
      throw err;
    },
  };
  const inserter = new BulkInserter(model, { batchSize: 5 });
  await inserter.addMany(docs(5));
  const stats = await inserter.finish();
  assert.equal(stats.inserted, 3);
  assert.equal(stats.failed, 2); // 1 reported + 1 that never ran
});

test("a batch that silently inserts fewer docs than sent counts the gap as failed", async () => {
  // Mongoose skips schema-invalid docs instead of throwing (ordered:false).
  const model = { bulkWrite: async (ops) => ({ insertedCount: ops.length - 2 }) };
  const inserter = new BulkInserter(model, { batchSize: 10 });
  await inserter.addMany(docs(10));
  const stats = await inserter.finish();
  assert.equal(stats.inserted, 8);
  assert.equal(stats.failed, 2);
});

test("passes ordered option through to bulkWrite", async () => {
  const seen = [];
  const model = { bulkWrite: async (ops, opts) => { seen.push(opts.ordered); return { insertedCount: ops.length }; } };
  await new BulkInserter(model, { batchSize: 2 }).addMany(docs(2));
  await new BulkInserter(model, { batchSize: 2, ordered: true }).addMany(docs(2));
  assert.deepEqual(seen, [false, true]);
});

test("onBatch is called once per flush and a throwing callback does not abort the insert", async () => {
  const calls = [];
  const model = { bulkWrite: async (ops) => ({ insertedCount: ops.length }) };
  const inserter = new BulkInserter(model, {
    batchSize: 4,
    onBatch: async (info) => {
      calls.push([info.batch, info.insertedCount]);
      throw new Error("progress reporting is down");
    },
  });
  await inserter.addMany(docs(10));
  const stats = await inserter.finish();

  assert.deepEqual(calls, [[1, 4], [2, 4], [3, 2]]);
  assert.equal(stats.inserted, 10);
});

test("tracked write errors are capped, but failed stays exact", async () => {
  const model = {
    bulkWrite: async (ops) => {
      const err = new Error("bulk failed");
      err.writeErrors = ops.map((_, index) => ({ index, errmsg: "bad" }));
      throw err;
    },
  };
  const inserter = new BulkInserter(model, { batchSize: 50, maxTrackedErrors: 20 });
  await inserter.addMany(docs(100));
  const stats = await inserter.finish();
  assert.equal(stats.failed, 100);
  assert.equal(stats.writeErrors.length, 20);
});

test("createBulkInsertStream works inside stream.pipeline and flushes the tail", async () => {
  const batches = [];
  const model = { bulkWrite: async (ops) => { batches.push(ops.length); return { insertedCount: ops.length }; } };

  const writer = createBulkInsertStream(model, { batchSize: 1000 });
  await pipeline(Readable.from(docs(2500)), writer);

  assert.deepEqual(batches, [1000, 1000, 500]);
  assert.equal(writer.inserter.stats.inserted, 2500);
});

test("backpressure: a slow database stops the source from racing ahead", async () => {
  let produced = 0;
  let inFlight = 0;
  let maxBuffered = 0;

  async function* source() {
    for (let i = 0; i < 5000; i++) {
      produced += 1;
      yield { n: i };
    }
  }

  const model = {
    bulkWrite: async (ops) => {
      // measure how far ahead the source got while the DB was "busy"
      inFlight += ops.length;
      maxBuffered = Math.max(maxBuffered, produced - (inFlight - ops.length));
      await new Promise((r) => setTimeout(r, 5));
      return { insertedCount: ops.length };
    },
  };

  const writer = createBulkInsertStream(model, { batchSize: 500 });
  await pipeline(Readable.from(source(), { objectMode: true }), writer);

  assert.equal(writer.inserter.stats.inserted, 5000);
  // 5,000 rows were produced, but never more than a few batches' worth
  // ahead of what the database had accepted.
  assert.ok(maxBuffered < 2500, `source ran ${maxBuffered} rows ahead of the database`);
});
