const test = require("node:test");
const assert = require("node:assert/strict");

const { BulkInserter } = require("../streams/bulkInsert");
const { validators, isValidObjectId, validateRow, validateRows } = require("../utils/dbValidators");
const { processRows } = require("../streams/processRows");

// A minimal fake Mongoose model so these tests run without a real MongoDB.
function makeFakeModel({ failEveryNth = null } = {}) {
  const calls = [];
  return {
    calls,
    bulkWrite: async (ops) => {
      calls.push(ops.length);
      if (!failEveryNth) {
        return { insertedCount: ops.length, insertedIds: {} };
      }
      // Simulate MongoDB rejecting some ops in the batch (e.g. cast errors).
      const writeErrors = [];
      ops.forEach((_, i) => {
        if (i % failEveryNth === 0) writeErrors.push({ index: i, errmsg: "Simulated write error" });
      });
      if (writeErrors.length) {
        const err = new Error("bulkWrite partial failure");
        err.writeErrors = writeErrors;
        throw err;
      }
      return { insertedCount: ops.length, insertedIds: {} };
    },
  };
}

// ---------- BulkInserter ----------

test("BulkInserter flushes in batches of the configured size", async () => {
  const model = makeFakeModel();
  const inserter = new BulkInserter(model, { batchSize: 1000 });

  await inserter.addMany(Array.from({ length: 2500 }, (_, i) => ({ n: i })));
  const stats = await inserter.finish();

  assert.deepEqual(model.calls, [1000, 1000, 500]);
  assert.equal(stats.inserted, 2500);
  assert.equal(stats.failed, 0);
  assert.equal(stats.batches, 3);
});

test("BulkInserter.finish() on an empty buffer is a no-op", async () => {
  const model = makeFakeModel();
  const inserter = new BulkInserter(model, { batchSize: 1000 });
  const stats = await inserter.finish();

  assert.deepEqual(model.calls, []);
  assert.equal(stats.inserted, 0);
});

test("BulkInserter counts partial write failures without losing successful rows", async () => {
  const model = makeFakeModel({ failEveryNth: 5 }); // every 5th row in a batch fails
  const inserter = new BulkInserter(model, { batchSize: 10 });

  await inserter.addMany(Array.from({ length: 10 }, (_, i) => ({ n: i })));
  const stats = await inserter.finish();

  assert.equal(stats.inserted, 8); // 10 rows - 2 failures (index 0 and 5)
  assert.equal(stats.failed, 2);
});

// ---------- dbValidators ----------

test("validateRow flags missing required fields and bad types", () => {
  const mappingConfig = {
    name: { source: "Name", required: true },
    age: { source: "Age", type: "number" },
  };

  const good = validateRow({ Name: "Krishna", Age: "22" }, mappingConfig);
  assert.equal(good.valid, true);

  const bad = validateRow({ Name: "", Age: "not-a-number" }, mappingConfig);
  assert.equal(bad.valid, false);
  assert.equal(bad.errors.length, 2);
});

test("validateRows splits a batch into valid/invalid with row indices", () => {
  const mappingConfig = { email: { source: "Email", type: "email", required: true } };
  const rows = [
    { Email: "a@test.com" },
    { Email: "not-an-email" },
    { Email: "" },
  ];

  const { validRows, invalidRows } = validateRows(rows, mappingConfig);

  assert.equal(validRows.length, 1);
  assert.equal(invalidRows.length, 2);
  assert.deepEqual(invalidRows.map((r) => r.row), [1, 2]);
});

test("isValidObjectId accepts real ObjectIds and rejects junk", () => {
  assert.equal(isValidObjectId("507f1f77bcf86cd799439011"), true);
  assert.equal(isValidObjectId("not-an-id"), false);
});

test("validators.email / .number / .date behave as expected", () => {
  assert.equal(validators.email("a@b.com"), true);
  assert.equal(validators.email("nope"), false);
  assert.equal(validators.number("42"), true);
  assert.equal(validators.number("abc"), false);
  assert.equal(validators.date("2024-01-01"), true);
  assert.equal(validators.date("not-a-date"), false);
});

// ---------- processRows (full pipeline) ----------

test("processRows validates then batch-inserts, reporting accurate totals", async () => {
  const mappingConfig = { name: { source: "Name", required: true } };
  const model = makeFakeModel();

  const rows = [
    ...Array.from({ length: 5 }, (_, i) => ({ Name: `User${i}` })), // valid
    { Name: "" }, // invalid
  ];

  const result = await processRows(rows, { mappingConfig, model, batchSize: 1000 });

  assert.equal(result.totalRows, 6);
  assert.equal(result.rowsProcessed, 5);
  assert.equal(result.rowsFailed, 1);
  assert.equal(result.errorLog.length, 1);
});
