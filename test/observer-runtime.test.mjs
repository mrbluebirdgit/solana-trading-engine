import assert from "node:assert/strict";
import test from "node:test";

import { parseObserverRuntime } from "../src/config/observer-runtime.mjs";

const required = {
  HELIUS_API_KEY: "helius-test",
  JUPITER_API_KEY: "jupiter-test",
  TRADING_MODE: "observe",
  LIVE_TRADING_ENABLED: "false",
};

test("parses a live-locked observe-only runtime", () => {
  const result = parseObserverRuntime({ env: required, argv: [], cwd: "/tmp/project" });
  assert.equal(result.mode, "observe");
  assert.equal(result.notify, false);
  assert.equal(result.port, 3000);
  assert.equal(result.maximumEventAgeMs, 30_000);
  assert.equal(result.observationLogPath, "/tmp/project/data/observations.jsonl");
  assert.equal(result.narrativeRadarEnabled, false);
  assert.equal(result.genericOpportunityAlertsEnabled, true);
  assert.equal(result.narrativeAlertMinimumPriority, 70);
  assert.equal(result.narrativePollIntervalMs, 1_200_000);
  assert.equal(result.birdeyeDailyRequestLimit, 100);
  assert.equal(result.gmgnDailyRequestLimit, 50);
  assert.equal(result.narrativeOutcomeTrackingEnabled, false);
  assert.equal(result.lunarCrushDailyRequestLimit, 100);
  assert.equal(result.lunarCrushDailyRequestReserve, 10);
  assert.equal(result.newsApiDailyRequestLimit, 100);
  assert.equal(result.newsApiDailyRequestReserve, 10);
  assert.deepEqual(result.narrativeNewsCountries, ["us"]);
});

test("enables bounded candidate enrichment and persisted outcome tracking from read-only keys", () => {
  const parsed = parseObserverRuntime({
    env: {
      ...required,
      BIRDEYE_API_KEY: "birdeye-read-only-key",
      GMGN_API_KEY: "gmgn-read-only-key",
      BIRDEYE_DAILY_REQUEST_LIMIT: "20",
      BIRDEYE_DAILY_REQUEST_RESERVE: "2",
      GMGN_DAILY_REQUEST_LIMIT: "10",
      GMGN_DAILY_REQUEST_RESERVE: "1",
    },
    cwd: "/var/lib/solana-observer",
  });
  assert.equal(parsed.birdeyeApiKey, "birdeye-read-only-key");
  assert.equal(parsed.gmgnApiKey, "gmgn-read-only-key");
  assert.equal(parsed.narrativeOutcomeTrackingEnabled, true);
  assert.deepEqual(parsed.narrativeOutcomeCheckpointsMs, [
    60_000,
    300_000,
    900_000,
    3_600_000,
  ]);
  assert.equal(
    parsed.birdeyeBudgetStatePath,
    "/var/lib/solana-observer/data/birdeye-budget.v1.json",
  );
  assert.equal(parsed.birdeyeDailyRequestLimit, 20);
  assert.equal(parsed.birdeyeDailyRequestReserve, 2);
});

test("rejects signing material and unsafe supplemental-provider budgets", () => {
  assert.throws(
    () => parseObserverRuntime({
      env: { ...required, GMGN_PRIVATE_KEY: "never-accept-this" },
    }),
    /must not be configured/,
  );
  assert.throws(
    () => parseObserverRuntime({
      env: {
        ...required,
        BIRDEYE_API_KEY: "birdeye-read-only-key",
        BIRDEYE_DAILY_REQUEST_LIMIT: "10",
        BIRDEYE_DAILY_REQUEST_RESERVE: "10",
      },
    }),
    /must be smaller than its limit/,
  );
  assert.throws(
    () => parseObserverRuntime({
      env: { ...required, NARRATIVE_OUTCOME_TRACKING_ENABLED: "true" },
    }),
    /requires BIRDEYE_API_KEY or GMGN_API_KEY/,
  );
  assert.throws(
    () => parseObserverRuntime({
      env: {
        ...required,
        LUNARCRUSH_DAILY_REQUEST_LIMIT: "10",
        LUNARCRUSH_DAILY_REQUEST_RESERVE: "10",
      },
    }),
    /LUNARCRUSH_DAILY_REQUEST_RESERVE must be smaller/,
  );
  assert.throws(
    () => parseObserverRuntime({
      env: {
        ...required,
        NEWSAPI_DAILY_REQUEST_LIMIT: "10",
        NEWSAPI_DAILY_REQUEST_RESERVE: "10",
      },
    }),
    /NEWSAPI_DAILY_REQUEST_RESERVE must be smaller/,
  );
});

