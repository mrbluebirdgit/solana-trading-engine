import assert from "node:assert/strict";
import test from "node:test";

import {
  handleObserverMessage,
  heliusObserverDefaults,
  runPumpLogsObserver,
} from "../src/integrations/helius/logs-observer.mjs";

const API_KEY = "observer-test-key";

function createFakeWebSocket() {
  return class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sent = [];
      this.closeCalls = [];
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    send(value) {
      this.sent.push(value);
    }

    close(code, reason) {
      this.closeCalls.push({ code, reason });
      this.readyState = FakeWebSocket.CLOSING;
    }

    emit(type, event = {}) {
      if (type === "open") this.readyState = FakeWebSocket.OPEN;
      if (type === "close") this.readyState = FakeWebSocket.CLOSED;
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }

    message(payload) {
      this.emit("message", {
        data: typeof payload === "string" ? payload : JSON.stringify(payload),
      });
    }
  };
}

function createFakeTimers() {
  let nextId = 1;
  let scheduledCount = 0;
  const pending = new Map();

  return {
    setTimeoutImpl(callback, delayMs) {
      scheduledCount += 1;
      const id = nextId;
      nextId += 1;
      pending.set(id, { callback, delayMs });
      return id;
    },
    clearTimeoutImpl(id) {
      pending.delete(id);
    },
    delays() {
      return [...pending.values()].map(({ delayMs }) => delayMs);
    },
    runDelay(delayMs) {
      const entry = [...pending.entries()].find(
        ([, timer]) => timer.delayMs === delayMs,
      );
      assert.ok(entry, `expected a pending ${delayMs}ms timer`);
      const [id, timer] = entry;
      pending.delete(id);
      timer.callback();
    },
    get size() {
      return pending.size;
    },
    get scheduledCount() {
      return scheduledCount;
    },
  };
}

async function startObserver(options = {}) {
  const WebSocketImpl = createFakeWebSocket();
  const timers = createFakeTimers();
  const statuses = [];
  const controller = await runPumpLogsObserver({
    apiKey: API_KEY,
    WebSocketImpl,
    onStatus: (status) => statuses.push(status),
    setTimeoutImpl: timers.setTimeoutImpl,
    clearTimeoutImpl: timers.clearTimeoutImpl,
    ...options,
  });
  return { WebSocketImpl, timers, statuses, controller };
}

test("reports subscribed only after the JSON-RPC acknowledgement", async () => {
  const { WebSocketImpl, statuses, controller } = await startObserver();
  const socket = WebSocketImpl.instances[0];

  assert.deepEqual(statuses.map(({ state }) => state), ["connecting"]);
  socket.emit("open");
  assert.equal(socket.sent.length, 1);
  assert.equal(statuses.at(-1).state, "subscribing");
  assert.equal(statuses.some(({ state }) => state === "subscribed"), false);

  socket.message({ jsonrpc: "2.0", id: 1, result: 0 });
  assert.equal(statuses.at(-1).state, "subscribed");
  assert.equal(statuses.at(-1).subscriptionId, 0);
  assert.equal(controller.subscriptionId, 0);

  controller.stop();
});

test("ignores unrelated numeric responses and mismatched notifications", async () => {
  const events = [];
  const { WebSocketImpl, statuses, controller } = await startObserver({
    onEvent: (event) => events.push(event),
  });
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");
  socket.message({ jsonrpc: "2.0", id: 99, result: 7 });
  assert.equal(controller.subscriptionId, null);
  socket.message({ jsonrpc: "2.0", id: 1, result: 7 });
  socket.message({
    jsonrpc: "2.0",
    params: {
      subscription: 8,
      result: {
        context: { slot: 1 },
        value: {
          signature: "wrong-subscription",
          logs: ["Program log: Instruction: Create"],
          err: null,
        },
      },
    },
  });
  assert.equal(events.length, 0);
  assert.equal(
    statuses.some(({ state }) => state === "event_subscription_mismatch"),
    true,
  );
  assert.equal(statuses.at(-1).state, "reconnecting");
  controller.stop();
});

