#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkHeliusHealth } from "../src/integrations/helius/health.mjs";

const validation = validateProvider("helius");

if (!validation.ok) {
  console.error("[FAIL] Helius credential formatting");
  for (const check of validation.checks) {
    console.error(`  FAIL ${check.name}: ${check.reason}`);
  }
  process.exitCode = 1;
} else {
  try {
    await checkHeliusHealth(process.env.HELIUS_API_KEY.trim());
    console.log("[PASS] Helius credentials and mainnet RPC connection");
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  }
}
