import assert from "node:assert/strict";
import test from "node:test";

import { validateProvider } from "../src/config/credential-specs.mjs";

const validTelegramEnvironment = Object.freeze({
  TELEGRAM_API_ID: "1234567",
  TELEGRAM_API_HASH: "0123456789abcdef0123456789abcdef",
});

const validHeliusEnvironment = Object.freeze({
  HELIUS_API_KEY: "01234567-89ab-cdef-0123-456789abcdef",
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
