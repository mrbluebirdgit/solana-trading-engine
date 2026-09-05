import assert from "node:assert/strict";
import test from "node:test";

import { validateProvider } from "../src/config/credential-specs.mjs";

test("accepts a correctly formatted Birdeye API key", () => {
  const result = validateProvider("birdeye", {
    BIRDEYE_API_KEY: "birdeye_api_key_for_testing_only",
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 1);
  assert.equal(result.checks[0].ok, true);
});

test("rejects a missing or malformed Birdeye API key", () => {
  assert.equal(validateProvider("birdeye", {}).ok, false);
  assert.equal(
    validateProvider("birdeye", { BIRDEYE_API_KEY: "contains spaces" }).ok,
    false,
  );
});

