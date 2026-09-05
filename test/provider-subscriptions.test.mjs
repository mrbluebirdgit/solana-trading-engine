import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = new URL("../config/provider-subscriptions.v1.json", import.meta.url);

test("records every deployed provider plan without granting runtime authority", async () => {
  const catalog = JSON.parse(await readFile(file, "utf8"));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.runtimeAuthority, false);
  assert.deepEqual(
    catalog.providers.map(({ id }) => id).sort(),
    ["birdeye", "gmgn", "helius", "jupiter", "lunarcrush", "newsapi", "solscan", "telegram_bot"],
  );
  assert.equal(catalog.providers.every((provider) => provider.upgradeDecision !== "upgrade_now"), true);
  assert.equal(catalog.providers.every((provider) => /^https:\/\//.test(provider.reference)), true);
});
