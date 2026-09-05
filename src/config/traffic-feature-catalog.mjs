const VALID_CLASSES = new Set([
  "ENGINEERING_INVARIANT",
  "EMPIRICAL_FEATURE",
  "PROVIDER_LABEL",
  "UNVALIDATED_HYPOTHESIS",
]);

const VALID_MISSING_BEHAVIORS = new Set(["abstain", "unknown"]);

export const EXPECTED_TRAFFIC_EVENT_TIME_WINDOWS = Object.freeze([
  "30s",
  "2m",
  "5m",
  "15m",
  "1h",
  "3h",
  "24h",
]);

export const EXPECTED_TRAFFIC_FORBIDDEN_SHORTCUTS = Object.freeze([
  "price_change_alone_authorizes_trade",
  "raw_wallet_count_equals_independent_people",
  "same_slot_equals_common_owner",
  "vendor_threshold_equals_optimal_threshold",
  "market_cap_implies_protocol_phase",
  "social_spike_alone_authorizes_trade",
  "provider_score_is_canonical_fact",
]);

const EXPECTED_CATALOG_VERSION = "1.0.0";
const VALID_PHASE_SCOPES = new Set([
  "all",
  "pump_curve_active",
  "migration_pending",
  "pumpswap_amm",
  "other_amm",
  "unknown",
]);
const FORBIDDEN_FEATURE_KEYS = new Set([
  "action",
  "allowbuy",
  "autobuy",
  "autosell",
  "buywhen",
  "cutoff",
  "decision",
  "decisionrule",
  "execute",
  "executionaction",
  "hardreject",
  "maximum",
  "minimum",
  "order",
  "positionsize",
  "score",
  "scoreweight",
  "sellwhen",
  "slippage",
  "stoploss",
  "takeprofit",
  "threshold",
  "tradeaction",
  "weight",
]);

export function parseTrafficFeatureCatalog(source) {
  let catalog;
  try {
    catalog = JSON.parse(source);
  } catch (error) {
    throw new Error(`Traffic feature catalog must be valid JSON: ${error.message}`);
  }

  validateTrafficFeatureCatalog(catalog);
  return deepFreeze(catalog);
}

export function validateTrafficFeatureCatalog(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("Traffic feature catalog must be an object");
  }
  if (catalog.projectStatus !== "LIVE_LOCKED" || catalog.runtimeAuthority !== false) {
    throw new Error("Traffic feature catalog must remain live-locked and non-authoritative");
  }
  if (catalog.catalogVersion !== EXPECTED_CATALOG_VERSION) {
    throw new Error(
      `Traffic feature catalog version must be ${EXPECTED_CATALOG_VERSION}`,
    );
  }
  if (!arraysEqual(catalog.eventTimeWindows, EXPECTED_TRAFFIC_EVENT_TIME_WINDOWS)) {
    throw new Error("Traffic feature catalog has invalid event-time windows");
  }
  if (catalog.phaseSource !== "canonical_program_state_only") {
    throw new Error(
      "Traffic feature catalog phase source must be canonical_program_state_only",
    );
  }
  if (!Array.isArray(catalog.features) || catalog.features.length === 0) {
    throw new Error("Traffic feature catalog requires features");
  }
  if (!Array.isArray(catalog.forbiddenShortcuts) || catalog.forbiddenShortcuts.length === 0) {
    throw new Error("Traffic feature catalog requires forbidden shortcuts");
  }

  const ids = new Set();
  for (const feature of catalog.features) {
    requireRecord(feature, `Feature ${feature?.id ?? "<unknown>"}`);
    requireText(feature.id, "feature id");
    if (ids.has(feature.id)) throw new Error(`Duplicate traffic feature ${feature.id}`);
    ids.add(feature.id);

    if (!VALID_CLASSES.has(feature.classification)) {
      throw new Error(`Feature ${feature.id} has invalid classification`);
    }
    if (!VALID_MISSING_BEHAVIORS.has(feature.missingBehavior)) {
      throw new Error(`Feature ${feature.id} has invalid missing behavior`);
    }
    if (!Array.isArray(feature.sourcePriority) || feature.sourcePriority.length === 0) {
      throw new Error(`Feature ${feature.id} requires a source priority`);
    }
    validateUniqueNonEmptyStrings(
      feature.sourcePriority,
      `Feature ${feature.id} source priority`,
    );
    if (!Array.isArray(feature.phaseScope) || feature.phaseScope.length === 0) {
      throw new Error(`Feature ${feature.id} requires a phase scope`);
    }
    validatePhaseScope(feature);
    if (
      feature.classification === "ENGINEERING_INVARIANT" &&
      feature.missingBehavior !== "abstain"
    ) {
      throw new Error(
        `Engineering invariant ${feature.id} must abstain when missing`,
      );
    }
    requireText(feature.claim, `Feature ${feature.id} claim`);
    requireText(feature.limits, `Feature ${feature.id} limits`);

    rejectActionFields(feature, feature.id);
  }

  validateForbiddenShortcuts(catalog.forbiddenShortcuts);

  return { featureCount: ids.size };
}

function validatePhaseScope(feature) {
  validateUniqueNonEmptyStrings(
    feature.phaseScope,
    `Feature ${feature.id} phase scope`,
  );

  for (const phase of feature.phaseScope) {
    if (!VALID_PHASE_SCOPES.has(phase)) {
      throw new Error(`Feature ${feature.id} has invalid phase scope ${phase}`);
    }
  }

  if (feature.phaseScope.includes("all") && feature.phaseScope.length !== 1) {
    throw new Error(`Feature ${feature.id} cannot mix all with named phases`);
  }
}

function validateForbiddenShortcuts(shortcuts) {
  validateUniqueNonEmptyStrings(shortcuts, "Forbidden shortcut");

  if (
    shortcuts.length !== EXPECTED_TRAFFIC_FORBIDDEN_SHORTCUTS.length ||
    !EXPECTED_TRAFFIC_FORBIDDEN_SHORTCUTS.every((shortcut) =>
      shortcuts.includes(shortcut),
    )
  ) {
    throw new Error("Traffic feature catalog has invalid forbidden shortcuts");
  }
}

function validateUniqueNonEmptyStrings(values, label) {
  const seen = new Set();

  for (const value of values) {
    requireText(value, label);
    if (seen.has(value)) throw new Error(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

function rejectActionFields(value, featureId) {
  if (!value || typeof value !== "object") return;

  if (!Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
      if (
        FORBIDDEN_FEATURE_KEYS.has(normalizedKey) ||
        normalizedKey.endsWith("threshold")
      ) {
        throw new Error(`Feature ${featureId} cannot embed action field ${key}`);
      }
      rejectActionFields(nested, featureId);
    }
    return;
  }

  for (const nested of value) rejectActionFields(nested, featureId);
}

function arraysEqual(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }

  return value;
}

