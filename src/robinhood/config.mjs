function numberEnv(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`);
  }
  return value;
}

export function parseRobinhoodWatcherConfig(env = process.env) {
  const enabled = env.ROBINHOOD_WATCHER_ENABLED === "true";
  if (!enabled) throw new Error("ROBINHOOD_WATCHER_ENABLED must equal true");

  const rpcUrl = env.ROBINHOOD_RPC_URL?.trim();
  const telegramToken = env.ROBINHOOD_TELEGRAM_BOT_TOKEN?.trim();
  const telegramChatId = env.ROBINHOOD_TELEGRAM_CHAT_ID?.trim();
  if (!rpcUrl) throw new Error("ROBINHOOD_RPC_URL is required");
  if (!telegramToken || !telegramChatId) {
    throw new Error("ROBINHOOD_TELEGRAM_BOT_TOKEN and ROBINHOOD_TELEGRAM_CHAT_ID are required");
  }

  return Object.freeze({
    enabled,
    rpcUrl,
    telegramToken,
    telegramChatId,
    pollMs: numberEnv(env, "ROBINHOOD_POLL_MS", 5_000, { min: 1_000, max: 30_000 }),
    enrichmentMs: numberEnv(env, "ROBINHOOD_ENRICHMENT_MS", 15_000, { min: 5_000, max: 60_000 }),
    maxAgeMs: numberEnv(env, "ROBINHOOD_MAX_TOKEN_AGE_MS", 1_800_000, { min: 60_000, max: 1_800_000 }),
    minScoutLiquidityUsd: numberEnv(env, "ROBINHOOD_SCOUT_MIN_LIQUIDITY_USD", 25_000),
    minStrongLiquidityUsd: numberEnv(env, "ROBINHOOD_STRONG_MIN_LIQUIDITY_USD", 75_000),
    minScoutFiveMinuteVolumeUsd: numberEnv(env, "ROBINHOOD_SCOUT_MIN_5M_VOLUME_USD", 25_000),
    minStrongFiveMinuteVolumeUsd: numberEnv(env, "ROBINHOOD_STRONG_MIN_5M_VOLUME_USD", 75_000),
    minScoutUniqueBuyers: numberEnv(env, "ROBINHOOD_SCOUT_MIN_UNIQUE_BUYERS", 40),
    minStrongUniqueBuyers: numberEnv(env, "ROBINHOOD_STRONG_MIN_UNIQUE_BUYERS", 100),
    minBuyVolumeRatio: numberEnv(env, "ROBINHOOD_MIN_BUY_VOLUME_RATIO", 0.55, { min: 0.5, max: 1 }),
    maxTopTenPct: numberEnv(env, "ROBINHOOD_MAX_TOP10_PCT", 30, { min: 1, max: 100 }),
    maxFiveMinuteGainPct: numberEnv(env, "ROBINHOOD_MAX_5M_GAIN_PCT", 175, { min: 1, max: 1000 }),
    statePath: env.ROBINHOOD_STATE_PATH?.trim() || "/var/lib/robinhood-watcher/state.json",
    healthPort: numberEnv(env, "ROBINHOOD_HEALTH_PORT", 3100, { min: 1, max: 65535 }),
    startLookbackBlocks: numberEnv(env, "ROBINHOOD_START_LOOKBACK_BLOCKS", 50, { min: 1, max: 5_000 }),
  });
}

