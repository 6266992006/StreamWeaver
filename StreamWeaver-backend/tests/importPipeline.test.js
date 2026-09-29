const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const { runImportPipeline } = require("../streams/importPipeline");
const { JobTracker } = require("../utils/jobTracker");
const { mapRow, validateRows } = require("../utils/dbValidators");

function fakeInsertModel({ failWith = null } = {}) {
  const inserted = [];
  const batches = [];
  return {
    inserted,
    batches,
    bulkWrite: async (ops) => {
      if (failWith) throw failWith;
      batches.push(ops.length);
      for (const op of ops) inserted.push(op.insertOne.document);
      return { insertedCount: ops.length };
    },
  };
}

function fakeJobModel() {
  const updates = [];
  return { updates, updateOne: async (filter, update) => { updates.push(update); } };
}

const mappingConfig = {
  name: { source: "Full Name", required: true },
  age: { source: "Age", type: "number" },
  email: { source: "Email", type: "email", required: true },
  active: { source: "Active", type: "boolean" },
};

const goodRow = (i) => ({ "Full Name": `User ${i}`, Age: `${20 + (i % 30)}`, Email: `u${i}@x.com`, Active: "true" });

// ---------- mapRow / validateRows ----------

test("mapRow renames columns and casts types; blanks become null", () => {
  const out = mapRow({ "Full Name": "  Ada ", Age: "36", Email: "ADA@X.COM", Active: "1" }, mappingConfig);
  assert.deepEqual(out, { name: "Ada", age: 36, email: "ada@x.com", active: true });

  const blanks = mapRow({ "Full Name": "Ada", Age: "", Email: "a@x.com" }, mappingConfig);
  assert.equal(blanks.age, null);
  assert.equal(blanks.active, null);
});

test("mapRow passes the row through unchanged when there is no mapping", () => {
  assert.deepEqual(mapRow({ a: 1, b: 2 }, {}), { a: 1, b: 2 });
});

test("validateRows startIndex keeps absolute row numbers across chunks", () => {
  const cfg = { name: { source: "n", required: true } };
  const { invalidRows } = validateRows([{ n: "" }, { n: "ok" }, { n: "" }], cfg, { startIndex: 1000 });
  assert.deepEqual(invalidRows.map((r) => r.row), [1000, 1002]);
});

// ---------- runImportPipeline ----------

test("streams 25,000 rows: validates, maps, batches by 1,000, reports exact totals", async () => {
  const total = 25_000;
  async function* rows() {
    for (let i = 1; i <= total; i++) {
      // every 100th row is invalid (no email)
      yield i % 100 === 0 ? { ...goodRow(i), Email: "" } : goodRow(i);
    }
  }

  const model = fakeInsertModel();
  const result = await runImportPipeline({ source: rows(), mappingConfig, model });

  assert.equal(result.status, "done");
  assert.equal(result.totalRows, 25_000);
  assert.equal(result.rowsFailed, 250);
  assert.equal(result.rowsProcessed, 24_750);
  assert.equal(model.inserted.length, 24_750);
  assert.ok(model.batches.every((n) => n <= 1000));
  assert.equal(model.batches.length, 25); // 24,750 rows / 1,000 -> 24 full + 1 partial
  assert.deepEqual(model.inserted[0], { name: "User 1", age: 21, email: "u1@x.com", active: true });

  // 1-based data-row numbers of the bad rows, in order
  assert.deepEqual(result.errorLog.slice(0, 3).map((e) => e.row), [100, 200, 300]);
  assert.match(result.errorLog[0].reason, /email is required/);
});

test("buildDocument wraps mapped rows (DatasetRow shape)", async () => {
  const model = fakeInsertModel();
  await runImportPipeline({
    source: [goodRow(1), goodRow(2)],
    mappingConfig,
    model,
    buildDocument: (data, rowNumber) => ({ datasetId: "d1", rowNumber, data }),
  });
  assert.equal(model.inserted[1].rowNumber, 2);
  assert.equal(model.inserted[1].data.name, "User 2");
  assert.equal(model.inserted[1].datasetId, "d1");
});

