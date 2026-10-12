const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  buildErrorReport,
  reportToCsv,
  reportFileName,
  safeFileBase,
  categorizeReason,
  neutraliseFormula,
} = require("../utils/errorReportGenerator");

// ---------- generator (pure functions) ----------

test("categorizeReason uses the same buckets as the frontend filter", () => {
  assert.equal(categorizeReason("name is required"), "Missing value");
  assert.equal(categorizeReason("age must be a valid number"), "Wrong format");
  assert.equal(categorizeReason("E11000 duplicate key"), "Database");
  assert.equal(categorizeReason("???"), "Other");
});

test("buildErrorReport sorts by row and flags truncation", () => {
  const job = {
    _id: "j1",
    status: "done",
    totalRows: 5000,
    rowsProcessed: 5000,
    rowsFailed: 3000,
    errorLog: [
      { row: 9, reason: "b is required" },
      { row: 2, reason: "a must be a valid number" },
    ],
  };
  const report = buildErrorReport(job, "people.csv");
  assert.deepEqual(report.errors.map((e) => e.row), [2, 9]);
  assert.equal(report.included, 2);
  assert.equal(report.rowsFailed, 3000);
  assert.equal(report.truncated, true);
  assert.equal(report.fileName, "people.csv");
});

test("buildErrorReport: a job with no failures is an empty, non-truncated report", () => {
  const report = buildErrorReport({ _id: "j2", status: "done", rowsFailed: 0 }, null);
  assert.deepEqual(report.errors, []);
  assert.equal(report.truncated, false);
});

test("reportToCsv writes a header and escaped rows", () => {
  const csv = reportToCsv({ errors: [{ row: 3, type: "Wrong format", reason: 'x, "y" must be a valid email' }] });
  assert.equal(csv, 'row,type,reason\r\n3,Wrong format,"x, ""y"" must be a valid email"\r\n');
});

test("reportToCsv with no errors is just the header", () => {
  assert.equal(reportToCsv({ errors: [] }), "row,type,reason\r\n");
});

test("formula-looking reasons are neutralised against CSV injection", () => {
  assert.equal(neutraliseFormula("=HYPERLINK(\"x\") is required"), "'=HYPERLINK(\"x\") is required");
  assert.equal(neutraliseFormula("+1 is required"), "'+1 is required");
  assert.equal(neutraliseFormula("email must be a valid email"), "email must be a valid email");
  assert.match(reportToCsv({ errors: [{ row: 1, type: "Other", reason: "=cmd|' /C calc'!A0" }] }), /,'=cmd/);
});

test("safeFileBase / reportFileName keep header-unsafe characters out", () => {
  assert.equal(safeFileBase("customers.csv"), "customers");
  assert.equal(safeFileBase('bad"name\r\nX-Evil: 1.csv'), "bad_name_X-Evil_ 1");
  assert.equal(safeFileBase("डेटा.csv", "export"), "export");
  assert.equal(reportFileName("people.csv", "json"), "people-errors.json");
  assert.equal(reportFileName(null, "csv"), "import-errors.csv");
});

// ---------- endpoint (models stubbed into the require cache) ----------

function stubModel(relPath, exports) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const OWNER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();
const DATASET = new mongoose.Types.ObjectId().toString();
const JOB = new mongoose.Types.ObjectId().toString();

const jobs = [
  {
    _id: JOB,
    ownerId: OWNER,
    datasetId: DATASET,
    status: "done",
    totalRows: 10,
    rowsProcessed: 10,
    rowsFailed: 2,
    errorLog: [
      { row: 7, reason: "email must be a valid email" },
      { row: 4, reason: "name is required" },
    ],
  },
];

stubModel("../models/TransformJob", {
  findOne: (f) => ({
    select() { return this; },
    lean: async () => jobs.find((j) => j._id === String(f._id) && j.ownerId === String(f.ownerId)) || null,
  }),
});
stubModel("../models/Dataset", {
  findOne: (f) => ({
    select() { return this; },
    lean: async () => (String(f._id) === DATASET && String(f.ownerId) === OWNER ? { originalFileName: "people.csv" } : null),
  }),
});
stubModel("../models/DatasetRow", { find: () => ({}) });

const { exportJobErrors } = require("../controllers/exportController");

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    send(b) { this.sent = b; return this; },
    json(b) { this.jsonBody = b; return this; },
  };
}
const call = (params, query, userId) => {
  const res = fakeRes();
  return exportJobErrors({ params, query, userId }, res).then(() => res);
};

test("endpoint: CSV download is sorted, named after the file, and carries totals in headers", async () => {
  const res = await call({ jobId: JOB }, {}, OWNER);
  assert.equal(res.statusCode, 200);
  assert.equal(res.sent, "row,type,reason\r\n4,Missing value,name is required\r\n7,Wrong format,email must be a valid email\r\n");
  assert.equal(res.headers["Content-Type"], "text/csv; charset=utf-8");
  assert.equal(res.headers["Content-Disposition"], 'attachment; filename="people-errors.csv"');
  assert.equal(res.headers["X-Total-Failed"], "2");
  assert.equal(res.headers["X-Errors-Truncated"], "false");
});

test("endpoint: JSON format returns the full report object", async () => {
  const res = await call({ jobId: JOB }, { format: "JSON" }, OWNER);
  const body = JSON.parse(res.sent);
  assert.equal(body.fileName, "people.csv");
  assert.equal(body.included, 2);
  assert.deepEqual(body.errors.map((e) => e.row), [4, 7]);
  assert.equal(res.headers["Content-Disposition"], 'attachment; filename="people-errors.json"');
});

test("endpoint: another user's job is a 404, not a leak", async () => {
  assert.equal((await call({ jobId: JOB }, {}, OTHER)).statusCode, 404);
});

test("endpoint: bad job id and bad format are 400s", async () => {
  assert.equal((await call({ jobId: "nope" }, {}, OWNER)).statusCode, 400);
  assert.equal((await call({ jobId: JOB }, { format: "xml" }, OWNER)).statusCode, 400);
});
