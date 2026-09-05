import test from "node:test";
import assert from "node:assert/strict";

import { parseRobinhoodWatcherConfig } from "../src/robinhood/config.mjs";
import { evaluateEarlyMomentum } from "../src/robinhood/decision.mjs";
import { parsePonsLaunchLog } from "../src/robinhood/discovery.mjs";
import { PONS, TOPICS, ZERO_ADDRESS } from "../src/robinhood/constants.mjs";

const addressTopic = (address) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
const addressWord = (address) => `${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
const uintWord = (value) => BigInt(value).toString(16).padStart(64, "0");

test("configuration fails closed without explicit enablement", () => {
  assert.throws(() => parseRobinhoodWatcherConfig({}), /ROBINHOOD_WATCHER_ENABLED/);
});

test("configuration never permits an age window over thirty minutes", () => {
  assert.throws(() => parseRobinhoodWatcherConfig({
    ROBINHOOD_WATCHER_ENABLED: "true",
    ROBINHOOD_RPC_URL: "https://example.test",
    ROBINHOOD_TELEGRAM_BOT_TOKEN: "token",
    ROBINHOOD_TELEGRAM_CHAT_ID: "1",
    ROBINHOOD_MAX_TOKEN_AGE_MS: "1800001",
  }), /ROBINHOOD_MAX_TOKEN_AGE_MS/);
});

test("Pons V2 launch parser binds token, curve, deployer and quote", () => {
  const token = "0x1111111111111111111111111111111111111111";
  const curve = "0x2222222222222222222222222222222222222222";
  const deployer = "0x3333333333333333333333333333333333333333";
  const log = {
    address: PONS.v2Factory,
    topics: [TOPICS.ponsV2TokenLaunched, addressTopic(token), addressTopic(curve), addressTopic(deployer)],
    data: `0x${addressWord(ZERO_ADDRESS)}${uintWord(2)}${uintWord(42)}`,
    blockNumber: "0x64",
    transactionHash: "0xlaunch",
  };
  assert.deepEqual(parsePonsLaunchLog(log, 123_000), {
    token,
    curve,
    deployer,
    quoteToken: ZERO_ADDRESS,
    graduationThreshold: "42",
    launchedAtMs: 123_000,
    launchBlock: 100,
    launchTx: "0xlaunch",
    protocol: "pons_v2",
    factoryProven: true,
  });
});

function fixture(overrides = {}) {
  return {
    candidate: { launchedAtMs: 1_000_000, factoryProven: true, protocol: "pons_v2" },
    pair: {
      liquidityUsd: 100_000,
      volume: { m5: 100_000 },
      priceChange: { m5: 20 },
      txns: { m5: { buys: 120, sells: 40 } },
    },
    curve: { uniqueBuyers: 125, buyQuote: "800", sellQuote: "200" },
    security: { isProxy: false, topTenPct: 20 },
    previousPair: { volume: { m5: 80_000 } },
    nowMs: 1_600_000,
    config: {
      maxAgeMs: 1_800_000,
      minStrongLiquidityUsd: 75_000,
      minStrongFiveMinuteVolumeUsd: 75_000,
      minStrongUniqueBuyers: 100,
      minScoutLiquidityUsd: 25_000,
      minScoutFiveMinuteVolumeUsd: 25_000,
      minScoutUniqueBuyers: 40,
      minBuyVolumeRatio: 0.55,
      maxTopTenPct: 30,
      maxFiveMinuteGainPct: 175,
    },
    ...overrides,
  };
}

test("qualifying early flow is strong momentum", () => {
  assert.equal(evaluateEarlyMomentum(fixture()).verdict, "STRONG_MOMENTUM");
});

test("token older than thirty minutes is always ignored", () => {
  assert.equal(evaluateEarlyMomentum(fixture({ nowMs: 2_800_001 })).verdict, "IGNORE");
});

test("vertical five-minute candle is not chased", () => {
  const input = fixture();
  input.pair.priceChange.m5 = 250;
  assert.equal(evaluateEarlyMomentum(input).verdict, "WAIT");
});

test("unsafe concentration rejects an otherwise qualifying token", () => {
  const input = fixture();
  input.security.topTenPct = 45;
  assert.equal(evaluateEarlyMomentum(input).verdict, "REJECT");
});

