import { DESK_FILTER_LAW } from "../../config/desk-filter-law.mjs";
import { authorityCheck } from "./authority-check.mjs";

const STAGE_FROM_VENUE = Object.freeze({
  pump_curve_active: "curve",
  pumpswap_amm: "migrated",
});

const RISK_METRICS = Object.freeze([
  ["developerPercent", "developer"],
  ["insiderPercent", "insider"],
  ["bundledPercent", "bundled"],
  ["freshPercent", "fresh"],
  ["snipersPercent", "snipers"],
  ["rugPercent", "rug"],
  ["phishingPercent", "phishing"],
]);

const STAGE_RULES = Object.freeze({
  curve: Object.freeze([
    ["smartMoneyCount", "minimum", "smartMoneyMinimum"],
    ["holderCount", "minimum", "holdersMinimum"],
    ["top10Percent", "maximum", "top10PercentMaximum"],
    ["marketCapUsd", "minimum", "marketCapUsdMinimum"],
    ["marketCapUsd", "maximum", "marketCapUsdMaximum"],
    ["volume5mUsd", "minimum", "volume5mUsdMinimum"],
    ["netInflow5mUsd", "minimum", "netInflow5mUsdMinimum"],
    ["transactions5m", "minimum", "transactions5mMinimum"],
    ["curveFillPercent", "minimum", "curveFillPercentMinimum"],
    ["curveFillPercent", "maximum", "curveFillPercentMaximum"],
  ]),
  migrated: Object.freeze([
    ["smartMoneyCount", "minimum", "smartMoneyMinimum"],
    ["holderCount", "minimum", "holdersMinimum"],
    ["top10Percent", "maximum", "top10PercentMaximum"],
    ["marketCapUsd", "minimum", "marketCapUsdMinimum"],
    ["marketCapUsd", "maximum", "marketCapUsdMaximum"],
    ["volume5mUsd", "minimum", "volume5mUsdMinimum"],
    ["netInflow5mUsd", "minimum", "netInflow5mUsdMinimum"],
    ["transactions5m", "minimum", "transactions5mMinimum"],
    ["migrationAgeMinutes", "minimum", "migrationAgeMinutesMinimum"],
    ["migrationAgeMinutes", "maximum", "migrationAgeMinutesMaximum"],
  ]),
});

function reason(code, field, actual = null, limit = null) {
  return Object.freeze({ code, field, actual, limit });
}

function isPercent(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function isMetric(value, field) {
  if (!Number.isFinite(value)) return false;
  if (field.endsWith("Percent")) return value >= 0 && value <= 100;
  if (field === "netInflow5mUsd") return true;
  return value >= 0;
}

export function deskStageFromVenueStage(venueStage) {
  return STAGE_FROM_VENUE[venueStage] ?? null;
}

/**
 * Applies the owner-locked desk law. The law is deliberately not injectable:
 * runtime code cannot replace or tune it.
 */
export function evaluateDeskFilter({
  stage,
  venueStage,
  mintAuthority = "unknown",
  freezeAuthority = "unknown",
  metrics = {},
} = {}) {
  const deskStage = stage ?? deskStageFromVenueStage(venueStage);
  const killReasons = [];
  const skipReasons = [];
  let authority;

  try {
    authority = authorityCheck({ mintAuthority, freezeAuthority });
  } catch {
    authority = Object.freeze({
      killSignal: false,
      scoutSkip: true,
      reasons: Object.freeze(["authority_state_invalid"]),
      runtimeAuthority: false,
    });
  }

  for (const code of authority.reasons) {
    const target = authority.killSignal ? killReasons : skipReasons;
    target.push(reason(code, code.startsWith("mint") ? "mintAuthority" : "freezeAuthority"));
  }

  for (const [field, lawField] of RISK_METRICS) {
    const value = metrics?.[field];
    const limit = DESK_FILTER_LAW.riskCapsPercent[lawField];
    if (!isPercent(value)) {
      skipReasons.push(reason("metric_missing_or_invalid", field, value ?? null, limit));
    } else if (value > limit) {
      killReasons.push(reason("risk_cap_exceeded", field, value, limit));
    }
  }

  if (!Object.hasOwn(STAGE_RULES, deskStage)) {
    skipReasons.push(reason("unsupported_or_unknown_stage", "stage", deskStage ?? null));
  } else {
    const stageLaw = DESK_FILTER_LAW.stages[deskStage];
    for (const [field, direction, lawField] of STAGE_RULES[deskStage]) {
      const value = metrics?.[field];
      const limit = stageLaw[lawField];
      if (!isMetric(value, field)) {
        skipReasons.push(reason("metric_missing_or_invalid", field, value ?? null, limit));
      } else if (direction === "minimum" && value < limit) {
        skipReasons.push(reason("scout_minimum_not_met", field, value, limit));
      } else if (direction === "maximum" && value > limit) {
        skipReasons.push(reason("scout_maximum_exceeded", field, value, limit));
      }
    }
  }

  const decision = killReasons.length > 0
    ? "RISK_KILL"
    : skipReasons.length > 0
      ? "SCOUT_SKIP"
      : "SCOUT_PASS";
  const reasons = decision === "RISK_KILL" ? killReasons : skipReasons;

  return Object.freeze({
    schemaVersion: 1,
    lawVersion: DESK_FILTER_LAW.lawVersion,
    stage: deskStage ?? null,
    decision,
    killSignal: decision === "RISK_KILL",
    scoutSkip: decision === "SCOUT_SKIP",
    scoutEligible: decision === "SCOUT_PASS",
    reasons: Object.freeze(reasons),
    ignoredMetrics: DESK_FILTER_LAW.ignoredFilters,
    optionalMetrics: DESK_FILTER_LAW.optionalFilters,
    automaticThresholdMutation: false,
    runtimeAuthority: false,
  });
}

export const deskFilterConstants = Object.freeze({
  riskMetrics: RISK_METRICS,
  stageRules: STAGE_RULES,
  venueStageMap: STAGE_FROM_VENUE,
});
