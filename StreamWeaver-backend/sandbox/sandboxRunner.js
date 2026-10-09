const ivm = require("isolated-vm");

/**
 * SandboxRunner — Week 3 Day 1. A thin, safe wrapper around isolated-vm.
 *
 * Why this exists: a user's JS transformation snippet runs against OUR
 * data on OUR server. Running that with plain eval()/new Function()
 * would give it full access to our process. isolated-vm instead creates
 * a separate V8 isolate — its own heap, zero access to Node's APIs
 * unless explicitly handed in. Combined with a memory cap and execution
 * timeout, a malicious or broken snippet can only hurt itself.
 *
 * Each call to run() creates a short-lived isolate and disposes it.
 */
class SandboxRunner {
  constructor(options = {}) {
    this.memoryLimitMb = options.memoryLimitMb || 8;
    this.timeoutMs = options.timeoutMs || 1000;
  }

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
      isolate.dispose();
    }
  }
}

module.exports = SandboxRunner;
