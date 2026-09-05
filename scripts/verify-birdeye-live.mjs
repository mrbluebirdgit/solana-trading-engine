#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkBirdeyeReadAccess } from "../src/integrations/birdeye/read-health.mjs";

const validation = validateProvider("birdeye");

console.log(`${validation.ok ? "[PASS]" : "[FAIL]"} birdeye`);

for (const check of validation.checks) {
  console.log(`  ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.reason}`);
}

if (!validation.ok) {
  console.error("Birdeye integration configuration verification failed.");
  process.exitCode = 1;
} else {
  try {
    const result = await checkBirdeyeReadAccess(process.env.BIRDEYE_API_KEY);
    console.log(
      `[PASS] Birdeye ${result.capability} read-only request reached ${result.network}.`,
    );
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  }
}

