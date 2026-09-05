import assert from "node:assert/strict";
import test from "node:test";

import { verifyObserverLive } from "../src/core/runtime/observer-preflight.mjs";

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

test("verifies configured Birdeye and GMGN read access before sending the preflight", async () => {
  const checked = [];
  let body = "";
  const result = await verifyObserverLive({
    ...credentials,
    birdeyeApiKey: "birdeye-key",
    gmgnApiKey: "gmgn-key",
  }, {
    runObserverImpl: async ({ onStatus }) => {
      queueMicrotask(() => onStatus({ state: "subscribed", subscriptionId: 7 }));
      return { stop: () => {} };
    },
    requestQuoteImpl: async () => ({ providerQuoteId: "quote-1" }),
    checkBirdeyeImpl: async (key) => { checked.push(["birdeye", key]); },
    checkGmgnImpl: async (key) => { checked.push(["gmgn", key]); },
    deliverTelegramImpl: async (request) => {
      body = request.body;
      return { messageId: 10 };
    },
  });
  assert.deepEqual(checked.sort(), [
    ["birdeye", "birdeye-key"],
    ["gmgn", "gmgn-key"],
  ]);
  assert.match(body, /Birdeye \+ GMGN read access/);
  assert.deepEqual(result.supplementalProviders, ["Birdeye", "GMGN"]);
});
