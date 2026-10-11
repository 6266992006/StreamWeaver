const ivm = require("isolated-vm");
const SandboxRunner = require("../sandbox/sandboxRunner");
const RowSandbox = require("../sandbox/rowSandbox");
const transformStore = require("../models/transformStore");

const runner = new SandboxRunner({ memoryLimitMb: 8, timeoutMs: 1000 });

// @route  POST /api/sandbox/run  (protected) — Week 3 Day 1
// Body: { "code": "value.toUpperCase()", "value": "hello" }
exports.runSnippet = async (req, res) => {
  const { code, value } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ success: false, message: "code (string) is required" });
  }

  try {
    const result = await runner.run(code, { value: value !== undefined ? value : null });
    return res.status(200).json({ success: true, result });
  } catch (err) {
    // Timeout, syntax error, runtime error inside the sandbox, or
    // memory limit — all land here. The sandbox contained the damage;
    // we just report it back as a normal 400, server stays healthy.
    return res.status(400).json({
      success: false,
      message: "Sandbox execution failed",
      error: err.message,
    });
  }
};

// @route  POST /api/sandbox/transform-row  (protected) — Week 3 Day 2
// Body: {
//   "row": { "name": "john doe", "score": "21" },
//   "fieldTransforms": { "name": "value.toUpperCase()", "score": "Number(value) * 2" }
// }
exports.transformRow = async (req, res) => {
  const { row, fieldTransforms } = req.body;

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return res.status(400).json({ success: false, message: "row (object) is required" });
  }
  if (!fieldTransforms || typeof fieldTransforms !== "object" || Array.isArray(fieldTransforms)) {
    return res.status(400).json({ success: false, message: "fieldTransforms (object) is required" });
  }

  const sandbox = new RowSandbox(fieldTransforms, { memoryLimitMb: 16, timeoutMs: 200 });
  try {
    await sandbox.init();
    const transformed = await sandbox.transformRow(row);
    return res.status(200).json({ success: true, original: row, transformed });
  } catch (err) {
    return res.status(400).json({ success: false, message: "Row transform failed", error: err.message });
  } finally {
    sandbox.dispose();
  }
};

/**
 * Validates that every script in fieldTransforms at least COMPILES
 * (catches syntax errors like `value.toUpperCase(` immediately). This
 * does not guarantee it will run without error against real data —
 * runtime errors (e.g. calling .toUpperCase() on a number) still
 * surface later, per-row, when the pipeline actually runs it — but it
 * stops the obviously broken configs at save time instead of failing
 * silently deep into a 50,000-row upload.
 */
async function validateFieldTransforms(fieldTransforms) {
  const isolate = new ivm.Isolate({ memoryLimit: 8 });
  try {
    for (const [field, expr] of Object.entries(fieldTransforms)) {
      try {
        await isolate.compileScript(expr);
      } catch (err) {
        throw new Error(`Invalid script for field "${field}": ${err.message}`);
      }
    }
  } finally {
    isolate.dispose();
  }
}

// @route  POST /api/sandbox/config  (protected) — Week 3 Day 3
// Body: { "fieldTransforms": { "name": "value.toUpperCase()", "score": "Number(value) * 2" } }
// Saves a per-user set of field-level JS transforms, after validating
// each one compiles. Day 4/5 pull this saved config into the streaming
// pipeline — same relationship as Week 2 Day 3's /api/mapping.
exports.saveConfig = async (req, res) => {
  const { fieldTransforms } = req.body;

  if (!fieldTransforms || typeof fieldTransforms !== "object" || Array.isArray(fieldTransforms)) {
    return res.status(400).json({
      success: false,
      message: "fieldTransforms is required and must be an object of { fieldName: jsExpression }",
    });
  }
  if (Object.keys(fieldTransforms).length === 0) {
    return res.status(400).json({ success: false, message: "fieldTransforms cannot be empty" });
  }

  try {
    await validateFieldTransforms(fieldTransforms);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }

  transformStore.setTransformConfig(req.userId, fieldTransforms);

  return res.status(200).json({
    success: true,
    message: "Transform config saved",
    fieldTransforms,
  });
};

// @route  GET /api/sandbox/config  (protected) — Week 3 Day 3
exports.getConfig = (req, res) => {
  const saved = transformStore.getTransformConfig(req.userId);

  if (!saved) {
    return res.status(404).json({ success: false, message: "No transform config set yet" });
  }

  return res.status(200).json({ success: true, ...saved });
};
