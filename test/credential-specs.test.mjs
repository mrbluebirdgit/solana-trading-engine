import assert from "node:assert/strict";
import test from "node:test";

import { validateProvider } from "../src/config/credential-specs.mjs";

const validTelegramEnvironment = Object.freeze({
  TELEGRAM_API_ID: "1234567",
  TELEGRAM_API_HASH: "0123456789abcdef0123456789abcdef",
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
