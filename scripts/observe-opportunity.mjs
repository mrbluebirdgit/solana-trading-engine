#!/usr/bin/env node

import { observeOpportunity } from "../src/core/intelligence/observe-opportunity.mjs";
import { createObservationNotification } from "../src/core/alerts/notification-gate.mjs";
import { deliverTelegramBotAlert } from "../src/integrations/alerts/deliver.mjs";

const mint = process.argv[2];
const notify = process.argv.includes("--notify");

if (!mint) {
  console.error(
    "usage: node scripts/observe-opportunity.mjs <mint> [--notify]",
  );
  process.exitCode = 1;
} else if (!process.env.HELIUS_API_KEY?.trim() || !process.env.JUPITER_API_KEY?.trim()) {
  console.error("[FAIL] HELIUS_API_KEY and JUPITER_API_KEY are required");
  process.exitCode = 1;
} else {
  try {
    const observation = await observeOpportunity({
      heliusApiKey: process.env.HELIUS_API_KEY,
      jupiterApiKey: process.env.JUPITER_API_KEY,
      mint,
    });

    console.log(
      JSON.stringify(
        {
          mint: observation.stage.mint,
          venueStage: observation.stage.venueStage,
          cutoffSlot: observation.stage.cutoffSlot,
          mintAuthority: observation.stage.mintAuthority,
          freezeAuthority: observation.stage.freezeAuthority,
          buyPriceImpactPercent: observation.quotes?.buyPriceImpactPercent ?? null,
          sellPriceImpactPercent: observation.quotes?.sellPriceImpactPercent ?? null,
          roundTripRetention: observation.quotes?.roundTripRetention ?? null,
          quoteError: observation.quoteError,
          decision: observation.decision,
          alert: observation.alert,
          runtimeAuthority: false,
        },
        null,
        2,
      ),
    );

    if (notify) {
      const notification = createObservationNotification(observation);
      const hasTelegram = Boolean(
        process.env.TELEGRAM_BOT_TOKEN?.trim() &&
        process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim(),
      );
      if (!notification) {
        console.error(`[skip] notification blocked for decision ${observation.decision?.decision ?? "unknown"}`);
      } else if (hasTelegram) {
        await deliverTelegramBotAlert({
          botToken: process.env.TELEGRAM_BOT_TOKEN,
          chatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
          body: `${notification.title}\n${notification.body}`,
        });
        console.error("[ok] telegram_bot");
      } else {
        console.error("[FAIL] --notify needs Telegram bot secrets");
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(`[FAIL] ${error.message}`);
    process.exitCode = 1;
  }
}
