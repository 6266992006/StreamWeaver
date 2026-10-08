const test = require("node:test");
const assert = require("node:assert/strict");

const { escapeCsvField, toCsvRow } = require("../utils/csvFormat");

test("plain values pass through unquoted", () => {
  assert.equal(escapeCsvField("Ada"), "Ada");
  assert.equal(escapeCsvField(36), "36");
  assert.equal(escapeCsvField(true), "true");
});

test("null and undefined become an empty field", () => {
  assert.equal(escapeCsvField(null), "");
  assert.equal(escapeCsvField(undefined), "");
});

test("a comma forces quoting", () => {
  assert.equal(escapeCsvField("Smith, Jane"), '"Smith, Jane"');
});

test("a quote is doubled and the field is quoted", () => {
  assert.equal(escapeCsvField('She said "hi"'), '"She said ""hi"""');
});

test("embedded newlines force quoting", () => {
  assert.equal(escapeCsvField("line1\nline2"), '"line1\nline2"');
  assert.equal(escapeCsvField("line1\r\nline2"), '"line1\r\nline2"');
});

test("an object value is JSON-stringified first, then escaped", () => {
  assert.equal(escapeCsvField({ a: 1 }), '"{""a"":1}"');
});

test("toCsvRow joins escaped fields with commas", () => {
  assert.equal(toCsvRow(["Ada", 36, "Smith, Jane"]), 'Ada,36,"Smith, Jane"');
});

test("toCsvRow on an empty array is an empty string", () => {
  assert.equal(toCsvRow([]), "");
});
