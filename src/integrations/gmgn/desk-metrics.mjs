const METHOD_VERSION = "gmgn-desk-metrics.v1";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function atPath(source, path) {
  let value = source;
  for (const key of path.split(".")) value = value?.[key];
  return value;
}

function present(value) {
  return value !== undefined && value !== null && value !== "";
}

function pick(source, paths) {
  for (const path of paths) {
    const value = atPath(source, path);
    if (present(value)) return { value, path };
  }
  return { value: null, path: null };
}

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeGmgnDeskMetrics(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("GMGN desk metrics payload must be an object");
  }

  const metrics = {};
  const sourceFields = {};
  const missingFields = [];
  const invalidFields = [];
  const topLevelHolderCount = finiteNumber(payload.holder_count);
  const statHolderCount = finiteNumber(payload.stat?.holder_count);
  const statPopulationFields = [
    "stat.creator_hold_rate",
    "stat.top_bundler_trader_percentage",
    "stat.top70_sniper_hold_rate",
    "stat.top_rat_trader_percentage",
    "stat.top_entrapment_trader_percentage",
    "stat.bot_degen_rate",
    "stat.fresh_wallet_rate",
    "stat.private_vault_hold_rate",
    "stat.creator_created_count",
    "stat.top_10_holder_rate",
  ];
  const statHolderContradiction =
    Number.isFinite(topLevelHolderCount) &&
    topLevelHolderCount > 0 &&
    (!Number.isFinite(statHolderCount) || statHolderCount === 0);
  const statAnalysisAllZeroOrMissing = statPopulationFields.every((path) => {
    const parsed = finiteNumber(atPath(payload, path));
    return parsed === null || parsed === 0;
  });
  const statBlockPopulated = !statHolderContradiction && !statAnalysisAllZeroOrMissing;
  const statBlockReason = statHolderContradiction
    ? "stat_holder_count_contradicts_top_level"
    : statAnalysisAllZeroOrMissing
      ? "all_analysis_fields_zero_or_missing"
      : null;

  function missing(name) {
    metrics[name] = null;
    missingFields.push(name);
  }

  function invalid(name, path, raw, expected) {
    metrics[name] = null;
    sourceFields[name] = path;
    invalidFields.push({ field: name, sourceField: path, raw, expected });
  }

  function percent(name, paths, { requiresPopulatedStat = false } = {}) {
    if (requiresPopulatedStat && !statBlockPopulated) {
      return invalid(name, "stat", null, `populated_stat_block:${statBlockReason}`);
    }
    const selected = pick(payload, paths);
    if (!selected.path) return missing(name);
    const parsed = finiteNumber(selected.value);
    if (parsed === null || parsed < 0 || parsed > 1) {
      return invalid(name, selected.path, selected.value, "fraction_between_0_and_1");
    }
    metrics[name] = parsed * 100;
    sourceFields[name] = selected.path;
  }

  function nonNegative(name, paths) {
    const selected = pick(payload, paths);
    if (!selected.path) return missing(name);
    const parsed = finiteNumber(selected.value);
    if (parsed === null || parsed < 0) {
      return invalid(name, selected.path, selected.value, "non_negative_number");
    }
    metrics[name] = parsed;
    sourceFields[name] = selected.path;
  }

  function count(name, paths) {
    const selected = pick(payload, paths);
    if (!selected.path) return missing(name);
    const parsed = finiteNumber(selected.value);
    if (parsed === null || !Number.isSafeInteger(parsed) || parsed < 0) {
      return invalid(name, selected.path, selected.value, "non_negative_integer");
    }
    metrics[name] = parsed;
    sourceFields[name] = selected.path;
  }

  function unix(name, paths) {
    const selected = pick(payload, paths);
    if (!selected.path) return missing(name);
    const parsed = finiteNumber(selected.value);
    if (parsed === null || !Number.isSafeInteger(parsed) || parsed <= 0) {
      return invalid(name, selected.path, selected.value, "positive_unix_seconds");
    }
    metrics[name] = parsed;
    sourceFields[name] = selected.path;
  }

  percent("developerPercent", ["stat.creator_hold_rate"], { requiresPopulatedStat: true });
  percent("insiderPercent", [
    "suspected_insider_hold_rate",
    "stat.suspected_insider_hold_rate",
  ]);
  percent("bundledPercent", ["stat.top_bundler_trader_percentage"], {
    requiresPopulatedStat: true,
  });
  percent("freshPercent", ["stat.fresh_wallet_rate"], { requiresPopulatedStat: true });
  percent("snipersPercent", ["stat.top70_sniper_hold_rate"], {
    requiresPopulatedStat: true,
  });
  percent("rugPercent", ["rug_ratio"]);
  percent("phishingPercent", ["stat.top_entrapment_trader_percentage"], {
    requiresPopulatedStat: true,
  });
  percent("botTradingPercent", [
    "stat.top_bot_degen_percentage",
    "stat.bot_degen_rate",
  ], { requiresPopulatedStat: true });
  percent("top10Percent", ["stat.top_10_holder_rate"], { requiresPopulatedStat: true });
  percent("curveFillPercent", ["launchpad_progress"]);

  count("smartMoneyCount", ["wallet_tags_stat.smart_wallets"]);
  count("holderCount", ["holder_count", "stat.holder_count"]);
  nonNegative("marketCapUsd", ["market_cap"]);
  nonNegative("volume5mUsd", ["price.volume_5m"]);

  const buys = pick(payload, ["price.buy_volume_5m"]);
  const sells = pick(payload, ["price.sell_volume_5m"]);
  const buyValue = finiteNumber(buys.value);
  const sellValue = finiteNumber(sells.value);
  if (!buys.path || !sells.path) {
    missing("netInflow5mUsd");
  } else if (buyValue === null || sellValue === null || buyValue < 0 || sellValue < 0) {
    invalid(
      "netInflow5mUsd",
      `${buys.path}+${sells.path}`,
      [buys.value, sells.value],
      "two_non_negative_numbers",
    );
  } else {
    metrics.netInflow5mUsd = buyValue - sellValue;
    sourceFields.netInflow5mUsd = `${buys.path}-${sells.path}`;
  }

  const swaps = pick(payload, ["price.swaps_5m", "swaps_5m"]);
  if (swaps.path) {
    const parsed = finiteNumber(swaps.value);
    if (parsed === null || !Number.isSafeInteger(parsed) || parsed < 0) {
      invalid("transactions5m", swaps.path, swaps.value, "non_negative_integer");
    } else {
      metrics.transactions5m = parsed;
      sourceFields.transactions5m = swaps.path;
    }
  } else {
    const buyCount = pick(payload, ["price.buys_5m", "buys_5m"]);
    const sellCount = pick(payload, ["price.sells_5m", "sells_5m"]);
    const parsedBuys = finiteNumber(buyCount.value);
    const parsedSells = finiteNumber(sellCount.value);
    if (!buyCount.path || !sellCount.path) {
      missing("transactions5m");
    } else if (
      parsedBuys === null ||
      parsedSells === null ||
      !Number.isSafeInteger(parsedBuys) ||
      !Number.isSafeInteger(parsedSells) ||
      parsedBuys < 0 ||
      parsedSells < 0
    ) {
      invalid(
        "transactions5m",
        `${buyCount.path}+${sellCount.path}`,
        [buyCount.value, sellCount.value],
        "two_non_negative_integers",
      );
    } else {
      metrics.transactions5m = parsedBuys + parsedSells;
      sourceFields.transactions5m = `${buyCount.path}+${sellCount.path}`;
    }
  }

  unix("tokenCreatedAtUnix", ["creation_timestamp"]);
  unix("migrationAtUnix", ["pool.creation_timestamp"]);

  return deepFreeze({
    schemaVersion: 1,
    source: "gmgn",
    sourceMethodVersion: METHOD_VERSION,
    metrics,
    sourceFields,
    missingFields,
    invalidFields,
    sourceQuality: {
      statBlockPopulated,
      statBlockReason,
    },
    runtimeAuthority: false,
  });
}

export const gmgnDeskMetricsConstants = Object.freeze({
  sourceMethodVersion: METHOD_VERSION,
});
