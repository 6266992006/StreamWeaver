const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const BE = path.join(__dirname, "..");

/**
 * Boots the REAL server.js as a child process (no mocked internals — this
 * is specifically here to catch drift in server.js itself, like a route
 * being wired without the root/health-check response being updated to
 * list it, which slipped through once before because every other test
 * exercises route handlers directly rather than booting the server).
 */
function bootServer(port) {
  return new Promise((resolve, reject) => {
    const stubPath = path.join(__dirname, "_stubModelsForSmoke.js");
    const child = spawn("node", ["-r", stubPath, "server.js"], {
      cwd: BE,
      env: { ...process.env, PORT: String(port), JWT_SECRET: "smoke_test_secret", MONGO_URI: "mongodb://127.0.0.1:1/unused" },
    });

    let out = "";
    const onData = (d) => {
      out += d.toString();
      if (out.includes("Server running")) {
        child.stdout.off("data", onData);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.on("error", reject);
    setTimeout(() => reject(new Error(`server didn't start within 5s. Output so far:\n${out}`)), 5000);
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2000); // in case shutdown itself hangs
  });
}

test.before(() => {
  // A tiny stub for User/Dataset/TransformJob, written to disk so the
  // spawned process (which has its own require cache) can load it with -r.
  fs.writeFileSync(
    path.join(__dirname, "_stubModelsForSmoke.js"),
    `
    const path = require("path");
    const stub = (rel, exp) => {
      const p = require.resolve(path.join(${JSON.stringify(BE)}, rel));
      require.cache[p] = { id: p, filename: p, loaded: true, exports: exp };
    };
    stub("models/User.js", { findOne: async () => null, create: async (d) => ({ _id: "1".repeat(24), ...d }) });
    stub("models/Dataset.js", { find: () => ({ sort: function () { return this; }, limit: function () { return this; }, lean: async () => [] }) });
    stub("models/TransformJob.js", { find: () => ({ select: function () { return this; }, lean: async () => [] }) });
    `
  );
});

test.after(() => {
  fs.unlinkSync(path.join(__dirname, "_stubModelsForSmoke.js"));
});

test("server.js: the root route actually lists every route it wires up", async () => {
  const port = 5500 + Math.floor(Math.random() * 400);
  const child = await bootServer(port);

  try {
    const res = await fetch(`http://localhost:${port}/`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    // This is the exact bug that slipped through once: a route gets wired
    // with app.use(...) but the diagnostic list above it is never updated
    // to match, so "is my server up to date?" can't be answered by it.
    for (const route of ["/api/auth", "/api/upload", "/api/parse", "/api/mapping", "/api/jobs", "/ws/progress"]) {
      assert.ok(body.routes?.includes(route), `expected "/" to list ${route}, got: ${JSON.stringify(body.routes)}`);
    }
  } finally {
    await stopServer(child);
  }
});

test("server.js: /api/health reports DB connection state and the same route list", async () => {
  const port = 5500 + Math.floor(Math.random() * 400);
  const child = await bootServer(port);

  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.status, "ok");
    assert.equal(body.db, "disconnected"); // MONGO_URI above is unreachable on purpose
    assert.ok(Array.isArray(body.routes) && body.routes.length >= 5);
  } finally {
    await stopServer(child);
  }
});

test("server.js: an unknown route gets a clean 404, not a crash", async () => {
  const port = 5500 + Math.floor(Math.random() * 400);
  const child = await bootServer(port);

  try {
    const res = await fetch(`http://localhost:${port}/api/this-does-not-exist`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.message, "Route not found");
  } finally {
    await stopServer(child);
  }
});

test("server.js: SIGTERM shuts down cleanly", async () => {
  const port = 5500 + Math.floor(Math.random() * 400);
  const child = await bootServer(port);

  const exitCode = await new Promise((resolve) => {
    child.once("exit", (code) => resolve(code));
    child.kill("SIGTERM");
  });

  assert.equal(exitCode, 0);
});
