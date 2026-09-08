import path from "node:path";

const FALSE_VALUES = new Set(["", "0", "false", "no", "off"]);
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function positiveInteger(value, field, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  if (!/^\d+$/.test(String(value).trim())) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new TypeError(`${field} must be between 1 and ${maximum}`);
  }
  return parsed;
}

function boundedInteger(value, field, fallback, minimum, maximum) {
  const parsed = positiveInteger(value, field, fallback, maximum);
  if (parsed < minimum) {
    throw new TypeError(`${field} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function optionalSecret(value) {
  return nonEmpty(value) ? value.trim() : null;
}

function planName(value, field, fallback, allowed) {
  const normalized = nonEmpty(value) ? value.trim().toLowerCase() : fallback;
  if (!allowed.has(normalized)) {
    throw new TypeError(`${field} must be one of: ${[...allowed].join(", ")}`);
  }
  return normalized;
}

function integerList(value, field, fallback) {
  const source = nonEmpty(value) ? value : fallback;
  const values = String(source).split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0 || values.length > 5) {
    throw new TypeError(`${field} must contain between one and five integers`);
  }
  const parsed = values.map((item) => {
    if (!/^\d+$/.test(item)) throw new TypeError(`${field} contains an invalid integer`);
    const number = Number(item);
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new TypeError(`${field} contains an invalid integer`);
    }
    return number;
  });
  return Object.freeze([...new Set(parsed)]);
}

function countryList(value, field, fallback = "us") {
  const source = nonEmpty(value) ? value : fallback;
  const values = String(source).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (values.length < 1 || values.length > 5 || values.some((item) => !/^[a-z]{2}$/.test(item))) {
    throw new TypeError(`${field} must contain between one and five ISO alpha-2 country codes`);
  }
  return Object.freeze([...new Set(values)]);
}

function httpsUrlList(value, field) {
  if (!nonEmpty(value)) return Object.freeze([]);
  const items = value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  if (items.length > 20) throw new TypeError(`${field} cannot exceed 20 URLs`);
  return Object.freeze(items.map((item) => {
    let url;
    try { url = new URL(item); } catch { throw new TypeError(`${field} contains an invalid URL`); }
    if (url.protocol !== "https:") throw new TypeError(`${field} requires HTTPS URLs`);
    return url.toString();
  }));
}

function enabled(value) {
  if (value === undefined || value === null) return false;
  return !FALSE_VALUES.has(String(value).trim().toLowerCase());
}

function booleanControl(value, field, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new TypeError(`${field} must be an explicit boolean value`);
}

function nonNegativeInteger(value, field, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  if (!/^\d+$/.test(String(value).trim())) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new TypeError(`${field} must be between 0 and ${maximum}`);
  }
  return parsed;
}

function durationList(value, field, fallback) {
  const source = nonEmpty(value) ? value : fallback;
  const values = String(source).split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length < 1 || values.length > 8) {
    throw new TypeError(`${field} must contain between one and eight durations`);
  }
  const parsed = values.map((item) => {
    if (!/^\d+$/.test(item)) throw new TypeError(`${field} contains an invalid duration`);
    const number = Number(item);
    if (!Number.isSafeInteger(number) || number < 10_000 || number > 86_400_000) {
      throw new TypeError(`${field} durations must be between 10000 and 86400000 ms`);
    }
    return number;
  });
  return Object.freeze([...new Set(parsed)].sort((left, right) => left - right));
}

export function parseObserverRuntime({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const mode = (env.TRADING_MODE ?? "observe").trim().toLowerCase();
  if (mode !== "observe") {
    throw new Error("TRADING_MODE must be observe; paper and live execution are not implemented");
  }
  if (enabled(env.LIVE_TRADING_ENABLED)) {
    throw new Error("LIVE_TRADING_ENABLED must remain false; this worker has no trading authority");
  }

  if (!nonEmpty(env.HELIUS_API_KEY) || !nonEmpty(env.JUPITER_API_KEY)) {
    throw new Error("HELIUS_API_KEY and JUPITER_API_KEY are required");
  }

  const notify = argv.includes("--notify") || booleanControl(env.NOTIFY_ENABLED, "NOTIFY_ENABLED");
  const includeSwapsRequested =
    argv.includes("--include-swaps") ||
    booleanControl(env.INCLUDE_SWAPS, "INCLUDE_SWAPS");
  if (includeSwapsRequested) {
    throw new Error(
      "swap observation is not implemented for the full Pump and PumpSwap lifecycle",
    );
  }
  const hasTelegramToken = nonEmpty(env.TELEGRAM_BOT_TOKEN);
  const hasTelegramChat = nonEmpty(env.TELEGRAM_ALLOWED_CHAT_ID);
  const narrativeRadarEnabled = booleanControl(
    env.NARRATIVE_RADAR_ENABLED,
    "NARRATIVE_RADAR_ENABLED",
  );
  const genericOpportunityAlertsEnabled = booleanControl(
    env.GENERIC_OPPORTUNITY_ALERTS_ENABLED,
    "GENERIC_OPPORTUNITY_ALERTS_ENABLED",
    false,
  );
  const xBearerToken = optionalSecret(env.X_BEARER_TOKEN);
  const lunarCrushApiKey = optionalSecret(env.LUNARCRUSH_API_KEY);
  const newsApiKey = optionalSecret(env.NEWSAPI_KEY);
  const birdeyeApiKey = optionalSecret(env.BIRDEYE_API_KEY);
  const gmgnApiKey = optionalSecret(env.GMGN_API_KEY);
  const solscanApiKey = optionalSecret(env.SOLSCAN_API_KEY);
  const lunarCrushPlan = planName(
    env.LUNARCRUSH_PLAN,
    "LUNARCRUSH_PLAN",
    "hobby",
    new Set(["hobby", "individual", "builder", "scale", "enterprise"]),
  );
  const newsApiPlan = planName(
    env.NEWSAPI_PLAN,
    "NEWSAPI_PLAN",
    "developer",
    new Set(["developer", "business", "advanced"]),
  );
  const nodeEnvironment = (env.NODE_ENV ?? "development").trim().toLowerCase();
  const lunarCrushTopicsEnabled = Boolean(
    lunarCrushApiKey && lunarCrushPlan !== "hobby",
  );
  const newsApiDiscoveryEnabled = Boolean(
    newsApiKey && (nodeEnvironment !== "production" || newsApiPlan !== "developer"),
  );
  if (nonEmpty(env.GMGN_PRIVATE_KEY)) {
    throw new Error("GMGN_PRIVATE_KEY must not be configured in the observe-only worker");
  }
  for (const forbidden of [
    "AGE_SECRET_KEY",
    "WALLET_PRIVATE_KEY",
    "AXIOM_API_KEY",
    "PHOTON_API_KEY",
  ]) {
    if (nonEmpty(env[forbidden])) {
      throw new Error(`${forbidden} must not be configured in this worker`);
    }
  }
  const narrativeRssFeeds = httpsUrlList(
    env.NARRATIVE_RSS_FEEDS,
    "NARRATIVE_RSS_FEEDS",
  );

  if (nonEmpty(env.NTFY_TOPIC)) {
    throw new Error("NTFY_TOPIC is not supported by the deployable observation worker");
  }
  if (hasTelegramToken !== hasTelegramChat) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_CHAT_ID must be configured together");
  }
  if (notify && !hasTelegramToken) {
    throw new Error("notifications are enabled but no complete Telegram Bot channel is configured");
  }
  if (
    narrativeRadarEnabled &&
    !xBearerToken &&
    !lunarCrushTopicsEnabled &&
    !newsApiDiscoveryEnabled &&
    narrativeRssFeeds.length === 0
  ) {
    throw new Error(
      "NARRATIVE_RADAR_ENABLED requires X, a social-enabled LunarCrush plan, production-eligible NewsAPI, or approved RSS feeds",
    );
  }

  const observationLogPath = path.resolve(
    cwd,
    nonEmpty(env.OBSERVATION_LOG_PATH)
      ? env.OBSERVATION_LOG_PATH.trim()
      : "data/observations.jsonl",
  );
  const stateDirectory = path.dirname(observationLogPath);
  const birdeyeDailyRequestLimit = positiveInteger(
    env.BIRDEYE_DAILY_REQUEST_LIMIT,
    "BIRDEYE_DAILY_REQUEST_LIMIT",
    100,
    1_000_000,
  );
  const birdeyeDailyRequestReserve = nonNegativeInteger(
    env.BIRDEYE_DAILY_REQUEST_RESERVE,
    "BIRDEYE_DAILY_REQUEST_RESERVE",
    10,
    999_999,
  );
  const gmgnDailyRequestLimit = positiveInteger(
    env.GMGN_DAILY_REQUEST_LIMIT,
    "GMGN_DAILY_REQUEST_LIMIT",
    50,
    1_000_000,
  );
  const gmgnDailyRequestReserve = nonNegativeInteger(
    env.GMGN_DAILY_REQUEST_RESERVE,
    "GMGN_DAILY_REQUEST_RESERVE",
    5,
    999_999,
  );
  const solscanDailyRequestLimit = positiveInteger(
    env.SOLSCAN_DAILY_REQUEST_LIMIT,
    "SOLSCAN_DAILY_REQUEST_LIMIT",
    250,
    1_000_000,
  );
  const solscanDailyRequestReserve = nonNegativeInteger(
    env.SOLSCAN_DAILY_REQUEST_RESERVE,
    "SOLSCAN_DAILY_REQUEST_RESERVE",
    25,
    999_999,
  );
  if (birdeyeDailyRequestReserve >= birdeyeDailyRequestLimit) {
    throw new TypeError("BIRDEYE_DAILY_REQUEST_RESERVE must be smaller than its limit");
  }
  if (gmgnDailyRequestReserve >= gmgnDailyRequestLimit) {
    throw new TypeError("GMGN_DAILY_REQUEST_RESERVE must be smaller than its limit");
  }
  if (solscanDailyRequestReserve >= solscanDailyRequestLimit) {
    throw new TypeError("SOLSCAN_DAILY_REQUEST_RESERVE must be smaller than its limit");
  }
  const lunarCrushDailyRequestLimit = positiveInteger(
    env.LUNARCRUSH_DAILY_REQUEST_LIMIT,
    "LUNARCRUSH_DAILY_REQUEST_LIMIT",
    100,
    1_000_000,
  );
  const lunarCrushDailyRequestReserve = nonNegativeInteger(
    env.LUNARCRUSH_DAILY_REQUEST_RESERVE,
    "LUNARCRUSH_DAILY_REQUEST_RESERVE",
    10,
    999_999,
  );
  const newsApiDailyRequestLimit = positiveInteger(
    env.NEWSAPI_DAILY_REQUEST_LIMIT,
    "NEWSAPI_DAILY_REQUEST_LIMIT",
    100,
    1_000_000,
  );
  const newsApiDailyRequestReserve = nonNegativeInteger(
    env.NEWSAPI_DAILY_REQUEST_RESERVE,
    "NEWSAPI_DAILY_REQUEST_RESERVE",
    10,
    999_999,
  );
  if (lunarCrushDailyRequestReserve >= lunarCrushDailyRequestLimit) {
    throw new TypeError("LUNARCRUSH_DAILY_REQUEST_RESERVE must be smaller than its limit");
  }
  if (newsApiDailyRequestReserve >= newsApiDailyRequestLimit) {
    throw new TypeError("NEWSAPI_DAILY_REQUEST_RESERVE must be smaller than its limit");
  }
  const hasCandidateProviders = Boolean(birdeyeApiKey || gmgnApiKey || solscanApiKey);
  const deskScoutEnabled = booleanControl(
    env.DESK_SCOUT_ENABLED,
    "DESK_SCOUT_ENABLED",
    Boolean(narrativeRadarEnabled && gmgnApiKey),
  );
  if (deskScoutEnabled && !narrativeRadarEnabled) {
    throw new Error("DESK_SCOUT_ENABLED requires NARRATIVE_RADAR_ENABLED");
  }
  if (deskScoutEnabled && !gmgnApiKey) {
    throw new Error("DESK_SCOUT_ENABLED requires GMGN_API_KEY for the locked desk fields");
  }
  const narrativeOutcomeTrackingEnabled = booleanControl(
    env.NARRATIVE_OUTCOME_TRACKING_ENABLED,
    "NARRATIVE_OUTCOME_TRACKING_ENABLED",
    hasCandidateProviders,
  );
  if (narrativeOutcomeTrackingEnabled && !hasCandidateProviders) {
    throw new Error(
      "NARRATIVE_OUTCOME_TRACKING_ENABLED requires BIRDEYE_API_KEY, GMGN_API_KEY, or SOLSCAN_API_KEY",
    );
  }

  return Object.freeze({
    mode,
    notify,
    includeSwaps: false,
    heliusApiKey: env.HELIUS_API_KEY.trim(),
    jupiterApiKey: env.JUPITER_API_KEY.trim(),
    notificationChannel: hasTelegramToken ? "telegram_bot" : null,
    telegramBotToken: hasTelegramToken ? env.TELEGRAM_BOT_TOKEN.trim() : null,
    telegramChatId: hasTelegramChat ? env.TELEGRAM_ALLOWED_CHAT_ID.trim() : null,
    narrativeRadarEnabled,
    genericOpportunityAlertsEnabled,
    xBearerToken,
    lunarCrushApiKey,
    lunarCrushPlan,
    lunarCrushTopicsEnabled,
    newsApiKey,
    newsApiPlan,
    newsApiDiscoveryEnabled,
    birdeyeApiKey,
    gmgnApiKey,
    solscanApiKey,
    deskScoutEnabled,
    theLawyerStatePath: path.join(stateDirectory, "the-lawyer.v1.json"),
    candidateProviderTimeoutMs: boundedInteger(
      env.CANDIDATE_PROVIDER_TIMEOUT_MS,
      "CANDIDATE_PROVIDER_TIMEOUT_MS",
      6_000,
      1_000,
      15_000,
    ),
    birdeyeDailyRequestLimit,
    birdeyeDailyRequestReserve,
    birdeyeBudgetStatePath: path.join(stateDirectory, "birdeye-budget.v1.json"),
    gmgnDailyRequestLimit,
    gmgnDailyRequestReserve,
    gmgnBudgetStatePath: path.join(stateDirectory, "gmgn-budget.v1.json"),
    solscanDailyRequestLimit,
    solscanDailyRequestReserve,
    solscanBudgetStatePath: path.join(stateDirectory, "solscan-budget.v1.json"),
    narrativeOutcomeTrackingEnabled,
    narrativeOutcomeNotificationsEnabled: booleanControl(
      env.NARRATIVE_OUTCOME_NOTIFICATIONS_ENABLED,
      "NARRATIVE_OUTCOME_NOTIFICATIONS_ENABLED",
      true,
    ),
    narrativeOutcomeCheckpointsMs: durationList(
      env.NARRATIVE_OUTCOME_CHECKPOINTS_MS,
      "NARRATIVE_OUTCOME_CHECKPOINTS_MS",
      "60000,300000,900000,3600000",
    ),
    narrativeOutcomeStatePath: path.join(
      stateDirectory,
      "narrative-outcomes.v1.json",
    ),
    narrativeNewsCountries: countryList(
      env.NARRATIVE_NEWS_COUNTRIES,
      "NARRATIVE_NEWS_COUNTRIES",
    ),
    narrativeRssFeeds,
    lunarCrushDailyRequestLimit,
    lunarCrushDailyRequestReserve,
    lunarCrushBudgetStatePath: path.join(
      stateDirectory,
      "lunarcrush-budget.v1.json",
    ),
    newsApiDailyRequestLimit,
    newsApiDailyRequestReserve,
    newsApiBudgetStatePath: path.join(stateDirectory, "newsapi-budget.v1.json"),
    narrativeXWoeids: integerList(env.NARRATIVE_X_WOEIDS, "NARRATIVE_X_WOEIDS", "1"),
    narrativeXRecentSearchEnabled: booleanControl(
      env.NARRATIVE_X_RECENT_SEARCH_ENABLED,
      "NARRATIVE_X_RECENT_SEARCH_ENABLED",
    ),
    narrativeGdeltEnabled: booleanControl(
      env.NARRATIVE_GDELT_ENABLED,
      "NARRATIVE_GDELT_ENABLED",
    ),
    narrativePollIntervalMs: boundedInteger(
      env.NARRATIVE_POLL_INTERVAL_MS,
      "NARRATIVE_POLL_INTERVAL_MS",
      1_200_000,
      30_000,
      3_600_000,
    ),
    narrativeAlertMinimumPriority: boundedInteger(
      env.NARRATIVE_ALERT_MIN_PRIORITY,
      "NARRATIVE_ALERT_MIN_PRIORITY",
      70,
      1,
      100,
    ),
    narrativeMaximumConfirmationTerms: boundedInteger(
      env.NARRATIVE_CONFIRMATION_MAX_TERMS,
      "NARRATIVE_CONFIRMATION_MAX_TERMS",
      3,
      1,
      10,
    ),
    port: positiveInteger(env.PORT, "PORT", 3000, 65_535),
    observationLogPath,
    eventConcurrency: positiveInteger(env.OBSERVER_CONCURRENCY, "OBSERVER_CONCURRENCY", 4, 64),
    maximumQueuedEvents: positiveInteger(env.OBSERVER_MAX_QUEUE, "OBSERVER_MAX_QUEUE", 250, 100_000),
    maximumEventAgeMs: positiveInteger(
      env.OBSERVER_MAX_EVENT_AGE_MS,
      "OBSERVER_MAX_EVENT_AGE_MS",
      30_000,
      300_000,
    ),
    dedupeTtlMs: positiveInteger(env.OBSERVER_DEDUPE_TTL_MS, "OBSERVER_DEDUPE_TTL_MS", 3_600_000),
    maximumDedupeEntries: positiveInteger(env.OBSERVER_MAX_DEDUPE, "OBSERVER_MAX_DEDUPE", 50_000, 1_000_000),
  });
}

export const observerRuntimeConstants = Object.freeze({
  tradingMode: "observe",
  defaultPort: 3000,
  defaultObservationLogPath: "data/observations.jsonl",
  defaultMaximumEventAgeMs: 30_000,
  defaultNarrativePollIntervalMs: 1_200_000,
  defaultNarrativeAlertMinimumPriority: 70,
});
