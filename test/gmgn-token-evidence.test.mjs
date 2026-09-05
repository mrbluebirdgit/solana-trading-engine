import assert from "node:assert/strict";
import test from "node:test";

import {
  readGmgnCandidateEvidence,
  readGmgnPrice,
} from "../src/integrations/gmgn/token-evidence.mjs";

const rawToken = {
  address: "MintOne",
  name: "Example",
  symbol: "EX",
  liquidity: "30000",
  holder_count: 420,
  creation_timestamp: 1788606901,
  launchpad_platform: "Pump.fun",
  price: {
    price: "0.002",
    volume_5m: "9000",
  },
  pool: { exchange: "pump" },
  stat: {
    top_10_holder_rate: "0.18",
    dev_team_hold_rate: "0.025",
    top_bundler_trader_percentage: "0.07",
    top_rat_trader_percentage: "0.02",
    bot_degen_rate: "0.1",
  },
  wallet_tags_stat: {
    smart_wallets: 5,
    renowned_wallets: 2,
    sniper_wallets: 8,
  },
};

function budget() {
  return {
    take: async () => ({ ok: true }),
    blockFor: async () => {},
  };
}

test("invokes only the pinned GMGN read-only token command with an isolated environment", async () => {
  let invocation;
  const evidence = await readGmgnCandidateEvidence({
    apiKey: "gmgn-secret-key-for-test",
    mint: "MintOne",
    budget: budget(),
    now: () => new Date("2026-09-05T12:00:00.000Z"),
    cliEntry: "/app/node_modules/gmgn-cli/dist/index.js",
    nodeExecutable: "/usr/bin/node",
    environment: {
      PATH: "/usr/bin",
      HELIUS_API_KEY: "must-not-leak",
      GMGN_PRIVATE_KEY: "must-not-leak",
      TELEGRAM_BOT_TOKEN: "must-not-leak",
    },
    execFileImpl: async (file, args, options) => {
      invocation = { file, args, options };
      return { stdout: JSON.stringify(rawToken), stderr: "" };
    },
  });
  assert.equal(invocation.file, "/usr/bin/node");
  assert.deepEqual(invocation.args, [
    "/app/node_modules/gmgn-cli/dist/index.js",
    "token",
    "info",
    "--chain",
    "sol",
    "--address",
    "MintOne",
    "--raw",
  ]);
  assert.deepEqual(invocation.options.env, {
    GMGN_API_KEY: "gmgn-secret-key-for-test",
    PATH: "/usr/bin",
  });
  assert.equal(invocation.options.cwd.startsWith("/"), true);
  assert.equal(evidence.observation.market.priceUsd, 0.002);
  assert.equal(evidence.observation.behavior.smartMoneyParticipants, 5);
  assert.equal(evidence.observation.behavior.providerBundledTradingVolumeShare, 0.07);
  assert.equal(evidence.observation.sourceMethodVersion, "gmgn-token.info@cli-1.6.1");
});

test("uses GMGN as a timestamped price fallback", async () => {
  const result = await readGmgnPrice({
    apiKey: "gmgn-secret-key-for-test",
    mint: "MintOne",
    budget: budget(),
    now: () => new Date("2026-09-05T12:05:00.000Z"),
    cliEntry: "/app/gmgn.js",
    nodeExecutable: "/usr/bin/node",
    execFileImpl: async () => ({ stdout: JSON.stringify(rawToken), stderr: "" }),
  });
  assert.equal(result.provider, "gmgn");
  assert.equal(result.priceUsd, 0.002);
  assert.equal(result.observedAt, "2026-09-05T12:05:00.000Z");
});

test("backs off the GMGN budget on a classified rate limit", async () => {
  let backoff = null;
  await assert.rejects(
    readGmgnCandidateEvidence({
      apiKey: "gmgn-secret-key-for-test",
      mint: "MintOne",
      budget: {
        take: async () => ({ ok: true }),
        blockFor: async (milliseconds) => { backoff = milliseconds; },
      },
      cliEntry: "/app/gmgn.js",
      execFileImpl: async () => {
        const error = new Error("command failed");
        error.stderr = "HTTP 429 rate limit";
        throw error;
      },
    }),
    /rate limit reached/,
  );
  assert.equal(backoff, 15 * 60 * 1_000);
});

test("never echoes the GMGN credential on command failure", async () => {
  const secret = "gmgn-secret-key-for-test";
  await assert.rejects(
    readGmgnCandidateEvidence({
      apiKey: secret,
      mint: "MintOne",
      budget: budget(),
      cliEntry: "/app/gmgn.js",
      execFileImpl: async () => {
        const error = new Error(`request failed ${secret}`);
        error.stderr = secret;
        throw error;
      },
    }),
    (error) => {
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});
