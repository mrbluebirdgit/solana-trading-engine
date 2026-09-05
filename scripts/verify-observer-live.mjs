#!/usr/bin/env node

import { verifyObserverLive } from "../src/core/runtime/observer-preflight.mjs";

try {
  const result = await verifyObserverLive({
    heliusApiKey: process.env.HELIUS_API_KEY,
    jupiterApiKey: process.env.JUPITER_API_KEY,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
  });
  console.log(
    `[OK] observer preflight passed; Helius=${result.heliusSubscription}; Telegram message=${result.telegramMessageId ?? "acknowledged"}; runtimeAuthority=false`,
  );
} catch (error) {
  console.error(`[FAIL] ${error instanceof Error ? error.message : "observer preflight failed"}`);
  process.exitCode = 1;
}
