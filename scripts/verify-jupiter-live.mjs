#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkJupiterReadAccess } from "../src/integrations/jupiter/read-health.mjs";

const validation = validateProvider("jupiter");

console.log(`${validation.ok ? "[PASS]" : "[FAIL]"} jupiter`);

for (const check of validation.checks) {
  console.log(`  ${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.reason}`);
}

if (!validation.ok) {
  console.error("Jupiter integration configuration verification failed.");
  process.exitCode = 1;
} else {
  try {
    const result = await checkJupiterReadAccess(process.env.JUPITER_API_KEY);
    console.log(
      `[PASS] Jupiter ${result.capability} read-only request reached ${result.network}.`,
    );
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  }
}
