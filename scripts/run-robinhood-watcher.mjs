#!/usr/bin/env node

import { parseRobinhoodWatcherConfig } from "../src/robinhood/config.mjs";
import { startRobinhoodWatcher } from "../src/robinhood/watcher.mjs";

let worker;
let stopping = false;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.error(`[robinhood] ${signal}; stopping`);
  await worker?.stop();
  process.exit(0);
}

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });

try {
  const config = parseRobinhoodWatcherConfig();
  worker = await startRobinhoodWatcher({ config });
  console.error(`[robinhood] watcher started; health=:${config.healthPort}; max-age=${config.maxAgeMs}ms`);
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : "Robinhood watcher startup failed"}`);
  process.exit(1);
}

