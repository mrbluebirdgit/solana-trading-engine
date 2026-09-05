#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkXAttentionAccess } from "../src/integrations/attention/read-health.mjs";

const validation = validateProvider("x");
if (!validation.ok) {
  console.error(`[FAIL] X configuration: ${validation.checks[0].reason}`);
  process.exitCode = 1;
} else {
  try {
    const result = await checkXAttentionAccess(process.env.X_BEARER_TOKEN);
    console.log(`[PASS] X read-only attention access (${result.sampleCount} topics)`);
  } catch (error) {
    console.error(`[FAIL] X read-only attention access: ${error.message}`);
    process.exitCode = 1;
  }
}
