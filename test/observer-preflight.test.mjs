import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyObserverDeployment,
  verifyObserverLive,
} from "../src/core/runtime/observer-preflight.mjs";

const credentials = Object.freeze({
  heliusApiKey: "helius-secret",
  jupiterApiKey: "jupiter-secret",
  telegramBotToken: "telegram-secret",
  telegramChatId: "42",
});

test("verifies the three live observer surfaces without gaining authority", async () => {
  let stopped = false;
  let quoteRequest;
  let telegramRequest;
  const result = await verifyObserverLive(credentials, {
    runObserverImpl: async ({ onStatus }) => {
      queueMicrotask(() => onStatus({ state: "subscribed", subscriptionId: 7 }));
      return { stop: () => { stopped = true; } };
    },
    requestQuoteImpl: async (request) => {
      quoteRequest = request;
      return { providerQuoteId: "quote-1" };
    },
    deliverTelegramImpl: async (request) => {
      telegramRequest = request;
      return { messageId: 9 };
    },
  });

  assert.equal(stopped, true);
  assert.equal(quoteRequest.apiKey, credentials.jupiterApiKey);
  assert.match(telegramRequest.body, /observe only/);
  assert.equal(result.runtimeAuthority, false);
  assert.equal(result.telegramMessageId, 9);
});

test("fails closed before network calls when a credential is absent", async () => {
  await assert.rejects(
    verifyObserverLive({ ...credentials, telegramChatId: "" }),
    /telegramChatId is required/,
  );
});

test("verifies configured Birdeye, GMGN, and Solscan read access before sending the preflight", async () => {
  const checked = [];
  let body = "";
  const result = await verifyObserverLive({
    ...credentials,
    birdeyeApiKey: "birdeye-key",
    gmgnApiKey: "gmgn-key",
    solscanApiKey: "solscan-key",
  }, {
    runObserverImpl: async ({ onStatus }) => {
      queueMicrotask(() => onStatus({ state: "subscribed", subscriptionId: 7 }));
      return { stop: () => {} };
    },
    requestQuoteImpl: async () => ({ providerQuoteId: "quote-1" }),
    checkBirdeyeImpl: async (key) => { checked.push(["birdeye", key]); },
    checkGmgnImpl: async (key) => { checked.push(["gmgn", key]); },
    checkSolscanImpl: async (key) => { checked.push(["solscan", key]); },
    deliverTelegramImpl: async (request) => {
      body = request.body;
      return { messageId: 10 };
    },
  });
  assert.deepEqual(checked.sort(), [
    ["birdeye", "birdeye-key"],
    ["gmgn", "gmgn-key"],
    ["solscan", "solscan-key"],
  ]);
  assert.match(body, /Birdeye \+ GMGN \+ Solscan read access/);
  assert.deepEqual(result.supplementalProviders, ["Birdeye", "GMGN", "Solscan"]);
});

test("validates the complete startup configuration before making network calls", async () => {
  let networkCalls = 0;
  const dependencies = {
    runObserverImpl: async () => { networkCalls += 1; },
    requestQuoteImpl: async () => { networkCalls += 1; },
    deliverTelegramImpl: async () => { networkCalls += 1; },
  };

  await assert.rejects(
    verifyObserverDeployment({
      env: {
        HELIUS_API_KEY: "helius-secret",
        JUPITER_API_KEY: "jupiter-secret",
        TELEGRAM_BOT_TOKEN: "telegram-secret",
        TELEGRAM_ALLOWED_CHAT_ID: "42",
        NODE_ENV: "production",
        TRADING_MODE: "observe",
        LIVE_TRADING_ENABLED: "false",
        NARRATIVE_RADAR_ENABLED: "true",
        LUNARCRUSH_API_KEY: "lunar-key",
        LUNARCRUSH_PLAN: "hobby",
      },
    }, dependencies),
    /NARRATIVE_RADAR_ENABLED requires/,
  );
  assert.equal(networkCalls, 0);
});

test("uses normalized runtime credentials for the live deployment checks", async () => {
  let quoteKey;
  let telegramToken;
  const result = await verifyObserverDeployment({
    env: {
      HELIUS_API_KEY: " helius-secret ",
      JUPITER_API_KEY: " jupiter-secret ",
      TELEGRAM_BOT_TOKEN: " telegram-secret ",
      TELEGRAM_ALLOWED_CHAT_ID: " 42 ",
      NODE_ENV: "production",
      TRADING_MODE: "observe",
      LIVE_TRADING_ENABLED: "false",
      NARRATIVE_RADAR_ENABLED: "false",
    },
    cwd: "/var/lib/solana-observer",
  }, {
    runObserverImpl: async ({ apiKey, onStatus }) => {
      assert.equal(apiKey, "helius-secret");
      queueMicrotask(() => onStatus({ state: "subscribed", subscriptionId: 7 }));
      return { stop: () => {} };
    },
    requestQuoteImpl: async ({ apiKey }) => {
      quoteKey = apiKey;
      return { providerQuoteId: "quote-1" };
    },
    deliverTelegramImpl: async ({ botToken }) => {
      telegramToken = botToken;
      return { messageId: 11 };
    },
  });

  assert.equal(quoteKey, "jupiter-secret");
  assert.equal(telegramToken, "telegram-secret");
  assert.equal(result.runtimeConfiguration, "validated");
  assert.equal(result.narrativeRadarEnabled, false);
  assert.equal(result.runtimeAuthority, false);
});
