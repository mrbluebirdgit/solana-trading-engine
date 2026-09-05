#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkLunarCrushAttentionAccess } from "../src/integrations/attention/read-health.mjs";

const validation = validateProvider("lunarcrush");
const plan = (process.env.LUNARCRUSH_PLAN ?? "hobby").trim().toLowerCase();
if (!validation.ok) {
  console.error(`[FAIL] LunarCrush configuration: ${validation.checks[0].reason}`);
  process.exitCode = 1;
} else if (plan === "hobby") {
  console.log("[SKIP] LunarCrush Hobby has no social-topic access; production adapter remains disabled");
} else {
  try {
    const result = await checkLunarCrushAttentionAccess(process.env.LUNARCRUSH_API_KEY);
    console.log(`[PASS] LunarCrush read-only attention access (${result.sampleCount} topics)`);
  } catch (error) {
    console.error(`[FAIL] LunarCrush read-only attention access: ${error.message}`);
    process.exitCode = 1;
  }
}
