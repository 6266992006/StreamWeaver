const SandboxRunner = require("../sandbox/sandboxRunner");
const RowSandbox = require("../sandbox/rowSandbox");

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
// Applies a set of per-field JS expressions to a single row, using the
// reusable-isolate RowSandbox (the same engine Day 4 will stream
// thousands of rows through).
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
    return res.status(400).json({
      success: false,
      message: "Row transform failed",
      error: err.message,
    });
  } finally {
    sandbox.dispose();
  }
};