test("enables narrative discovery only with an explicitly configured source", () => {
  const parsed = parseObserverRuntime({
    env: {
      ...required,
      NARRATIVE_RADAR_ENABLED: "true",
      X_BEARER_TOKEN: "x-token",
      NARRATIVE_X_WOEIDS: "1,23424977",
      NARRATIVE_X_RECENT_SEARCH_ENABLED: "false",
      NARRATIVE_GDELT_ENABLED: "true",
      NARRATIVE_ALERT_MIN_PRIORITY: "75",
      NARRATIVE_NEWS_COUNTRIES: "us,gb",
    },
  });
  assert.equal(parsed.narrativeRadarEnabled, true);
  assert.equal(parsed.genericOpportunityAlertsEnabled, false);
  assert.deepEqual(parsed.narrativeXWoeids, [1, 23424977]);
  assert.equal(parsed.narrativeGdeltEnabled, true);
  assert.equal(parsed.narrativeAlertMinimumPriority, 75);
  assert.deepEqual(parsed.narrativeNewsCountries, ["us", "gb"]);
  assert.throws(
    () => parseObserverRuntime({
      env: { ...required, NARRATIVE_RADAR_ENABLED: "true" },
    }),
    /requires X, LunarCrush, NewsAPI, or approved RSS/,
  );
});

test("allows generic opportunity alerts to be opted in independently", () => {
  const parsed = parseObserverRuntime({
    env: {
      ...required,
      NARRATIVE_RADAR_ENABLED: "true",
      NEWSAPI_KEY: "news-key",
      GENERIC_OPPORTUNITY_ALERTS_ENABLED: "true",
    },
  });
  assert.equal(parsed.genericOpportunityAlertsEnabled, true);
});

test("rejects unsafe narrative runtime controls", () => {
  assert.throws(
    () => parseObserverRuntime({
      env: {
        ...required,
        NARRATIVE_RADAR_ENABLED: "true",
        X_BEARER_TOKEN: "x-token",
        NARRATIVE_POLL_INTERVAL_MS: "1000",
      },
    }),
    /between 30000 and 3600000/,
  );
  assert.throws(
    () => parseObserverRuntime({
      env: {
        ...required,
        NARRATIVE_RADAR_ENABLED: "true",
        NARRATIVE_RSS_FEEDS: "http://insecure.example/feed",
      },
    }),
    /HTTPS/,
  );
});

test("validates the real-time trigger age bound", () => {
  assert.equal(
    parseObserverRuntime({
      env: { ...required, OBSERVER_MAX_EVENT_AGE_MS: "45000" },
    }).maximumEventAgeMs,
    45_000,
  );
  assert.throws(
    () => parseObserverRuntime({
      env: { ...required, OBSERVER_MAX_EVENT_AGE_MS: "300001" },
    }),
    /between 1 and 300000/,
  );
});

test("refuses every non-observe mode and truthy live flag", () => {
  assert.throws(
    () => parseObserverRuntime({ env: { ...required, TRADING_MODE: "paper" } }),
    /must be observe/,
  );
  assert.throws(
    () => parseObserverRuntime({ env: { ...required, LIVE_TRADING_ENABLED: "true" } }),
    /must remain false/,
  );
});

test("fails closed when Telegram Bot configuration is absent or partial", () => {
  assert.throws(
    () => parseObserverRuntime({ env: required, argv: ["--notify"] }),
    /no complete/,
  );
  assert.throws(
    () => parseObserverRuntime({ env: { ...required, TELEGRAM_BOT_TOKEN: "token" }, argv: [] }),
    /configured together/,
  );
});

test("rejects unauthenticated public ntfy topics in the deployable worker", () => {
  assert.throws(
    () => parseObserverRuntime({
      env: { ...required, NTFY_TOPIC: "topic" },
      argv: ["--notify"],
    }),
    /not supported/,
  );
});

test("accepts one explicit notification channel", () => {
  const telegram = parseObserverRuntime({
    env: { ...required, TELEGRAM_BOT_TOKEN: "token", TELEGRAM_ALLOWED_CHAT_ID: "123" },
    argv: ["--notify"],
  });
  assert.equal(telegram.notificationChannel, "telegram_bot");
  assert.equal(telegram.notify, true);
});

test("rejects ambiguous boolean controls", () => {
  assert.throws(
    () => parseObserverRuntime({ env: { ...required, INCLUDE_SWAPS: "maybe" } }),
    /explicit boolean/,
  );
});

test("rejects partial swap coverage instead of implying PumpSwap support", () => {
  assert.throws(
    () => parseObserverRuntime({ env: { ...required, INCLUDE_SWAPS: "true" } }),
    /not implemented for the full Pump and PumpSwap lifecycle/,
  );
  assert.throws(
    () => parseObserverRuntime({ env: required, argv: ["--include-swaps"] }),
    /not implemented for the full Pump and PumpSwap lifecycle/,
  );
});
