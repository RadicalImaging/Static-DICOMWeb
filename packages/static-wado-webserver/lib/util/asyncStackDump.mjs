/**
 * Async stack dump utility for diagnosing livelock/hangs in Bun (or Node).
 *
 * Use when STOW uploads with AsyncDicomReader appear to livelock: get stack traces
 * of what is currently running so you can see which promise/loop is stuck.
 *
 * Setup: require or import this module early in your server process (e.g. in
 * program/index.mjs or the main entry before starting the server).
 *
 * Usage:
 * 1. Interrupt now (single dump):
 *    - Unix: kill -USR2 <pid>
 *    - Windows (Bun): SIGUSR2 may not be available; use STACK_DUMP_SAMPLE_MS (see below)
 *      or call dumpCurrentStack() from a timer or HTTP debug endpoint.
 *
 * 2. Sample stacks over ~2 seconds (shows what keeps running during livelock):
 *    Set env before starting the server:
 *    - STACK_DUMP_SAMPLE_MS=200   (dump every 200ms)
 *    - STACK_DUMP_SAMPLE_DURATION_MS=2000  (optional, default 2000)
 *    Then when livelock occurs, send SIGUSR2 once; the sampler will run and
 *    print multiple stacks so you can see the repeating call path.
 *
 * 3. Programmatic: import { dumpCurrentStack, installStackDumpOnSignal } from '...';
 *    installStackDumpOnSignal();  // then kill -USR2 <pid>
 *    dumpCurrentStack();         // or call from a debug route
 */

const isWindows = typeof process !== "undefined" && process.platform === "win32";

/**
 * Writes the current JavaScript stack trace to stderr.
 * Safe to call from a signal handler (sync, minimal work).
 *
 * @param {string} [label] - Optional label (e.g. "SIGUSR2" or "sample 3")
 */
export function dumpCurrentStack(label = "stack") {
  const err = new Error(`[asyncStackDump] ${label}`);
  const stack = err.stack || String(err);
  process.stderr.write(stack + "\n");
  try {
    const asyncId =
      typeof require !== "undefined"
        ? require("node:async_hooks")?.executionAsyncId?.()
        : undefined;
    if (asyncId !== undefined) {
      process.stderr.write(`[asyncStackDump] executionAsyncId: ${asyncId}\n`);
    }
  } catch (_) {
    // ignore if async_hooks not available
  }
}

/**
 * Installs a handler for SIGUSR2 that dumps the current stack once.
 * On Windows, SIGUSR2 is often not available; the handler is only registered
 * if the signal exists.
 *
 * @returns {() => void} - Uninstall function
 */
export function installStackDumpOnSignal() {
  const handler = () => {
    dumpCurrentStack("SIGUSR2");
  };

  if (typeof process.on === "function") {
    try {
      process.on("SIGUSR2", handler);
      process.stderr.write(
        "[asyncStackDump] SIGUSR2 handler installed. Use: kill -USR2 <pid>\n"
      );
    } catch (e) {
      process.stderr.write(
        `[asyncStackDump] Could not install SIGUSR2 (e.g. on Windows): ${e?.message}\n`
      );
    }
  }

  return () => {
    try {
      process.removeListener?.("SIGUSR2", handler);
    } catch (_) {}
  };
}

/**
 * Runs a sampler that dumps the current stack at a fixed interval for a duration.
 * Use when livelock is suspected: the repeated dumps will show what code path
 * is running repeatedly (the livelock loop).
 *
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=200] - Dump every N ms
 * @param {number} [opts.durationMs=2000] - Run for N ms then stop
 * @param {boolean} [opts.runOnce=false] - If true, run one dump and return (no interval)
 */
export function runStackSampler(opts = {}) {
  const intervalMs = opts.intervalMs ?? 200;
  const durationMs = opts.durationMs ?? 2000;
  const runOnce = opts.runOnce ?? false;

  if (runOnce) {
    dumpCurrentStack("once");
    return;
  }

  let count = 0;
  const id = setInterval(() => {
    count += 1;
    dumpCurrentStack(`sample ${count}`);
  }, intervalMs);

  const stop = setTimeout(() => {
    clearInterval(id);
    process.stderr.write(
      `[asyncStackDump] Sampler stopped after ${durationMs}ms (${count} dumps)\n`
    );
  }, durationMs);

  process.stderr.write(
    `[asyncStackDump] Sampler started: every ${intervalMs}ms for ${durationMs}ms\n`
  );

  return () => {
    clearInterval(id);
    clearTimeout(stop);
  };
}

/**
 * Installs SIGUSR2 handler that runs the stack sampler (multiple dumps over time)
 * instead of a single dump. Useful when a single snapshot isn't enough to see the
 * spinning code path.
 */
export function installStackSamplerOnSignal() {
  const sampleMs = parseInt(
    process.env.STACK_DUMP_SAMPLE_MS ?? "0",
    10
  );
  const durationMs = parseInt(
    process.env.STACK_DUMP_SAMPLE_DURATION_MS ?? "2000",
    10
  );

  const handler = () => {
    if (sampleMs > 0) {
      runStackSampler({ intervalMs: sampleMs, durationMs });
    } else {
      dumpCurrentStack("SIGUSR2");
    }
  };

  if (typeof process.on === "function") {
    try {
      process.on("SIGUSR2", handler);
      process.stderr.write(
        "[asyncStackDump] SIGUSR2 handler installed. Use: kill -USR2 <pid>\n"
      );
      if (sampleMs > 0) {
        process.stderr.write(
          `[asyncStackDump] On SIGUSR2 will run sampler: every ${sampleMs}ms for ${durationMs}ms\n`
        );
      }
    } catch (e) {
      process.stderr.write(
        `[asyncStackDump] Could not install SIGUSR2: ${e?.message}\n`
      );
    }
  }

  return () => {
    try {
      process.removeListener?.("SIGUSR2", handler);
    } catch (_) {}
  };
}

/**
 * Call once at process startup to enable stack dumps on SIGUSR2.
 * If STACK_DUMP_SAMPLE_MS is set, SIGUSR2 will run a multi-dump sampler.
 * If STACK_DUMP_ENABLED=1, installs the handler; otherwise does nothing.
 *
 * @returns {() => void|undefined} - Uninstall function, or undefined if not enabled
 */
export function installFromEnv() {
  const enabled =
    process.env.STACK_DUMP_ENABLED === "1" ||
    process.env.STACK_DUMP_SAMPLE_MS !== undefined;
  if (!enabled) return undefined;
  return installStackSamplerOnSignal();
}
