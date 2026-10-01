const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const WebSocket = require("ws");

const { ProgressHub, buildProgressPayload, WS_PATH } = require("../sockets/progressSocket");

// ---- helpers ----------------------------------------------------------------

const USER_A = "a".repeat(24);
const USER_B = "b".repeat(24);
const JOB_1 = "1".repeat(24);
const JOB_2 = "2".repeat(24);

// Fake TransformJob model: an in-memory table + a call counter, so tests can
// assert "one batched query per tick".
function fakeModel(initial = []) {
  const jobs = new Map(initial.map((j) => [String(j._id), { ...j }]));
  const calls = { findOne: 0, find: 0 };
  const chain = (result) => ({ select: () => ({ lean: async () => result }) });
  return {
    jobs,
    calls,
    set(id, patch) {
      jobs.set(id, { ...jobs.get(id), ...patch });
    },
    findOne(filter) {
      calls.findOne += 1;
      const j = jobs.get(String(filter._id));
      const ok = j && String(j.ownerId) === String(filter.ownerId);
      return chain(ok ? { ...j } : null);
    },
    find(filter) {
      calls.find += 1;
      const ids = filter._id.$in.map(String);
      return chain(ids.filter((id) => jobs.has(id)).map((id) => ({ ...jobs.get(id) })));
    },
  };
}

const job = (id, owner, extra = {}) => ({
  _id: id,
  ownerId: owner,
  status: "processing",
  totalRows: 1000,
  rowsProcessed: 0,
  rowsFailed: 0,
  rowsPerSec: 0,
  startedAt: null,
  finishedAt: null,
  errorMessage: null,
  ...extra,
});

// Tokens in tests are just "token-<userId>".
const verifyToken = (t) => {
  if (!t.startsWith("token-")) throw new Error("bad token");
  return t.slice(6);
};

async function setup(model, hubOptions = {}) {
  const server = http.createServer();
  const hub = new ProgressHub({
    model,
    verifyToken,
    pollIntervalMs: 20,
    heartbeatMs: 60_000,
    log: () => {},
    ...hubOptions,
  }).attach(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return {
    hub,
    server,
    url: (token) => `ws://127.0.0.1:${port}${WS_PATH}${token ? `?token=${token}` : ""}`,
    async stop() {
      await hub.close();
      await new Promise((r) => server.close(r));
    },
  };
}

// A client that queues every frame so tests can `await next()` in order.
function connect(url) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  ws.on("message", (d) => {
    const msg = JSON.parse(d.toString());
    const w = waiters.shift();
    if (w) w(msg);
    else queue.push(msg);
  });
  const next = (ms = 1000) =>
    new Promise((resolve, reject) => {
      if (queue.length) return resolve(queue.shift());
      const t = setTimeout(() => reject(new Error("timed out waiting for a frame")), ms);
      waiters.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
  const opened = new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) => reject(Object.assign(new Error("rejected"), { status: res.statusCode })));
  });
  const send = (obj) => ws.send(JSON.stringify(obj));
  return { ws, next, opened, send, queue };
}

async function open(url) {
  const c = connect(url);
  await c.opened;
  assert.equal((await c.next()).type, "ready");
  return c;
}

// ---- buildProgressPayload ---------------------------------------------------

test("payload: percent counts processed + failed rows against totalRows", () => {
  const p = buildProgressPayload(job(JOB_1, USER_A, { rowsProcessed: 400, rowsFailed: 100 }));
  assert.equal(p.percent, 50);
  assert.equal(p.type, "progress");
  assert.equal(p.jobId, JOB_1);
});

test("payload: percent is null while totalRows is unknown, 100 when done", () => {
  assert.equal(buildProgressPayload(job(JOB_1, USER_A, { totalRows: 0, rowsProcessed: 50 })).percent, null);
  assert.equal(buildProgressPayload(job(JOB_1, USER_A, { status: "done", totalRows: 0 })).percent, 100);
});

