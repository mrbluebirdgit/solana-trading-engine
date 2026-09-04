#!/usr/bin/env node

import { evaluateOpportunity } from "../src/core/decision/evaluate-opportunity.mjs";
import { observeOpportunity } from "../src/core/intelligence/observe-opportunity.mjs";
import {
  deliverNtfyAlert,
  deliverTelegramBotAlert,
} from "../src/integrations/alerts/deliver.mjs";
import { runPumpLogsObserver } from "../src/integrations/helius/logs-observer.mjs";

const notify = process.argv.includes("--notify");
const seen = new Set();

async function deliver(alert) {
  if (!notify) return;
  if (process.env.NTFY_TOPIC?.trim()) {
    await deliverNtfyAlert({
      topic: process.env.NTFY_TOPIC,
      title: alert.title,
      body: alert.body,
      priority: alert.priority,
    });
    return;
  }
  if (process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim()) {
    await deliverTelegramBotAlert({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
      body: `${alert.title}\n${alert.body}`,
    });
  }
}

if (!process.env.HELIUS_API_KEY?.trim() || !process.env.JUPITER_API_KEY?.trim()) {
  console.error("[FAIL] HELIUS_API_KEY and JUPITER_API_KEY are required");
  process.exitCode = 1;
} else {
  console.error("[observer] live-locked Pump log observer starting");
  await runPumpLogsObserver({
    apiKey: process.env.HELIUS_API_KEY,
    onStatus: (status) => console.error(`[observer] ${status.state}`),
    onEvent: async (event) => {
      if (event.err) return;
      if (event.eventType === "unknown") return;
      for (const mint of event.candidateMints ?? []) {
        const key = `${event.signature}:${mint}`;
        if (seen.has(key)) continue;
        seen.add(key);
        try {
          const observation = await observeOpportunity({
            heliusApiKey: process.env.HELIUS_API_KEY,
            jupiterApiKey: process.env.JUPITER_API_KEY,
            mint,
          });
          const decision = observation.decision ?? evaluateOpportunity({
            stage: observation.stage,
            quotes: observation.quotes,
            quoteError: observation.quoteError,
          });
          console.log(JSON.stringify({
            decision,
            alert: observation.alert,
            signature: event.signature,
          }));
          if (decision.decision === "ALERT_ONLY" || decision.decision === "PAPER_ELIGIBLE") {
            await deliver({
              ...observation.alert,
              title: `${decision.decision} ${observation.alert.title}`,
              body: `${observation.alert.body}\ndecision: ${decision.decision}`,
            });
          }
        } catch (error) {
          console.error(`[observer] ${error.message}`);
        }
      }
    },
  });
}
