const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable, Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const { _internal } = require("../controllers/importController");
const { ValidateAndMap, PRE_FAILED } = require("../streams/importPipeline");
const SandboxRowTransform = require("../streams/sandboxRowTransform");
const { resolveRole, adminEmails } = require("../utils/roles");

const { cleanMapping, cleanTransforms, validFieldName, BadRequest } = _internal;

// ---------- request validation (POST /api/jobs) ----------

test("validFieldName rejects names MongoDB would mangle", () => {
  assert.equal(validFieldName("fullName"), true);
  assert.equal(validFieldName("first name"), true);
  for (const bad of ["", "a.b", "$x", "x\u0000y", "a".repeat(129), 5, null]) {
    assert.equal(validFieldName(bad), false, String(bad));
  }
});

test("cleanMapping keeps only what the pipeline understands", () => {
  const out = cleanMapping({
    fullName: { source: "name", required: true, type: "string", junk: 1 },
    age: { source: "age", type: "number" },
    email: { source: "email", type: "email", required: false },
  });
  assert.deepEqual(out, {
    fullName: { source: "name", required: true }, // "string" = no type check
    age: { source: "age", type: "number" },
    email: { source: "email", type: "email" },
  });
  assert.deepEqual(cleanMapping(undefined), {}); // no mapping = import every column as-is
});

test("cleanMapping rejects bad input with a readable message", () => {
  assert.throws(() => cleanMapping([]), BadRequest);
  assert.throws(() => cleanMapping({ "a.b": { source: "x" } }), /valid field name/);
  assert.throws(() => cleanMapping({ a: {} }), /needs a source column/);
  assert.throws(() => cleanMapping({ a: { source: "x", type: "uuid" } }), /must be one of/);
  const huge = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`f${i}`, { source: "x" }]));
  assert.throws(() => cleanMapping(huge), /at most 500/);
});

test("cleanTransforms compiles every script and drops blanks", async () => {
  assert.deepEqual(await cleanTransforms({ name: "value.toUpperCase()", note: "  " }), { name: "value.toUpperCase()" });
  assert.deepEqual(await cleanTransforms(null), {});
  await assert.rejects(() => cleanTransforms({ name: "value.(" }), /doesn't compile/);
  await assert.rejects(() => cleanTransforms(["x"]), BadRequest);
});

// ---------- a failed transform keeps its row number ----------

const collect = () => {
  const out = [];
  return { out, sink: new Writable({ objectMode: true, write: (c, _e, cb) => (out.push(c), cb()) }) };
};

test("ValidateAndMap counts a PRE_FAILED row as failed at its own position", async () => {
  const placeholder = {};
  Object.defineProperty(placeholder, PRE_FAILED, { value: "Transform failed on field \"a\": boom" });

  const invalid = [];
  const v = new ValidateAndMap({
    mappingConfig: { a: { source: "a" } },
    buildDocument: (data, rowNumber) => ({ rowNumber, data }),
    onInvalid: (e) => invalid.push(e),
  });
  const { out, sink } = collect();
  await pipeline(Readable.from([{ a: "1" }, placeholder, { a: "3" }]), v, sink);

  assert.equal(out.length, 2); // the failed row never reaches the database
  assert.deepEqual(invalid, [{ row: 2, reason: 'Transform failed on field "a": boom' }]);
  assert.equal(v.invalidCount, 1);
});

test("SandboxRowTransform transforms rows and turns a throwing script into a failed row (import continues)", async () => {
  const stream = await SandboxRowTransform.create({ data: "JSON.parse(value).n" });
  try {
    const { out, sink } = collect();
    await pipeline(
      Readable.from([{ data: '{"n": 7}' }, { data: "not json" }, { data: '{"n": 9}' }]),
      stream,
      sink
    );
    assert.equal(out.length, 3); // nothing was dropped, so row numbers stay aligned
    assert.deepEqual([out[0].data, out[2].data], [7, 9]);
    assert.ok(out[1][PRE_FAILED], "the bad row carries its failure reason");
    assert.match(out[1][PRE_FAILED], /data/);
  } finally {
    stream.dispose();
  }
});

// ---------- roles ----------

test("roles: only listed emails become admins, and an existing admin is never demoted", () => {
  const saved = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = " Boss@Example.com , second@x.io ";
  try {
    assert.deepEqual(adminEmails(), ["boss@example.com", "second@x.io"]);
    assert.equal(resolveRole("BOSS@example.com"), "admin");
    assert.equal(resolveRole("someone@else.com"), "analyst");
    assert.equal(resolveRole("someone@else.com", "admin"), "admin");
    process.env.ADMIN_EMAILS = "";
    assert.equal(resolveRole("boss@example.com"), "analyst");
  } finally {
    if (saved === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = saved;
  }
});
