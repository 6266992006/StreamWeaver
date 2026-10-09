const ivm = require("isolated-vm");

/**
 * SandboxRunner — a thin, safe wrapper around isolated-vm.
 *
 * Why this exists: users will eventually write their own JavaScript
 * transformation snippets (e.g. `value.toUpperCase()`) that run against
 * OUR data on OUR server. Running that with plain `eval()` or `new
 * Function()` would give the snippet full access to our process —
 * `require('fs')`, `process.env`, the filesystem, network, everything.
 *
 * isolated-vm instead creates a completely separate V8 isolate — its
 * own heap, its own global object, zero access to Node's APIs unless we
 * explicitly hand something in. Combined with a memory cap and a
 * execution timeout, a malicious or broken snippet (infinite loop,
 * giant allocation) can only hurt itself, never the host server.
 *
 * Each call to run() creates a short-lived isolate and disposes it —
 * simple and safe. (Day 2 introduces a reusable-isolate variant for
 * per-row performance once this is validated.)
 */
class SandboxRunner {
  /**
   * @param {object} options
   * @param {number} options.memoryLimitMb  Max heap size for the isolate (MB)
   * @param {number} options.timeoutMs      Max wall-clock time for one run (ms)
   */
  constructor(options = {}) {
    this.memoryLimitMb = options.memoryLimitMb || 8;
    this.timeoutMs = options.timeoutMs || 1000;
  }

  /**
   * Runs a JS expression/snippet in full isolation and returns its result.
   * `globals` (plain JSON-serializable values only) are injected into the
   * isolate's global scope before running, e.g. { value: "hello" }.
   *
   * Throws on: syntax errors, runtime errors inside the snippet,
   * timeout (infinite loops), or memory limit exceeded.
   */
  async run(code, globals = {}) {
    const isolate = new ivm.Isolate({ memoryLimit: this.memoryLimitMb });

    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      for (const [key, val] of Object.entries(globals)) {
        await jail.set(key, val, { copy: true });
      }

      const script = await isolate.compileScript(code);
      const result = await script.run(context, { timeout: this.timeoutMs });
      return result;
    } finally {
      // Always dispose — prevents memory leaking across many requests.
      isolate.dispose();
    }
  }
}

module.exports = SandboxRunner;
