#!/usr/bin/env node

import {
  listProviders,
  validateProvider,
} from "../src/config/credential-specs.mjs";

const requestedProvider = process.argv[2] ?? "all";
const providers =
  requestedProvider === "all" ? listProviders() : [requestedProvider];

let failed = false;

for (const provider of providers) {
  let result;

  try {
    result = validateProvider(provider);
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    failed = true;
    continue;
  }

  console.log(`${result.ok ? "[PASS]" : "[FAIL]"} ${provider}`);

  for (const check of result.checks) {
    console.log(`  ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.reason}`);
  }

  failed ||= !result.ok;
}

if (failed) {
  console.error("Integration configuration verification failed.");
  process.exitCode = 1;
} else {
  console.log("Integration configuration verification passed.");
}
