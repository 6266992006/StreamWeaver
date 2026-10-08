const test = require("node:test");
const assert = require("node:assert/strict");

// Both models are required at module-load time, so stub them into the
// require cache before pulling in exportController (same pattern as
// tests/history.test.js).
function stubModel(relPath, exports) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const mongoose = require("mongoose");

const DATASET_ID = new mongoose.Types.ObjectId().toString();
const OWNER_ID = new mongoose.Types.ObjectId().toString();

const datasets = [
  { _id: DATASET_ID, ownerId: OWNER_ID, originalFileName: "customers.csv" },
];

// rowsByDataset lets each test control exactly what the cursor yields.
let rowsByDataset = {};

stubModel("../models/Dataset", {
  findOne: ({ _id, ownerId }) => ({
    lean: async () => datasets.find((d) => d._id === _id && d.ownerId === ownerId) || null,
  }),
});

function makeCursor(rows) {
  // A minimal async-iterable stand-in for Mongoose's real cursor().
  return { [Symbol.asyncIterator]: () => rows[Symbol.iterator]() };
}

stubModel("../models/DatasetRow", {
  find: ({ datasetId }) => ({
    sort() {
      return this;
    },
    lean() {
      return this;
    },
    cursor: () => makeCursor((rowsByDataset[datasetId] || []).map((data, i) => ({ data, rowNumber: i + 1 }))),
  }),
});

const { exportDataset } = require("../controllers/exportController");

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end() {
      this.ended = true;
    },
    json(body) {
      this.jsonBody = body;
      this.ended = true;
    },
    body() {
      return this.chunks.join("");
    },
  };
  return res;
}

function run(params, query, userId) {
  const req = { params, query, userId };
  const res = fakeRes();
  return exportDataset(req, res).then(() => res);
}

test("exports CSV with a header row derived from the first row's keys", async () => {
  rowsByDataset = { [DATASET_ID]: [{ name: "Ada", age: 36 }, { name: "Alan", age: 41 }] };
  const res = await run({ datasetId: DATASET_ID }, { format: "csv" }, OWNER_ID);

  assert.equal(res.body(), "name,age\r\nAda,36\r\nAlan,41\r\n");
  assert.equal(res.headers["Content-Type"], "text/csv; charset=utf-8");
  assert.match(res.headers["Content-Disposition"], /attachment; filename="customers\.csv"/);
});

test("the .csv in originalFileName is replaced, not doubled", async () => {
  rowsByDataset = { [DATASET_ID]: [{ a: 1 }] };
  const res = await run({ datasetId: DATASET_ID }, { format: "csv" }, OWNER_ID);
  assert.match(res.headers["Content-Disposition"], /filename="customers\.csv"$/);
});

test("CSV values with commas/quotes/newlines are escaped", async () => {
  rowsByDataset = { [DATASET_ID]: [{ name: 'Jane "J" Smith, Jr.', note: "line1\nline2" }] };
  const res = await run({ datasetId: DATASET_ID }, { format: "csv" }, OWNER_ID);
  assert.equal(res.body(), 'name,note\r\n"Jane ""J"" Smith, Jr.","line1\nline2"\r\n');
});

test("an empty dataset exports a valid empty CSV (no header, no crash)", async () => {
  rowsByDataset = { [DATASET_ID]: [] };
  const res = await run({ datasetId: DATASET_ID }, { format: "csv" }, OWNER_ID);
  assert.equal(res.body(), "");
  assert.equal(res.ended, true);
});

test("exports a JSON array of each row's data", async () => {
  rowsByDataset = { [DATASET_ID]: [{ name: "Ada" }, { name: "Alan" }] };
  const res = await run({ datasetId: DATASET_ID }, { format: "json" }, OWNER_ID);

  assert.deepEqual(JSON.parse(res.body()), [{ name: "Ada" }, { name: "Alan" }]);
  assert.equal(res.headers["Content-Type"], "application/json; charset=utf-8");
});

test("an empty dataset exports a valid empty JSON array", async () => {
  rowsByDataset = { [DATASET_ID]: [] };
  const res = await run({ datasetId: DATASET_ID }, { format: "json" }, OWNER_ID);
  assert.deepEqual(JSON.parse(res.body()), []);
});

test("defaults to CSV when no format is given", async () => {
  rowsByDataset = { [DATASET_ID]: [{ a: 1 }] };
  const res = await run({ datasetId: DATASET_ID }, {}, OWNER_ID);
  assert.equal(res.headers["Content-Type"], "text/csv; charset=utf-8");
});

test("rejects an unsupported format", async () => {
  const res = await run({ datasetId: DATASET_ID }, { format: "xml" }, OWNER_ID);
  assert.equal(res.statusCode, 400);
  assert.match(res.jsonBody.message, /csv, json/);
});

test("a dataset owned by someone else is reported as not found", async () => {
  rowsByDataset = { [DATASET_ID]: [{ a: 1 }] };
  const someoneElse = new mongoose.Types.ObjectId().toString();
  const res = await run({ datasetId: DATASET_ID }, { format: "csv" }, someoneElse);
  assert.equal(res.statusCode, 404);
});

test("a dataset that doesn't exist is reported as not found", async () => {
  const missingId = new mongoose.Types.ObjectId().toString();
  const res = await run({ datasetId: missingId }, { format: "csv" }, OWNER_ID);
  assert.equal(res.statusCode, 404);
});

test("a malformed id is reported as not found, not a 500 crash", async () => {
  const res = await run({ datasetId: "not-an-object-id" }, { format: "csv" }, OWNER_ID);
  assert.equal(res.statusCode, 404);
  assert.equal(res.jsonBody.success, false);
});

test("format matching is case-insensitive", async () => {
  rowsByDataset = { [DATASET_ID]: [{ a: 1 }] };
  const res = await run({ datasetId: DATASET_ID }, { format: "JSON" }, OWNER_ID);
  assert.equal(res.headers["Content-Type"], "application/json; charset=utf-8");
});
