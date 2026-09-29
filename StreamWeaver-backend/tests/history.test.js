const test = require("node:test");
const assert = require("node:assert/strict");

// The controller requires the real Mongoose models at load time, so put
// fakes into require.cache first (no database needed).
function stubModel(relPath, exports) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const datasets = [
  { _id: "d3", originalFileName: "c.csv", createdAt: new Date("2026-03-03"), fileSizeBytes: 300, rowCount: 30, status: "uploaded" },
  { _id: "d2", originalFileName: "b.csv", createdAt: new Date("2026-03-02"), fileSizeBytes: 200, rowCount: 20, status: "uploaded" },
  { _id: "d1", originalFileName: "a.csv", createdAt: new Date("2026-03-01"), fileSizeBytes: 100, rowCount: 10, status: "uploaded" },
];
// newest first, like the real query. d1 was run twice: the LATEST run wins.
const jobs = [
  { _id: "j3", datasetId: "d1", status: "processing", totalRows: 50, rowsProcessed: 20, rowsFailed: 1, rowsPerSec: 900 },
  { _id: "j1", datasetId: "d1", status: "failed", totalRows: 50, rowsProcessed: 0, rowsFailed: 0, rowsPerSec: 0, errorMessage: "old failure" },
  { _id: "j2", datasetId: "d2", status: "done", totalRows: 20, rowsProcessed: 19, rowsFailed: 1, rowsPerSec: 5000 },
];

let datasetFilter = null;
let jobFilter = null;
const chain = (result) => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => result });

stubModel("../models/Dataset", { find: (f) => { datasetFilter = f; return chain(datasets); } });
stubModel("../models/TransformJob", { find: (f) => { jobFilter = f; return chain(jobs); } });

const { getHistory, buildHistoryItem } = require("../controllers/historyController");

function run(req) {
  return new Promise((resolve) => {
    const res = { status(code) { this.code = code; return this; }, json(body) { resolve({ code: this.code, body }); } };
    getHistory(req, res);
  });
}

test("only queries the logged-in user's datasets", async () => {
  await run({ userId: "user-42" });
  assert.deepEqual(datasetFilter, { ownerId: "user-42" });
  assert.deepEqual(jobFilter.datasetId.$in, ["d3", "d2", "d1"]);
});

test("a dataset with no job shows its upload status and row estimate", async () => {
  const { body } = await run({ userId: "u" });
  const d3 = body.jobs.find((j) => j.id === "d3");
  assert.equal(d3.status, "uploaded");
  assert.equal(d3.totalRows, 30);
  assert.equal(d3.sizeBytes, 300);
  assert.equal(d3.jobId, null);
  assert.equal(d3.rowsFailed, 0);
});

test("a dataset with jobs shows its most recent job's status and counters", async () => {
  const { body } = await run({ userId: "u" });
  const d1 = body.jobs.find((j) => j.id === "d1");
  assert.equal(d1.status, "processing"); // j3, not the older failed j1
  assert.equal(d1.jobId, "j3");
  assert.equal(d1.rowsProcessed, 20);
  assert.equal(d1.rowsFailed, 1);
  assert.equal(d1.rowsPerSec, 900);
  assert.equal(d1.errorMessage, null);

  const d2 = body.jobs.find((j) => j.id === "d2");
  assert.equal(d2.status, "done");
  assert.equal(d2.totalRows, 20);
});

test("returns newest upload first and success:true", async () => {
  const { code, body } = await run({ userId: "u" });
  assert.equal(code, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.jobs.map((j) => j.id), ["d3", "d2", "d1"]);
});

test("buildHistoryItem tolerates missing optional fields", () => {
  const item = buildHistoryItem({ _id: "x", originalFileName: "x.csv", status: "uploaded" }, undefined);
  assert.equal(item.sizeBytes, 0);
  assert.equal(item.totalRows, 0);
  assert.equal(item.finishedAt, null);
});
