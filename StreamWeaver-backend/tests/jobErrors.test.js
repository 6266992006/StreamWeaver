const test = require("node:test");
const assert = require("node:assert/strict");

// The controller requires the real Mongoose models at load time, so put
// fakes into require.cache first (no database needed).
function stubModel(relPath, exports) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const JOB_ID = "a".repeat(24);
let filterSeen = null;
let jobDoc = null;
const chain = () => ({ select() { return this; }, lean: async () => jobDoc });

stubModel("../models/Dataset", { find: () => ({}) });
stubModel("../models/TransformJob", { findOne: (f) => { filterSeen = f; return chain(); } });

const { getJobErrors } = require("../controllers/historyController");

function run(params) {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return getJobErrors({ params, userId: "user1" }, res).then(() => res);
}

test("returns the error log of the user's own job", async () => {
  jobDoc = { _id: JOB_ID, status: "done", rowsFailed: 2, errorLog: [{ row: 3, reason: "x is required" }, { row: 9, reason: "bad" }] };
  const res = await run({ jobId: JOB_ID });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(filterSeen, { _id: JOB_ID, ownerId: "user1" }); // scoped to the owner
  assert.deepEqual(res.body.errors, [{ row: 3, reason: "x is required" }, { row: 9, reason: "bad" }]);
  assert.equal(res.body.truncated, false);
});

test("flags truncation when rowsFailed exceeds the stored log", async () => {
  jobDoc = { _id: JOB_ID, status: "done", rowsFailed: 5000, errorLog: [{ row: 1, reason: "r" }] };
  const res = await run({ jobId: JOB_ID });
  assert.equal(res.body.truncated, true);
  assert.equal(res.body.rowsFailed, 5000);
});

test("404 when the job is missing or belongs to someone else", async () => {
  jobDoc = null;
  assert.equal((await run({ jobId: JOB_ID })).statusCode, 404);
});

test("400 for a malformed job id", async () => {
  assert.equal((await run({ jobId: "nope" })).statusCode, 400);
});