test("job tracker sees the full lifecycle: processing -> progress -> done", async () => {
  const jobModel = fakeJobModel();
  const tracker = new JobTracker("job1", { model: jobModel, progressIntervalMs: 0 });

  const rows = Array.from({ length: 3000 }, (_, i) => (i === 10 ? { ...goodRow(i), Email: "" } : goodRow(i)));
  const result = await runImportPipeline({ source: rows, mappingConfig, model: fakeInsertModel(), tracker, totalRows: 3000 });

  assert.equal(result.status, "done");
  assert.equal(jobModel.updates[0].$set.status, "processing");
  assert.equal(jobModel.updates[0].$set.totalRows, 3000);

  const last = jobModel.updates.at(-1).$set;
  assert.equal(last.status, "done");
  assert.equal(last.rowsProcessed, 2999);
  assert.equal(last.rowsFailed, 1);
  assert.equal(last.totalRows, 3000);

  // progress was reported while running, not just at the end
  const progressWrites = jobModel.updates.filter((u) => u.$set.status === undefined);
  assert.ok(progressWrites.length >= 2);

  // the bad row reached the job's errorLog
  const pushed = jobModel.updates.flatMap((u) => u.$push?.errorLog.$each ?? []);
  assert.deepEqual(pushed.map((e) => e.row), [11]);
});

test("errorLog is capped but rowsFailed is the true total", async () => {
  const rows = Array.from({ length: 500 }, () => ({ ...goodRow(1), Email: "" })); // all invalid
  const result = await runImportPipeline({
    source: rows,
    mappingConfig,
    model: fakeInsertModel(),
    maxErrorLog: 50,
  });
  assert.equal(result.rowsFailed, 500);
  assert.equal(result.errorLog.length, 50);
  assert.equal(result.errorsTruncated, true);
});

test("a DB error is reported against the real source row even when earlier rows were dropped", async () => {
  // rows 1 and 2 are invalid (dropped), so the 3rd row becomes op 0 in the batch.
  const rows = [{ ...goodRow(1), Email: "" }, { ...goodRow(2), Email: "" }, goodRow(3), goodRow(4)];
  const model = {
    bulkWrite: async () => {
      const err = new Error("bulk");
      err.writeErrors = [{ index: 1, errmsg: "E11000 duplicate key" }]; // op 1 = source row 4
      throw err;
    },
  };
  const result = await runImportPipeline({ source: rows, mappingConfig, model });
  assert.deepEqual(result.errorLog.map((e) => e.row), [1, 2, 4]);
  assert.equal(result.rowsFailed, 3);
});

test("database write errors are counted in rowsFailed and appear in errorLog", async () => {
  const model = {
    bulkWrite: async () => {
      const err = new Error("bulk");
      err.writeErrors = [{ index: 2, errmsg: "E11000 duplicate key" }];
      throw err;
    },
  };
  const result = await runImportPipeline({ source: [1, 2, 3, 4, 5].map(goodRow), mappingConfig, model });
  assert.equal(result.status, "done");
  assert.equal(result.rowsProcessed, 4);
  assert.equal(result.rowsFailed, 1);
  assert.deepEqual(result.errorLog.map((e) => e.row), [3]); // op index 2 = 3rd source row
});

test("if the database rejects every batch the job is marked failed, not done", async () => {
  const jobModel = fakeJobModel();
  const tracker = new JobTracker("job1", { model: jobModel, progressIntervalMs: 0 });
  const model = fakeInsertModel({ failWith: new Error("connection lost") });

  const result = await runImportPipeline({ source: [1, 2, 3].map(goodRow), mappingConfig, model, tracker });

  assert.equal(result.status, "failed");
  assert.match(result.errorMessage, /connection lost/);
  const last = jobModel.updates.at(-1).$set;
  assert.equal(last.status, "failed");
  assert.match(last.errorMessage, /connection lost/);
  assert.equal(result.rowsProcessed, 0);
  assert.equal(result.rowsFailed, 3);
});

test("a source that errors mid-stream fails the job and rejects", async () => {
  const jobModel = fakeJobModel();
  const tracker = new JobTracker("job1", { model: jobModel, progressIntervalMs: 0 });

  async function* broken() {
    yield goodRow(1);
    yield goodRow(2);
    throw new Error("CSV stream broke");
  }

  await assert.rejects(
    runImportPipeline({ source: Readable.from(broken(), { objectMode: true }), mappingConfig, model: fakeInsertModel(), tracker }),
    /CSV stream broke/
  );
  const last = jobModel.updates.at(-1).$set;
  assert.equal(last.status, "failed");
  assert.equal(last.errorMessage, "CSV stream broke");
});

test("an empty file completes cleanly with zero rows", async () => {
  const jobModel = fakeJobModel();
  const tracker = new JobTracker("job1", { model: jobModel, progressIntervalMs: 0 });
  const result = await runImportPipeline({ source: [], mappingConfig, model: fakeInsertModel(), tracker });
  assert.equal(result.status, "done");
  assert.equal(result.totalRows, 0);
  assert.equal(jobModel.updates.at(-1).$set.status, "done");
});
