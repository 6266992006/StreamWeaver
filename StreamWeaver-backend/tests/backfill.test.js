const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseStoredFileName, countRows } = require("../scripts/backfillDatasets");

test("parses the stored file name back into upload time and original name", () => {
  const parsed = parseStoredFileName("1790401769557-1ca27784-customers-1000.csv");
  assert.equal(parsed.originalName, "customers-1000.csv");
  assert.equal(parsed.uploadedAt.getTime(), 1790401769557);
});

test("original names containing dashes and spaces survive", () => {
  const parsed = parseStoredFileName("1790401769557-1ca27784-Q3 sales - final.csv");
  assert.equal(parsed.originalName, "Q3 sales - final.csv");
});

test("ignores files that don't follow the upload naming scheme", () => {
  assert.equal(parseStoredFileName("README.txt"), null);
  assert.equal(parseStoredFileName("notes-abc.csv"), null);
});

test("countRows = newlines minus the header row", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sw-")), "a.csv");
  fs.writeFileSync(file, "name,age\nAda,36\nAlan,41\nGrace,85\n");
  assert.equal(await countRows(file), 3);
  fs.writeFileSync(file, "");
  assert.equal(await countRows(file), 0);
});
