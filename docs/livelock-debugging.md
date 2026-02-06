# Livelock debugging (STOW uploads with AsyncDicomReader)

When the DICOMweb server appears to livelock during STOW uploads (streamPostController + dcmjs AsyncDicomReader and listeners), use the following to capture stack traces and narrow down the cause.

## 1. Stack dump on signal (Unix / Bun with SIGUSR2)

Enable stack dumps when the process is running, then send a signal to get a snapshot (or a short sampler) of what is running.

**Enable at startup:**

```bash
# Single dump on SIGUSR2
STACK_DUMP_ENABLED=1 bun run bin/dicomwebserver.mjs

# Or: on SIGUSR2 run a 2s sampler (dumps every 200ms) to see the repeating call path
STACK_DUMP_SAMPLE_MS=200 STACK_DUMP_SAMPLE_DURATION_MS=2000 bun run bin/dicomwebserver.mjs
```

**When the server appears stuck:**

- **Unix:** `kill -USR2 <pid>`  
  - One dump: you see the current stack.  
  - With sampler: you get multiple dumps over ~2s; the repeated frames are the livelock loop.
- **Windows:** SIGUSR2 may not be available in Bun. Use either:
  - Run with `STACK_DUMP_SAMPLE_MS=200` and add a **debug HTTP route** that calls `dumpCurrentStack()` (see `lib/util/asyncStackDump.mjs`), or
  - Call `dumpCurrentStack()` from a timer or from your own “interrupt now” trigger.

Implementation: `packages/static-wado-webserver/lib/util/asyncStackDump.mjs` (exported helpers: `dumpCurrentStack`, `installStackDumpOnSignal`, `runStackSampler`, `installFromEnv`).

## 2. Livelock detector (ensureAvailable stuck)

If the reader is stuck waiting on `ensureAvailable()` (stream not progressing), enable the optional detector so that after a given time a warning is logged with the call stack.

**Enable via environment:**

```bash
# Log a warning (with stack) if ensureAvailable() is still pending after 15 seconds
TRACKABLE_STREAM_LIVELOCK_DETECT_MS=15000 bun run bin/dicomwebserver.mjs
```

**Enable in code (when creating the stream):**

If you create `TrackableReadBufferStream` yourself, pass the option:

```js
const stream = new TrackableReadBufferStream(null, true, {
  noCopy: true,
  livelockDetectMs: 15000,
});
```

When a wait exceeds the threshold, you’ll see a log like:

- `[TrackableReadBufferStream] Possible livelock: ensureAvailable(N) still pending after 15000ms. Stream: offset=... endOffset=... isComplete=...`  
- Followed by the stack trace captured at the time of the `ensureAvailable()` call.

That stack shows where in the reader/listener pipeline the code is blocked waiting for more data.

## Summary

| Goal                         | Method                                                                 |
|-----------------------------|-------------------------------------------------------------------------|
| “Interrupt now” stack       | `STACK_DUMP_ENABLED=1` + `kill -USR2 <pid>` (or HTTP/timer calling `dumpCurrentStack`) |
| Stacks over ~2s (livelock)  | `STACK_DUMP_SAMPLE_MS=200` + `kill -USR2 <pid>`                         |
| Detect stuck ensureAvailable| `TRACKABLE_STREAM_LIVELOCK_DETECT_MS=15000` (or `livelockDetectMs` option) |

Combining (1) and (2) gives both a one-shot or sampled view of the event loop and an automatic warning when the stream reader is stuck waiting on data.
