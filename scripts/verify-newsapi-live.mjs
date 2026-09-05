#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkNewsApiAttentionAccess } from "../src/integrations/attention/read-health.mjs";

const validation = validateProvider("newsapi");
if (!validation.ok) {
  console.error(`[FAIL] NewsAPI configuration: ${validation.checks[0].reason}`);
  process.exitCode = 1;
} else {
  try {
    const result = await checkNewsApiAttentionAccess(process.env.NEWSAPI_KEY);
    console.log(`[PASS] NewsAPI read-only attention access (${result.sampleCount} headlines)`);
  } catch (error) {
    console.error(`[FAIL] NewsAPI read-only attention access: ${error.message}`);
    process.exitCode = 1;
  }
}
