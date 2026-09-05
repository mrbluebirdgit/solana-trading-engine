import assert from "node:assert/strict";
import test from "node:test";

import { validateProvider } from "../src/config/credential-specs.mjs";
import { checkHeliusHealth } from "../src/integrations/helius/health.mjs";

const validTelegramEnvironment = Object.freeze({
  TELEGRAM_API_ID: "1234567",
  TELEGRAM_API_HASH: "0123456789abcdef0123456789abcdef",
});

const validHeliusEnvironment = Object.freeze({
  HELIUS_API_KEY: "01234567-89ab-cdef-0123-456789abcdef",
});

const validGmgnEnvironment = Object.freeze({
  GMGN_API_KEY: "gmgn_personal_api_key_for_testing",
});

const validJupiterEnvironment = Object.freeze({
  JUPITER_API_KEY: "jupiter_api_key_for_testing",
});

const validSolscanEnvironment = Object.freeze({
  SOLSCAN_API_KEY: "solscan_api_key_for_testing_only",
});

const validNarrativeEnvironment = Object.freeze({
  X_BEARER_TOKEN: "x-read-only-bearer-token-for-testing",
  LUNARCRUSH_API_KEY: "lunarcrush_read_only_key_for_testing",
  NEWSAPI_KEY: "newsapi_read_only_key_for_testing",
});

for (const provider of ["x", "lunarcrush", "newsapi"]) {
  test(`accepts a formatted ${provider} attention credential`, () => {
    const result = validateProvider(provider, validNarrativeEnvironment);
    assert.equal(result.ok, true);
    assert.equal(result.checks[0].ok, true);
  });
}

test("accepts a correctly formatted GMGN API key", () => {
  const result = validateProvider("gmgn", validGmgnEnvironment);

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].ok, true);
});

test("rejects a missing or malformed GMGN API key", () => {
  assert.equal(validateProvider("gmgn", {}).ok, false);
  assert.equal(
    validateProvider("gmgn", { GMGN_API_KEY: "contains spaces" }).ok,
    false,
  );
});

test("accepts a correctly formatted Jupiter API key", () => {
  const result = validateProvider("jupiter", validJupiterEnvironment);

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].ok, true);
});

test("rejects a missing or malformed Jupiter API key", () => {
  assert.equal(validateProvider("jupiter", {}).ok, false);
  assert.equal(
    validateProvider("jupiter", { JUPITER_API_KEY: "contains spaces" }).ok,
    false,
  );
});

test("accepts a correctly formatted Solscan API key", () => {
  assert.equal(validateProvider("solscan", validSolscanEnvironment).ok, true);
});

test("rejects a missing or malformed Solscan API key", () => {
  assert.equal(validateProvider("solscan", {}).ok, false);
  assert.equal(validateProvider("solscan", { SOLSCAN_API_KEY: "contains spaces" }).ok, false);
});

test("accepts a correctly formatted Helius API key", () => {
  const result = validateProvider("helius", validHeliusEnvironment);

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].ok, true);
});

test("rejects a missing or malformed Helius API key", () => {
  assert.equal(validateProvider("helius", {}).ok, false);
  assert.equal(
    validateProvider("helius", { HELIUS_API_KEY: "too short" }).ok,
    false,
  );
});

test("accepts a healthy Helius mainnet RPC response", async () => {
  const result = await checkHeliusHealth(validHeliusEnvironment.HELIUS_API_KEY, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, result: "ok" }),
    }),
  });

  assert.deepEqual(result, { ok: true, network: "mainnet" });
});

test("reports a rejected Helius request without exposing the key", async () => {
  await assert.rejects(
    checkHeliusHealth(validHeliusEnvironment.HELIUS_API_KEY, {
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.match(error.message, /HTTP 401/);
      assert.equal(
        error.message.includes(validHeliusEnvironment.HELIUS_API_KEY),
        false,
      );
      return true;
    },
  );
});

test("accepts correctly formatted Telegram credentials", () => {
  const result = validateProvider("telegram", validTelegramEnvironment);

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 2);
  assert.equal(result.checks.every((check) => check.ok), true);
});

test("reports missing Telegram credentials without exposing values", () => {
  const result = validateProvider("telegram", {});

  assert.equal(result.ok, false);
  assert.equal(result.checks.every((check) => !check.ok), true);
  assert.equal(JSON.stringify(result).includes("undefined"), false);
});

test("rejects malformed credentials", () => {
  const result = validateProvider("telegram", {
    TELEGRAM_API_ID: "abc",
    TELEGRAM_API_HASH: "not-a-hash",
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.every((check) => !check.ok), true);
});

test("rejects unknown providers", () => {
  assert.throws(
    () => validateProvider("unknown", validTelegramEnvironment),
    /Unknown provider/,
  );
});
