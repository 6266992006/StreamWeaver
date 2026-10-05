const test = require("node:test");
const assert = require("node:assert/strict");

const { run, diffIndexes } = require("../config/dbIndexes");

// A fake Mongoose model: `declared` is what the schema says should exist
// (schema.indexes() shape: [[keys, options], ...]); `existing` is what
// MongoDB currently has (collection.getIndexes() shape: { name: keys }).
// syncIndexes() is modelled the same way the real one behaves: it creates
// what's missing, drops what's no longer declared, and returns the dropped names.
function fakeModel(declared, existing) {
  const state = { ...existing };
  return {
    schema: { indexes: () => declared.map((keys) => [keys, {}]) },
    collection: {
      getIndexes: async () => ({ ...state }),
    },
    syncIndexes: async () => {
      const declaredKeys = declared.map((k) => JSON.stringify(k));
      const dropped = [];

      for (const [name, keys] of Object.entries(state)) {
        if (name === "_id_") continue;
        if (!declaredKeys.includes(JSON.stringify(keys))) {
          delete state[name];
          dropped.push(name);
        }
      }
      for (const keys of declared) {
        const already = Object.values(state).some((k) => JSON.stringify(k) === JSON.stringify(keys));
        if (!already) state[`idx_${Object.keys(state).length}`] = keys;
      }
      return dropped;
    },
  };
}

test("diffIndexes: nothing to do when the schema and DB already match", async () => {
  const model = fakeModel([{ ownerId: 1 }], { _id_: { _id: 1 }, ownerId_1: { ownerId: 1 } });
  const { toCreate, toDrop, existingCount } = await diffIndexes(model);
  assert.deepEqual(toCreate, []);
  assert.deepEqual(toDrop, []);
  assert.equal(existingCount, 1); // _id_ excluded
});

test("diffIndexes: reports an index the schema wants that's missing in the DB", async () => {
  const model = fakeModel([{ ownerId: 1, createdAt: -1 }], { _id_: { _id: 1 } });
  const { toCreate, toDrop } = await diffIndexes(model);
  assert.deepEqual(toCreate, [{ ownerId: 1, createdAt: -1 }]);
  assert.deepEqual(toDrop, []);
});

test("diffIndexes: reports a stale index the DB has that the schema no longer wants", async () => {
  const model = fakeModel([], { _id_: { _id: 1 }, ownerId_1: { ownerId: 1 } });
  const { toCreate, toDrop } = await diffIndexes(model);
  assert.deepEqual(toCreate, []);
  assert.deepEqual(toDrop, [{ ownerId: 1 }]);
});

test("--check mode reports drift without calling syncIndexes", async () => {
  let syncCalled = false;
  const model = fakeModel([{ email: 1 }], { _id_: { _id: 1 } });
  model.syncIndexes = async () => { syncCalled = true; return []; };

  const Module = require("module");
  const origResolve = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "FAKE_CHECK_MODEL") return model;
    return origResolve.apply(this, arguments);
  };

  let results;
  try {
    results = await run({
      check: true,
      models: [{ name: "User", path: "FAKE_CHECK_MODEL" }],
      log: () => {},
    });
  } finally {
    Module._load = origResolve;
  }

  assert.equal(syncCalled, false);
  assert.equal(results[0].changed, true);
  assert.deepEqual(results[0].created, [{ email: 1 }]);
});

test("run() applies changes and logs create/drop lines when not in check mode", async () => {
  const users = fakeModel([{ email: 1 }], { _id_: { _id: 1 } });
  const datasets = fakeModel([{ ownerId: 1, createdAt: -1 }], { _id_: { _id: 1 }, ownerId_1: { ownerId: 1 } });

  const origLoad = require("../config/dbIndexes");
  const lines = [];

  // run() loads models by require(path); swap in fakes via a models list
  // whose "path" is resolved through a tiny shim module cache trick.
  const Module = require("module");
  const origResolve = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "FAKE_USER") return users;
    if (request === "FAKE_DATASET") return datasets;
    return origResolve.apply(this, arguments);
  };

  try {
    const results = await origLoad.run({
      models: [
        { name: "User", path: "FAKE_USER" },
        { name: "Dataset", path: "FAKE_DATASET" },
      ],
      log: (line) => lines.push(line),
    });

    assert.equal(results.find((r) => r.name === "User").created.length, 1);
    assert.equal(results.find((r) => r.name === "Dataset").created.length, 1);
    assert.ok(lines.some((l) => l.includes("created") && l.includes("email")));
    assert.ok(lines.some((l) => l.includes("Done")));
  } finally {
    Module._load = origResolve;
  }
});

test("run() calls connect() before touching any model", async () => {
  let connected = false;
  const model = fakeModel([], { _id_: { _id: 1 } });

  const Module = require("module");
  const origResolve = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "FAKE_MODEL") return model;
    return origResolve.apply(this, arguments);
  };

  try {
    await run({
      check: true,
      models: [{ name: "X", path: "FAKE_MODEL" }],
      connect: async () => { connected = true; },
      log: () => {},
    });
  } finally {
    Module._load = origResolve;
  }

  assert.equal(connected, true);
});

test("diffIndexes: a changed `unique` flag counts as drift", async () => {
  const model = {
    schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
    collection: {
      // The DB has the index, but without unique
      indexes: async () => [{ name: "_id_", key: { _id: 1 } }, { name: "email_1", key: { email: 1 } }],
      getIndexes: async () => ({}),
    },
  };
  const { toCreate, toDrop } = await diffIndexes(model);
  assert.deepEqual(toCreate, [{ email: 1 }]);
  assert.deepEqual(toDrop, [{ email: 1 }]);
});

test("diffIndexes: matching unique flag means no drift", async () => {
  const model = {
    schema: { indexes: () => [[{ email: 1 }, { unique: true }]] },
    collection: {
      indexes: async () => [{ name: "_id_", key: { _id: 1 } }, { name: "email_1", key: { email: 1 }, unique: true }],
      getIndexes: async () => ({}),
    },
  };
  const { toCreate, toDrop } = await diffIndexes(model);
  assert.deepEqual(toCreate, []);
  assert.deepEqual(toDrop, []);
});