test("surfaces a JSON-RPC subscription error and schedules one reconnect", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver({
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 400,
  });
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");

  socket.message({
    jsonrpc: "2.0",
    id: 1,
    error: { code: -32602, message: "invalid subscription" },
  });

  const failure = statuses.find(({ state }) => state === "subscription_error");
  assert.deepEqual(
    { code: failure.code, message: failure.message },
    { code: -32602, message: "invalid subscription" },
  );
  assert.equal(socket.closeCalls.length, 1);
  assert.deepEqual(timers.delays(), [100]);

  socket.emit("close", { code: 1000, reason: "closed after error" });
  assert.deepEqual(timers.delays(), [100]);
  timers.runDelay(100);
  assert.equal(WebSocketImpl.instances.length, 2);

  controller.stop();
});

test("times out a WebSocket handshake that never opens", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver({
    connectionTimeoutMs: 50,
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 100,
  });
  const socket = WebSocketImpl.instances[0];
  assert.deepEqual(timers.delays(), [50]);
  timers.runDelay(50);
  assert.equal(socket.closeCalls.length, 1);
  assert.equal(statuses.some(({ state }) => state === "connection_timeout"), true);
  assert.deepEqual(timers.delays(), [100]);
  timers.runDelay(100);
  assert.equal(WebSocketImpl.instances.length, 2);
  controller.stop();
});

test("times out a subscription acknowledgement that never arrives", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver({
    subscriptionTimeoutMs: 60,
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 100,
  });
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");
  assert.deepEqual(timers.delays(), [60]);
  timers.runDelay(60);
  assert.equal(socket.closeCalls.length, 1);
  assert.equal(
    statuses.some(({ state }) => state === "subscription_timeout"),
    true,
  );
  assert.deepEqual(timers.delays(), [100]);
  controller.stop();
});

test("reconnects with capped exponential backoff without duplicate timers", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver({
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 250,
  });

  WebSocketImpl.instances[0].emit("error");
  WebSocketImpl.instances[0].emit("close");
  assert.deepEqual(timers.delays(), [100]);

  timers.runDelay(100);
  WebSocketImpl.instances[1].emit("error");
  assert.deepEqual(timers.delays(), [200]);

  timers.runDelay(200);
  WebSocketImpl.instances[2].emit("close", { code: 1006 });
  assert.deepEqual(timers.delays(), [250]);
  assert.deepEqual(
    statuses
      .filter(({ state }) => state === "reconnecting")
      .map(({ delayMs }) => delayMs),
    [100, 200, 250],
  );

  controller.stop();
});

test("resets reconnect backoff after an acknowledged subscription", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver({
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 400,
  });

  WebSocketImpl.instances[0].emit("error");
  timers.runDelay(100);
  const recovered = WebSocketImpl.instances[1];
  recovered.emit("open");
  recovered.message({ jsonrpc: "2.0", id: 1, result: 8 });
  recovered.emit("close", { code: 1006 });

  assert.equal(statuses.at(-1).delayMs, 100);
  assert.deepEqual(timers.delays(), [100]);

  controller.stop();
});

test("five-minute silence watchdog closes and reconnects the socket", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver();
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");
  socket.message({ jsonrpc: "2.0", id: 1, result: 3 });

  assert.deepEqual(timers.delays(), [heliusObserverDefaults.inactivityTimeoutMs]);
  timers.runDelay(heliusObserverDefaults.inactivityTimeoutMs);

  assert.equal(socket.closeCalls.length, 1);
  assert.equal(
    statuses.some(({ state }) => state === "silence_timeout"),
    true,
  );
  assert.deepEqual(timers.delays(), [heliusObserverDefaults.reconnectBaseDelayMs]);

  controller.stop();
});