test("payload: percent never exceeds 100", () => {
  const p = buildProgressPayload(job(JOB_1, USER_A, { totalRows: 10, rowsProcessed: 50 }));
  assert.equal(p.percent, 100);
});

test("payload: does not leak ownerId or errorLog", () => {
  const p = buildProgressPayload({ ...job(JOB_1, USER_A), errorLog: [{ row: 1, reason: "x" }] });
  assert.equal("ownerId" in p, false);
  assert.equal("errorLog" in p, false);
});

// ---- auth -------------------------------------------------------------------

test("upgrade without a token is rejected with 401", async () => {
  const s = await setup(fakeModel());
  try {
    await assert.rejects(connect(s.url()).opened, (e) => e.status === 401);
  } finally {
    await s.stop();
  }
});

test("upgrade with an invalid token is rejected with 401", async () => {
  const s = await setup(fakeModel());
  try {
    await assert.rejects(connect(s.url("garbage")).opened, (e) => e.status === 401);
  } finally {
    await s.stop();
  }
});

test("a valid token connects and receives 'ready'", async () => {
  const s = await setup(fakeModel());
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("other upgrade paths are left alone (not claimed by the hub)", async () => {
  const s = await setup(fakeModel());
  try {
    const other = new WebSocket(s.url(`token-${USER_A}`).replace(WS_PATH, "/somewhere-else"));
    other.on("error", () => {});
    // Nobody handles it, so it must not become an open socket.
    await new Promise((r) => setTimeout(r, 150));
    assert.notEqual(other.readyState, WebSocket.OPEN);
    other.terminate();
  } finally {
    await s.stop();
  }
});

// ---- subscribe --------------------------------------------------------------

test("subscribe sends an immediate snapshot", async () => {
  const model = fakeModel([job(JOB_1, USER_A, { rowsProcessed: 250, rowsPerSec: 5000 })]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    const p = await c.next();
    assert.equal(p.type, "progress");
    assert.equal(p.rowsProcessed, 250);
    assert.equal(p.rowsPerSec, 5000);
    assert.equal(p.percent, 25);
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("a user cannot watch someone else's job (looks like 'not found')", async () => {
  const s = await setup(fakeModel([job(JOB_1, USER_A)]));
  try {
    const c = await open(s.url(`token-${USER_B}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    const e = await c.next();
    assert.equal(e.type, "error");
    assert.equal(e.message, "Job not found");
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("invalid jobId and bad JSON get an error frame, connection stays open", async () => {
  const s = await setup(fakeModel());
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: "not-an-id" });
    assert.equal((await c.next()).message, "Invalid jobId");

    c.ws.send("{not json");
    assert.equal((await c.next()).message, "Invalid JSON");

    c.send({ type: "ping" });
    assert.equal((await c.next()).type, "pong");
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("subscriptions per socket are capped", async () => {
  const ids = Array.from({ length: 3 }, (_, i) => String(i + 1).repeat(24));
  const model = fakeModel(ids.map((id) => job(id, USER_A)));
  const s = await setup(model, { maxSubscriptions: 2 });
  try {
    const c = await open(s.url(`token-${USER_A}`));
    for (const id of ids) c.send({ type: "subscribe", jobId: id });
    assert.equal((await c.next()).type, "progress");
    assert.equal((await c.next()).type, "progress");
    const e = await c.next();
    assert.equal(e.message, "Too many subscriptions");
    c.ws.close();
  } finally {
    await s.stop();
  }
});

// ---- live updates -----------------------------------------------------------

test("pushes only when the counters change", async () => {
  const model = fakeModel([job(JOB_1, USER_A)]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    await c.next(); // snapshot

    // Several ticks pass with no change -> nothing is sent.
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(c.queue.length, 0);

    model.set(JOB_1, { rowsProcessed: 500, rowsPerSec: 9000 });
    const p = await c.next();
    assert.equal(p.rowsProcessed, 500);
    assert.equal(p.percent, 50);

    // ...and then quiet again.
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(c.queue.length, 0);
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("final 'done' frame is sent, then the subscription is dropped", async () => {
  const model = fakeModel([job(JOB_1, USER_A)]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    await c.next();

    model.set(JOB_1, { status: "done", rowsProcessed: 1000, finishedAt: new Date() });
    const p = await c.next();
    assert.equal(p.status, "done");
    assert.equal(p.percent, 100);

    // Polling stops once nothing is being watched.
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(s.hub.pollTimer, null);
    const callsAfter = model.calls.find;
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(model.calls.find, callsAfter);
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("a job that already finished gets one snapshot and starts no polling", async () => {
  const model = fakeModel([job(JOB_1, USER_A, { status: "done", rowsProcessed: 1000 })]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    assert.equal((await c.next()).status, "done");
    assert.equal(s.hub.pollTimer, null);
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("failed jobs carry the error message", async () => {
  const model = fakeModel([job(JOB_1, USER_A)]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    await c.next();
    model.set(JOB_1, { status: "failed", errorMessage: "Database rejected every batch" });
    const p = await c.next();
    assert.equal(p.status, "failed");
    assert.equal(p.errorMessage, "Database rejected every batch");
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("many clients + many jobs still cost ONE batched query per tick", async () => {
  const model = fakeModel([job(JOB_1, USER_A), job(JOB_2, USER_A)]);
  const s = await setup(model, { pollIntervalMs: 50 });
  try {
    const clients = [];
    for (let i = 0; i < 3; i++) {
      const c = await open(s.url(`token-${USER_A}`));
      c.send({ type: "subscribe", jobId: JOB_1 });
      c.send({ type: "subscribe", jobId: JOB_2 });
      await c.next();
      await c.next();
      clients.push(c);
    }

    const before = model.calls.find;
    await new Promise((r) => setTimeout(r, 230)); // ~4 ticks
    const ticks = model.calls.find - before;
    assert.ok(ticks >= 2 && ticks <= 6, `expected a few batched queries, got ${ticks}`);

    // every client sees the update
    model.set(JOB_1, { rowsProcessed: 300 });
    for (const c of clients) assert.equal((await c.next()).rowsProcessed, 300);
    clients.forEach((c) => c.ws.close());
  } finally {
    await s.stop();
  }
});

test("unsubscribe stops updates for that job", async () => {
  const model = fakeModel([job(JOB_1, USER_A)]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    await c.next();
    c.send({ type: "unsubscribe", jobId: JOB_1 });
    await new Promise((r) => setTimeout(r, 60));

    model.set(JOB_1, { rowsProcessed: 700 });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(c.queue.length, 0);
    assert.equal(s.hub.pollTimer, null);
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("a job deleted while watched sends 'not found' and is dropped", async () => {
  const model = fakeModel([job(JOB_1, USER_A)]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    await c.next();
    model.jobs.delete(JOB_1);
    const e = await c.next();
    assert.equal(e.type, "error");
    assert.equal(e.message, "Job not found");
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("a DB error during a tick is survived — the next tick recovers", async () => {
  const model = fakeModel([job(JOB_1, USER_A)]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    await c.next();

    const realFind = model.find.bind(model);
    let failures = 2;
    model.find = (f) => {
      if (failures-- > 0) throw new Error("db down");
      return realFind(f);
    };

    model.set(JOB_1, { rowsProcessed: 123 });
    assert.equal((await c.next(2000)).rowsProcessed, 123);
    c.ws.close();
  } finally {
    await s.stop();
  }
});

test("client disconnect clears its subscriptions and stops polling", async () => {
  const model = fakeModel([job(JOB_1, USER_A)]);
  const s = await setup(model);
  try {
    const c = await open(s.url(`token-${USER_A}`));
    c.send({ type: "subscribe", jobId: JOB_1 });
    await c.next();
    assert.ok(s.hub.pollTimer);
    c.ws.close();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(s.hub.pollTimer, null);
  } finally {
    await s.stop();
  }
});
