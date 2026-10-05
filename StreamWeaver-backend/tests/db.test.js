const test = require("node:test");
const assert = require("node:assert/strict");

function withStubbedMongoose(fn) {
  const Module = require("module");
  const origResolve = Module._load;

  const calls = { connect: null };
  const listeners = {};
  const fakeConnection = {
    on: (event, handler) => {
      listeners[event] = handler;
    },
  };
  const fakeMongoose = {
    connect: async (uri, options) => {
      calls.connect = { uri, options };
    },
    connection: fakeConnection,
  };

  Module._load = function (request, parent, isMain) {
    if (request === "mongoose") return fakeMongoose;
    return origResolve.apply(this, arguments);
  };

  try {
    return fn({ calls, listeners });
  } finally {
    Module._load = origResolve;
  }
}

test("connects with compression and a warm minimum pool", async () => {
  await withStubbedMongoose(async ({ calls }) => {
    delete require.cache[require.resolve("../config/db")];
    process.env.MONGO_URI = "mongodb://example/test";
    const connectDB = require("../config/db");
    await connectDB();

    assert.equal(calls.connect.uri, "mongodb://example/test");
    assert.deepEqual(calls.connect.options.compressors, ["zlib"]);
    assert.equal(calls.connect.options.minPoolSize, 2);
    assert.equal(calls.connect.options.serverSelectionTimeoutMS, 5000);
  });
});

test("registers disconnected/reconnected listeners after a successful connect", async () => {
  await withStubbedMongoose(async ({ listeners }) => {
    delete require.cache[require.resolve("../config/db")];
    const connectDB = require("../config/db");
    await connectDB();

    assert.equal(typeof listeners.disconnected, "function");
    assert.equal(typeof listeners.reconnected, "function");
  });
});

test("a failed connect is caught and never throws", async () => {
  const Module = require("module");
  const origResolve = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "mongoose") {
      return { connect: async () => { throw new Error("ECONNREFUSED"); }, connection: { on: () => {} } };
    }
    return origResolve.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve("../config/db")];
    const connectDB = require("../config/db");
    await assert.doesNotReject(connectDB());
  } finally {
    Module._load = origResolve;
  }
});
