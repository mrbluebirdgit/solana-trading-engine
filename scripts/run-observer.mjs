#!/usr/bin/env node

import { parseObserverRuntime } from "../src/config/observer-runtime.mjs";
import { startObserverWorker } from "../src/core/runtime/observer-worker.mjs";

let worker = null;
let stopping = false;
let resolveStartup;
const startupFinished = new Promise((resolve) => { resolveStartup = resolve; });
const SHUTDOWN_DEADLINE_MS = 25_000;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.error(`[observer] ${signal}; draining before exit`);
  const deadline = setTimeout(() => {
    console.error("[observer] shutdown deadline exceeded; forcing process exit");
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS);
  try {
    await startupFinished;
    await worker?.stop();
  } catch {
    console.error("[observer] graceful shutdown failed");
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
  // Node's WebSocket API has no portable terminate primitive. Accepted writes
  // have been awaited and health shutdown is complete here, so release any peer
  // that ignored the WebSocket close handshake.
  process.exit(process.exitCode ?? 0);
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

try {
  const config = parseObserverRuntime();
  console.error(
    `[observer] live-locked observation beta starting; health=:${config.port}; log=${config.observationLogPath}`,
  );
  worker = await startObserverWorker({ config });
  void worker.fatal.then((reason) => {
    console.error(`[observer] fatal stream gap: ${reason}`);
    process.exitCode = 1;
    return shutdown(`fatal stream gap (${reason})`);
  });
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : "observer startup failed"}`);
  process.exitCode = 1;
} finally {
  resolveStartup();
}
