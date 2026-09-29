const test = require("node:test");
const assert = require("node:assert/strict");

const { JobTracker, MAX_ERROR_LOG } = require("../utils/jobTracker");

// Fake TransformJob model that records every call.
function fakeModel() {
  const updates = [];
  return {
    updates,
    create: async (fields) => ({ _id: "job1", ...fields }),
    updateOne: async (filter, update) => { updates.push({ filter, update }); },
  };
}

function clock(start = 1_000_000) {
  let t = start;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  return fn;
}

test("create() makes a pending job and returns a tracker for it", async () => {
  const model = fakeModel();
  const tracker = await JobTracker.create({ datasetId: "d1", ownerId: "u1" }, { model });
  assert.equal(tracker.jobId, "job1");
});

test("start() marks the job processing and resets counters", async () => {
  const model = fakeModel();
  const tracker = new JobTracker("job1", { model, now: clock() });
  await tracker.start(5000);

  const { $set } = model.updates[0].update;
  assert.equal($set.status, "processing");
  assert.equal($set.totalRows, 5000);
  assert.equal($set.rowsProcessed, 0);
  assert.deepEqual($set.errorLog, []);
  assert.ok($set.startedAt instanceof Date);
});

test("progress() is throttled, but force always writes", async () => {
  const model = fakeModel();
  const now = clock();
  const tracker = new JobTracker("job1", { model, now, progressIntervalMs: 500 });
  await tracker.start();
  model.updates.length = 0;

  now.advance(100);
  assert.equal(await tracker.progress({ processed: 1000, failed: 0 }), false); // too soon
  now.advance(100);
  assert.equal(await tracker.progress({ processed: 2000, failed: 0 }), false);
  assert.equal(model.updates.length, 0);

  now.advance(400); // 600ms since start -> interval elapsed
  assert.equal(await tracker.progress({ processed: 3000, failed: 0 }), true);
  assert.equal(model.updates.length, 1);
  assert.equal(model.updates[0].update.$set.rowsProcessed, 3000); // latest, not stale

  assert.equal(await tracker.progress({ processed: 3100, failed: 0 }, { force: true }), true);
  assert.equal(model.updates.length, 2);
});

test("rowsPerSec is rows handled (processed + failed) over elapsed time", async () => {
  const model = fakeModel();
  const now = clock();
  const tracker = new JobTracker("job1", { model, now });
  await tracker.start();
  now.advance(2000);
  await tracker.progress({ processed: 3800, failed: 200 }, { force: true });
  assert.equal(model.updates.at(-1).update.$set.rowsPerSec, 2000); // 4000 rows / 2s
});

test("errors are pushed with $slice so the job document can't grow unbounded", async () => {
  const model = fakeModel();
  const tracker = new JobTracker("job1", { model, now: clock(), maxErrorLog: 3 });
  await tracker.start();
  tracker.addErrors([{ row: 1, reason: "a" }, { row: 2, reason: "b" }]);
  tracker.addErrors([{ row: 3, reason: "c" }, { row: 4, reason: "d" }]); // 4th is over the cap
  await tracker.progress({ processed: 0, failed: 4 }, { force: true });

  const { $push } = model.updates.at(-1).update;
  assert.deepEqual($push.errorLog.$each.map((e) => e.row), [1, 2, 3]);
  assert.equal($push.errorLog.$slice, 3);
});

test("complete() writes the final state", async () => {
  const model = fakeModel();
  const tracker = new JobTracker("job1", { model, now: clock() });
  await tracker.start();
  await tracker.complete({ processed: 950, failed: 50, total: 1000 });

  const { $set } = model.updates.at(-1).update;
  assert.equal($set.status, "done");
  assert.equal($set.totalRows, 1000);
  assert.equal($set.rowsProcessed, 950);
  assert.equal($set.rowsFailed, 50);
  assert.ok($set.finishedAt instanceof Date);
});

test("fail() records why, and keeps the last known counts", async () => {
  const model = fakeModel();
  const tracker = new JobTracker("job1", { model, now: clock() });
  await tracker.start();
  await tracker.progress({ processed: 400, failed: 10 });
  await tracker.fail("connection lost");

  const { $set } = model.updates.at(-1).update;
  assert.equal($set.status, "failed");
  assert.equal($set.errorMessage, "connection lost");
  assert.equal($set.rowsProcessed, 400);
});

test("default cap is 1000 and a jobId is required", () => {
  assert.equal(MAX_ERROR_LOG, 1000);
  assert.throws(() => new JobTracker(null, { model: fakeModel() }));
});
