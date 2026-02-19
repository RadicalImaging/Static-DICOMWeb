// SagaBusMessaging.mjs
// ESM module (JavaScript with modules)
// Requires: @saga-bus/core
// Node >= 14 recommended.

import { createBus } from "@saga-bus/core";
import crypto from "node:crypto";

/**
 * SagaBusMessaging
 *
 * Semantics (single process):
 * - Per-key serialization: only one handler runs at a time for (operationName,id)
 * - "Pre-start" dedupe: right before starting work for a key, collapse all currently-pending
 *   messages for that key into ONE message (keep latest by default), ack the duplicates.
 * - Once the handler STARTS, that message is no longer eligible for dedupe.
 * - Messages arriving while a handler is running will run AFTER it finishes (and will get their own pre-start dedupe).
 *
 * Notes:
 * - Local-process behavior. Does not prevent duplicates across multiple servers.
 * - If the handler throws, we log error + message + data and rethrow (via promise rejection)
 *   so Saga Bus retry/redelivery can apply.
 */
export class SagaBusMessaging {
  /**
   * @param {object} params
   * @param {*} params.transport - saga-bus transport instance (e.g., in-memory, SQS)
   * @param {*} [params.store] - optional saga store
   * @param {number} [params.concurrency=20] - overall bus concurrency (per-key serialization is enforced here)
   * @param {*} [params.retry] - saga-bus retry config
   * @param {Array} [params.middleware=[]] - saga-bus middleware
   * @param {{info:Function,warn:Function,error:Function}} [params.logger=console]
   * @param {"latest"|"earliest"} [params.dedupePolicy="latest"] - which pending msg survives at pre-start dedupe
   */
  constructor(params) {
    if (!params?.transport) throw new Error("SagaBusMessaging requires { transport }");

    this.logger = params.logger ?? console;
    this.dedupePolicy = params.dedupePolicy ?? "latest";
    this.transport = params.transport;

    // key -> { running: boolean, pending: Array<{msg, resolve, reject}> }
    this.states = new Map();

    this.bus = createBus({
      transport: params.transport,
      store: params.store,
      sagas: [],
      middleware: params.middleware ?? [],
      concurrency: typeof params.concurrency === "number" ? params.concurrency : 20,
      retry: params.retry,
      logger: this.logger,
    });
  }

  async start() {
    await this.bus.start();
  }

  async stop() {
    await this.bus.stop();
  }

