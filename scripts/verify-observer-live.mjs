#!/usr/bin/env node

import { verifyObserverDeployment } from "../src/core/runtime/observer-preflight.mjs";

try {
  const result = await verifyObserverDeployment();
  console.log(
    `[OK] observer preflight passed; configuration=${result.runtimeConfiguration}; Helius=${result.heliusSubscription}; supplemental=${result.supplementalProviders.join(",") || "none"}; Telegram message=${result.telegramMessageId ?? "acknowledged"}; runtimeAuthority=false`,
  );
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : "observer preflight failed"}`);
  process.exitCode = 1;
}
