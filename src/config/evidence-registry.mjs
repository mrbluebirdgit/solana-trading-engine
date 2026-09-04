const VALID_CLASSES = new Set([
  "PROTOCOL_FACT",
  "ENGINEERING_INVARIANT",
  "EMPIRICAL_FEATURE",
  "RISK_GUARDRAIL",
  "UNVALIDATED_HYPOTHESIS",
  "REJECTED_SHORTCUT",
]);

const VALID_USES = new Set([
  "hard_gate",
  "feature_only",
  "paper_filter_only",
  "forbidden",
]);

const VALID_PROMOTION_STATES = new Set([
  "RESEARCH_ONLY",
  "PAPER_ONLY",
  "REPLAY_VALIDATED",
  "PROSPECTIVE_VALIDATED",
  "LIVE_CANDIDATE",
]);

const EXPECTED_REGISTRY_VERSION = "1.0.0";

const CLASS_POLICIES = Object.freeze({
  PROTOCOL_FACT: Object.freeze({
    eligibleUses: new Set(["hard_gate"]),
    promotionStates: new Set([
      "PAPER_ONLY",
      "REPLAY_VALIDATED",
      "PROSPECTIVE_VALIDATED",
    ]),
    calibration: false,
  }),
  ENGINEERING_INVARIANT: Object.freeze({
    eligibleUses: new Set(["hard_gate"]),
    promotionStates: new Set([
      "PAPER_ONLY",
      "REPLAY_VALIDATED",
      "PROSPECTIVE_VALIDATED",
    ]),
    calibration: "boolean",
  }),
  EMPIRICAL_FEATURE: Object.freeze({
    eligibleUses: new Set(["feature_only"]),
    promotionStates: new Set([
      "RESEARCH_ONLY",
      "PAPER_ONLY",
      "REPLAY_VALIDATED",
      "PROSPECTIVE_VALIDATED",
    ]),
    calibration: true,
  }),
  RISK_GUARDRAIL: Object.freeze({
    eligibleUses: new Set(["hard_gate"]),
    promotionStates: new Set([
      "PAPER_ONLY",
      "REPLAY_VALIDATED",
      "PROSPECTIVE_VALIDATED",
    ]),
    calibration: "boolean",
  }),
  UNVALIDATED_HYPOTHESIS: Object.freeze({
    eligibleUses: new Set(["paper_filter_only"]),
    promotionStates: new Set(["RESEARCH_ONLY"]),
    calibration: true,
  }),
  REJECTED_SHORTCUT: Object.freeze({
    eligibleUses: new Set(["forbidden"]),
    promotionStates: new Set(["RESEARCH_ONLY"]),
    calibration: false,
  }),
});

export function parseEvidenceRegistry(text) {
  let registry;

  try {
    registry = JSON.parse(text);
  } catch (error) {
    throw new Error(`Evidence registry must be valid JSON: ${error.message}`);
  }

  validateEvidenceRegistry(registry);
  return deepFreeze(registry);
}

export function validateEvidenceRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error("Evidence registry must be an object");
  }

  if (registry.projectStatus !== "LIVE_LOCKED") {
    throw new Error("Evidence registry cannot unlock live trading");
  }

  if (registry.registryVersion !== EXPECTED_REGISTRY_VERSION) {
    throw new Error(
      `Evidence registry version must be ${EXPECTED_REGISTRY_VERSION}`,
    );
  }

  if (!Array.isArray(registry.sources) || registry.sources.length === 0) {
    throw new Error("Evidence registry requires sources");
  }

  if (!Array.isArray(registry.rules) || registry.rules.length === 0) {
    throw new Error("Evidence registry requires rules");
  }

  const sourceIds = uniqueIds(registry.sources, "source");
  const ruleIds = uniqueIds(registry.rules, "rule");

  for (const source of registry.sources) {
    requireRecord(source, `Source ${source?.id ?? "<unknown>"}`);
    requireNonEmptyString(source.title, `Source ${source.id} title`);
    requireNonEmptyString(source.url, `Source ${source.id} URL`);
    requireNonEmptyString(source.limits, `Source ${source.id} limits`);
  }

  for (const rule of registry.rules) {
    requireRecord(rule, `Rule ${rule?.id ?? "<unknown>"}`);
    if (!VALID_CLASSES.has(rule.classification)) {
      throw new Error(`Rule ${rule.id} has invalid classification`);
    }

    if (!VALID_USES.has(rule.eligibleUse)) {
      throw new Error(`Rule ${rule.id} has invalid eligible use`);
    }

    if (!VALID_PROMOTION_STATES.has(rule.promotionState)) {
      throw new Error(`Rule ${rule.id} has invalid promotion state`);
    }

    if (typeof rule.requiresLocalCalibration !== "boolean") {
      throw new Error(
        `Rule ${rule.id} requiresLocalCalibration must be boolean`,
      );
    }

    requireNonEmptyString(rule.claim, `Rule ${rule.id} claim`);
    requireNonEmptyString(rule.limits, `Rule ${rule.id} limits`);

    if (!Array.isArray(rule.sourceIds) || rule.sourceIds.length === 0) {
      throw new Error(`Rule ${rule.id} requires at least one source`);
    }

    for (const sourceId of rule.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(`Rule ${rule.id} references unknown source ${sourceId}`);
      }
    }

    if (rule.promotionState === "LIVE_CANDIDATE") {
      throw new Error(`Rule ${rule.id} cannot be live-eligible while project is locked`);
    }

    validateClassPolicy(rule);
  }

  return { sourceCount: sourceIds.size, ruleCount: ruleIds.size };
}

function uniqueIds(items, label) {
  const ids = new Set();

  for (const item of items) {
    requireNonEmptyString(item?.id, `${label} id`);
    if (ids.has(item.id)) {
      throw new Error(`Duplicate ${label} id ${item.id}`);
    }
    ids.add(item.id);
  }

  return ids;
}

function validateClassPolicy(rule) {
  const policy = CLASS_POLICIES[rule.classification];

  if (!policy.eligibleUses.has(rule.eligibleUse)) {
    throw new Error(
      `Rule ${rule.id} classification ${rule.classification} cannot use ${rule.eligibleUse}`,
    );
  }

  if (!policy.promotionStates.has(rule.promotionState)) {
    throw new Error(
      `Rule ${rule.id} classification ${rule.classification} cannot be ${rule.promotionState}`,
    );
  }

  if (
    policy.calibration !== "boolean" &&
    rule.requiresLocalCalibration !== policy.calibration
  ) {
    const requirement = policy.calibration ? "must" : "must not";
    throw new Error(
      `Rule ${rule.id} classification ${rule.classification} ${requirement} require local calibration`,
    );
  }
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
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
