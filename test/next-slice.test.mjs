import assert from "node:assert/strict";
import test from "node:test";

import { formatOpportunityAlert } from "../src/core/alerts/observation-alert.mjs";
import { deliverTelegramBotAlert } from "../src/integrations/alerts/deliver.mjs";
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
const pumpLogs = (instruction) => [
  `Program ${PUMP_PROGRAM_ID} invoke [1]`,
  `Program log: Instruction: ${instruction}`,
  `Program ${PUMP_PROGRAM_ID} success`,
];

test("classifies Pump create and migrate logs", () => {
  assert.equal(classifyPumpLogs(pumpLogs("Create")), "create");
  assert.equal(classifyPumpLogs(pumpLogs("Migrate")), "migrate");
  assert.equal(
    classifyPumpLogs([
      ...pumpLogs("Migrate"),
      "Program log: Instruction: InitializeMint2",
    ]),
    "migrate",
  );
  assert.equal(classifyPumpLogs(["Program log: Instruction: InitializeMint2"]), "unknown");
  assert.equal(classifyPumpLogs(pumpLogs("MigrateTokens")), "unknown");
  assert.equal(
    classifyPumpLogs(pumpLogs("MigrateBondingCurveCreator")),
    "unknown",
  );
  assert.equal(classifyPumpLogs(pumpLogs("Buyback")), "unknown");
  assert.equal(classifyPumpLogs(pumpLogs("Seller")), "unknown");
  assert.equal(
    classifyPumpLogs([
      ...pumpLogs("Create"),
      ...pumpLogs("Migrate"),
    ]),
    "lifecycle",
  );
  assert.equal(
    classifyPumpLogs([
      "Program MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr invoke [1]",
      "Program log: Instruction: Migrate",
    ]),
    "unknown",
  );
  assert.equal(heliusStreamConstants.logsSubscribeRequest.params[0].mentions[0], PUMP_PROGRAM_ID);
});

test("parses webhook token mints without treating SOL as a candidate", () => {
  const events = parseHeliusWebhookPayload([
    {
      signature: "sig",
      slot: 99,
      logMessages: pumpLogs("Create"),
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
          logs: pumpLogs("Buy"),
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
  let clockTick = 0;
  const quotes = await quoteIntendedSize(
    { apiKey: API, mint: MINT, buyLamports: "50000000" },
    {
      now: () => new Date(1_788_523_200_000 + clockTick++ * 10),
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
  assert.deepEqual(quotes.quoteSequence, {
    buyRequestedAt: "2026-09-04T12:00:00.000Z",
    buyReceivedAt: "2026-09-04T12:00:00.010Z",
    sellRequestedAt: "2026-09-04T12:00:00.020Z",
    sellReceivedAt: "2026-09-04T12:00:00.030Z",
  });
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
  assert.match(alert.body, /pump\.fun\/coin/);
  assert.match(alert.body, /dexscreener\.com\/solana/);
  assert.equal(alert.runtimeAuthority, false);
});

test("uses a supported alert priority for every stage", () => {
  const supported = new Set(["min", "low", "default", "high", "max"]);
  for (const venueStage of ["pump_curve_active", "migration_pending", "pumpswap_amm", "other_amm", "unknown"]) {
    assert.equal(supported.has(formatOpportunityAlert({ mint: MINT, venueStage }).priority), true);
  }
});

test("Telegram Bot delivery requires an acknowledgement and never puts its token in the body", async () => {
  const token = "123:secret-token";
  let request;
  const result = await deliverTelegramBotAlert(
    { botToken: token, chatId: "42", body: "observe-only test" },
    {
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return {
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 7 } }),
        };
      },
    },
  );
  assert.equal(result.messageId, 7);
  assert.equal(request.init.body.includes(token), false);
  assert.deepEqual(JSON.parse(request.init.body), {
    chat_id: "42",
    text: "observe-only test",
    disable_web_page_preview: true,
  });
});

test("Telegram Bot delivery fails when the API does not acknowledge the message", async () => {
  await assert.rejects(
    deliverTelegramBotAlert(
      { botToken: "123:secret", chatId: "42", body: "test" },
      { fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false }) }) },
    ),
    /not acknowledged/,
  );
});
