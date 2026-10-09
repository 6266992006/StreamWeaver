const SandboxRunner = require("../sandbox/sandboxRunner");

const runner = new SandboxRunner({ memoryLimitMb: 8, timeoutMs: 1000 });

// @route  POST /api/sandbox/run  (protected)
// Body: { "code": "value.toUpperCase()", "value": "hello" }
// Runs the given JS expression in an isolated-vm sandbox with the
// provided `value` injected as a global, and returns the result.
// This is Day 1's proof that the sandbox works end-to-end over HTTP —
// Day 2 applies the same idea per-row inside a real data pipeline.
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