  /**
   * Send a message (optionally delayed).
   * @param {string} operationName
   * @param {string} id
   * @param {object} data - JSON-compatible object
   * @param {{delayMs?: number}} [options]
   */
  async sendMessage(operationName, id, data, options = {}) {
    if (typeof operationName !== "string" || !operationName) {
      throw new Error("sendMessage(operationName, ...) requires operationName string");
    }
    if (typeof id !== "string" || !id) {
      throw new Error("sendMessage(..., id, ...) requires id string");
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("sendMessage(..., data) requires a JSON-compatible object");
    }

    const msg = {
      type: operationName,
      id,
      data,
      messageId: this.#newMessageId(),
      sentAt: Date.now(),
    };

    const delayMs = options.delayMs;
    if (delayMs && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await this.bus.publish(msg);
  }

  /**
   * Register an async handler for an operation.
   * @param {string} operationName
   * @param {(msg: {type:string,id:string,data:Object,messageId:string,sentAt:number}) => Promise<void>} handler
   */
  registerHandler(operationName, handler) {
    if (typeof operationName !== "string" || !operationName) {
      throw new Error("registerHandler(operationName, ...) requires operationName string");
    }
    if (typeof handler !== "function") {
      throw new Error("registerHandler(..., handler) requires a function");
    }

    // Create handler wrapper manually (createHandler doesn't exist in @saga-bus/core)
    const wrapped = async (ctx) => {
      const msg = ctx.message || ctx;
      // Only process messages of the correct type
      if (msg.type !== operationName) {
        return;
      }
      const key = this.#makeKey(msg.type, msg.id);

      // resolve => ack; reject/throw => retry/redelivery (at-least-once)
      return this.#enqueueAndMaybeProcess(key, msg, handler, operationName);
    };

    // Set messageType property if the bus expects it
    wrapped.messageType = operationName;

    // Support common saga-bus API shapes
    if (typeof this.bus.registerHandler === "function") {
      this.bus.registerHandler(wrapped);
      return;
    }
    if (typeof this.bus.addHandler === "function") {
      this.bus.addHandler(wrapped);
      return;
    }
    if (Array.isArray(this.bus.handlers)) {
      this.bus.handlers.push(wrapped);
      return;
    }

    // Try subscribing via transport directly if bus methods don't work
    if (this.transport && typeof this.transport.subscribe === "function") {
      this.transport.subscribe(operationName, async (message) => {
        // Filter to only handle messages of the correct type
        if (message.type !== operationName) {
          return;
        }
        const key = this.#makeKey(message.type, message.id);
        return this.#enqueueAndMaybeProcess(key, message, handler, operationName);
      });
      return;
    }

    throw new Error(
      "Unable to register handler: bus does not expose registerHandler/addHandler/handlers[], " +
        "and transport does not have subscribe method. Check your @saga-bus/core version API."
    );
  }

  // -----------------------
  // Internals (private)
  // -----------------------

  #makeKey(operationName, id) {
    return `${operationName}:${id}`;
  }

  #getState(key) {
    const existing = this.states.get(key);
    if (existing) return existing;
    const created = { running: false, pending: [] };
    this.states.set(key, created);
    return created;
  }

  #tryCleanupKey(key) {
    const st = this.states.get(key);
    if (!st) return;
    if (!st.running && st.pending.length === 0) this.states.delete(key);
  }

  #newMessageId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  }

  async #enqueueAndMaybeProcess(key, msg, userHandler, operationNameForLogs) {
    const state = this.#getState(key);

    return new Promise((resolve, reject) => {
      state.pending.push({ msg, resolve, reject });
      // kick loop (don’t await here)
      void this.#maybeRunNext(key, userHandler, operationNameForLogs);
    });
  }

  async #maybeRunNext(key, userHandler, operationNameForLogs) {
    const state = this.#getState(key);

    // already running => new arrivals wait
    if (state.running) return;

    // nothing queued
    if (state.pending.length === 0) return;

    // ---- PRE-START DEDUPE POINT ----
    // grab all currently pending for this key and keep one
    const batch = state.pending;
    state.pending = [];

    const keepIndex = this.dedupePolicy === "latest" ? batch.length - 1 : 0;
    const keeper = batch[keepIndex];

    // ack duplicates (deduped before handler start)
    for (let i = 0; i < batch.length; i++) {
      if (i === keepIndex) continue;
      const d = batch[i];
      console.verbose('[SagaBusMessaging] Deduped pending message before start:', {
        key,
        type: d.msg.type,
        id: d.msg.id,
        messageId: d.msg.messageId,
        keptMessageId: keeper.msg.messageId,
        policy: this.dedupePolicy,
      });
      d.resolve();
    }

    // start work (now NOT eligible for dedupe)
    state.running = true;

    try {
      await userHandler(keeper.msg);
      keeper.resolve(); // ack
    } catch (err) {
      this.logger.error(`[SagaBusMessaging] Handler error for ${operationNameForLogs}:`, {
        error: err?.stack ?? err,
        message: keeper.msg,
        data: keeper.msg.data,
      });
      keeper.reject(err); // trigger retry/redelivery if configured
    } finally {
      state.running = false;

      // run next batch if any arrived while running
      if (state.pending.length > 0) {
        void this.#maybeRunNext(key, userHandler, operationNameForLogs);
      } else {
        this.#tryCleanupKey(key);
      }
    }
  }
}
