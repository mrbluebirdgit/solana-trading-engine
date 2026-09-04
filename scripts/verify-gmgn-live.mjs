#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkGmgnReadAccess } from "../src/integrations/gmgn/read-health.mjs";

const validation = validateProvider("gmgn");

console.log(`${validation.ok ? "[PASS]" : "[FAIL]"} gmgn`);

for (const check of validation.checks) {
  console.log(`  ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.reason}`);
}

if (!validation.ok) {
  console.error("GMGN integration configuration verification failed.");
  process.exitCode = 1;
} else {
  try {
    const result = await checkGmgnReadAccess(process.env.GMGN_API_KEY);
    console.log(
      `[PASS] GMGN ${result.capability} intelligence request returned ${result.records} record(s).`,
    );
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  }
}
