import assert from "node:assert/strict";
import test from "node:test";

import { formatOpportunityAlert } from "../src/core/alerts/observation-alert.mjs";
import { deliverNtfyAlert } from "../src/integrations/alerts/deliver.mjs";
import {
  classifyPumpLogs,
  heliusStreamConstants,
  parseHeliusWebhookPayload,
  parseLogsNotification,
  verifyWebhookAuth,
} from "../src/integrations/helius/stream-events.mjs";
import { quoteIntendedSize } from "../src/integrations/jupiter/intended-size.mjs";
import { NATIVE_SOL_MINT, PUMP_PROGRAM_ID } from "../src/integrations/pump/program-ids.mjs";

const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const API = "test-key-does-not-leave-errors";

test("classifies Pump create and migrate logs", () => {
  assert.equal(classifyPumpLogs(["Program log: Instruction: Create"]), "create");
  assert.equal(classifyPumpLogs(["Program log: Instruction: Migrate"]), "migrate");
  assert.equal(heliusStreamConstants.logsSubscribeRequest.params[0].mentions[0], PUMP_PROGRAM_ID);
});

test("parses webhook token mints without treating SOL as a candidate", () => {
  const events = parseHeliusWebhookPayload([
    {
      signature: "sig",
      slot: 99,
      logMessages: ["Program log: Instruction: Create"],
      tokenTransfers: [{ mint: MINT }, { mint: NATIVE_SOL_MINT }],
    },
  ]);
  assert.equal(events[0].eventType, "create");
  assert.deepEqual(events[0].candidateMints, [MINT]);
  assert.equal(events[0].runtimeAuthority, false);
});

test("parses logsSubscribe notifications", () => {
  const event = parseLogsNotification({
    params: {
      result: {
        context: { slot: 12 },
        value: {
          signature: "sig",
          logs: ["Program log: Instruction: Buy"],
          err: null,
        },
      },
    },
  });
  assert.equal(event.eventType, "swap");
  assert.equal(event.slot, 12);
});

test("rejects a missing or mismatched webhook token without echoing it", () => {
  assert.throws(() => verifyWebhookAuth("wrong", "secret-token"), /rejected/);
  try {
    verifyWebhookAuth("wrong", "secret-token");
  } catch (error) {
    assert.equal(error.message.includes("secret-token"), false);
  }
});

test("quotes intended size as a SOL buy and implied sell", async () => {
  const seen = [];
  const quotes = await quoteIntendedSize(
    { apiKey: API, mint: MINT, buyLamports: "50000000" },
    {
      fetchImpl: async (url) => {
        seen.push(url.searchParams.get("inputMint"));
        const buying = url.searchParams.get("inputMint") === NATIVE_SOL_MINT;
        return {
          ok: true,
          json: async () => ({
            inputMint: url.searchParams.get("inputMint"),
            outputMint: url.searchParams.get("outputMint"),
            inAmount: url.searchParams.get("amount"),
            outAmount: buying ? "1000" : "48000000",
            otherAmountThreshold: buying ? "990" : "47000000",
            priceImpact: buying ? 0.4 : 0.8,
            swapMode: "ExactIn",
          }),
        };
      },
    },
  );

  assert.deepEqual(seen, [NATIVE_SOL_MINT, MINT]);
  assert.equal(quotes.buy.output.amountAtomic, "1000");
  assert.equal(quotes.sell.input.amountAtomic, "1000");
  assert.equal(quotes.roundTripLamportsRecovered, "48000000");
  assert.equal(quotes.roundTripRetention, 0.96);
  assert.equal(quotes.runtimeAuthority, false);
});

test("formats a channel-agnostic phone alert", () => {
  const alert = formatOpportunityAlert({
    mint: MINT,
    venueStage: "migration_pending",
    cutoffSlot: 42,
    buyPriceImpactPercent: 1.2,
    sellPriceImpactPercent: 2.4,
    roundTripRetention: 0.91,
  });
  assert.equal(alert.priority, "high");
  assert.match(alert.body, /observe only/);
  assert.equal(alert.runtimeAuthority, false);
});

test("ntfy delivery never includes the Helius or Jupiter keys", async () => {
  let headers;
  await deliverNtfyAlert(
    { topic: "demo-topic", title: "t", body: "b" },
    {
      fetchImpl: async (url, init) => {
        headers = init.headers;
        assert.match(String(url), /ntfy\.sh\/demo-topic/);
        return { ok: true };
      },
    },
  );
  assert.equal(JSON.stringify(headers).includes(API), false);
});