test("validated subscription events refresh the silence watchdog", async () => {
  const { WebSocketImpl, timers, controller } = await startObserver({
    inactivityTimeoutMs: 500,
  });
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");
  assert.equal(timers.size, 1);

  socket.message({ jsonrpc: "2.0", id: 1, result: 3 });
  assert.equal(timers.size, 1);
  assert.deepEqual(timers.delays(), [500]);
  const beforeEvent = timers.scheduledCount;
  socket.message({
    jsonrpc: "2.0",
    params: {
      subscription: 3,
      result: {
        context: { slot: 1 },
        value: {
          signature: "valid-event",
          logs: ["Program log: Instruction: Create"],
          err: null,
        },
      },
    },
  });
  assert.equal(timers.scheduledCount, beforeEvent + 1);
  assert.deepEqual(timers.delays(), [500]);

  controller.stop();
});

test("malformed and unrelated messages do not refresh the silence watchdog", async () => {
  const { WebSocketImpl, timers, controller } = await startObserver({
    inactivityTimeoutMs: 500,
  });
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");
  socket.message({ jsonrpc: "2.0", id: 1, result: 3 });
  const beforeInvalidMessages = timers.scheduledCount;
  socket.message("not-json");
  socket.message({ jsonrpc: "2.0", id: 99, result: 7 });
  assert.equal(timers.scheduledCount, beforeInvalidMessages);
  assert.deepEqual(timers.delays(), [500]);

  controller.stop();
});

test("retires a subscription on a malformed notification identity", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver({
    inactivityTimeoutMs: 500,
    reconnectBaseDelayMs: 100,
    reconnectMaxDelayMs: 100,
  });
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");
  socket.message({ jsonrpc: "2.0", id: 1, result: 3 });
  socket.message({
    jsonrpc: "2.0",
    params: {
      subscription: 3,
      result: {
        context: {},
        value: {
          signature: null,
          logs: ["Program log: Instruction: Create"],
          err: null,
        },
      },
    },
  });
  assert.equal(
    statuses.some(({ state }) => state === "event_payload_invalid"),
    true,
  );
  assert.deepEqual(timers.delays(), [100]);
  assert.equal(socket.closeCalls.length, 1);
  controller.stop();
});

test("retires when provider logs are missing, empty, or malformed", async () => {
  for (const logs of [
    undefined,
    [],
    [""],
    ["Program log: Instruction: Create", 7],
    "Program log: Instruction: Create",
  ]) {
    const { WebSocketImpl, statuses, controller } = await startObserver({
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 100,
    });
    const socket = WebSocketImpl.instances[0];
    socket.emit("open");
    socket.message({ jsonrpc: "2.0", id: 1, result: 3 });
    socket.message({
      jsonrpc: "2.0",
      params: {
        subscription: 3,
        result: {
          context: { slot: 1 },
          value: { signature: "malformed-logs", logs, err: null },
        },
      },
    });
    assert.equal(
      statuses.some(({ state }) => state === "event_payload_invalid"),
      true,
    );
    controller.stop();
  }
});

test("rejects a watchdog interval at or above the Helius inactivity limit", async () => {
  const WebSocketImpl = createFakeWebSocket();
  await assert.rejects(
    runPumpLogsObserver({
      apiKey: API_KEY,
      WebSocketImpl,
      inactivityTimeoutMs: heliusObserverDefaults.heliusInactivityLimitMs,
    }),
    /must remain below/,
  );
  assert.equal(WebSocketImpl.instances.length, 0);
});

test("stop clears timers, closes the active socket, and prevents reconnect", async () => {
  const { WebSocketImpl, timers, statuses, controller } = await startObserver();
  const socket = WebSocketImpl.instances[0];
  socket.emit("open");

  controller.stop();
  assert.equal(controller.stopped, true);
  assert.equal(controller.socket, null);
  assert.equal(socket.closeCalls.length, 1);
  assert.equal(timers.size, 0);
  assert.equal(statuses.at(-1).state, "stopped");

  socket.emit("error");
  socket.emit("close");
  assert.equal(timers.size, 0);
  assert.equal(WebSocketImpl.instances.length, 1);
});

test("handleObserverMessage exposes subscription errors without throwing", () => {
  assert.deepEqual(
    handleObserverMessage(
      JSON.stringify({ id: 1, error: { code: -32000, message: "denied" } }),
    ),
    {
      subscriptionError: {
        code: -32000,
        message: "denied",
      },
    },
  );
});
