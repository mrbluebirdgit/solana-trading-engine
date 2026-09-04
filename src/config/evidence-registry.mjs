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

export function parseEvidenceRegistry(text) {
  let registry;

  try {
    registry = JSON.parse(text);
  } catch (error) {
    throw new Error(`Evidence registry must be valid JSON: ${error.message}`);
  }

  validateEvidenceRegistry(registry);
  return Object.freeze(registry);
}

export function validateEvidenceRegistry(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error("Evidence registry must be an object");
  }

  if (registry.projectStatus !== "LIVE_LOCKED") {
    throw new Error("Evidence registry cannot unlock live trading");
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
    requireNonEmptyString(source.title, `Source ${source.id} title`);
    requireNonEmptyString(source.url, `Source ${source.id} URL`);
    requireNonEmptyString(source.limits, `Source ${source.id} limits`);
  }

  for (const rule of registry.rules) {
    if (!VALID_CLASSES.has(rule.classification)) {
      throw new Error(`Rule ${rule.id} has invalid classification`);
    }

    if (!VALID_USES.has(rule.eligibleUse)) {
      throw new Error(`Rule ${rule.id} has invalid eligible use`);
    }

    if (!VALID_PROMOTION_STATES.has(rule.promotionState)) {
      throw new Error(`Rule ${rule.id} has invalid promotion state`);
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

    if (
      rule.classification === "EMPIRICAL_FEATURE" &&
      rule.requiresLocalCalibration !== true
    ) {
      throw new Error(`Empirical feature ${rule.id} must require local calibration`);
    }

    if (
      rule.classification === "UNVALIDATED_HYPOTHESIS" &&
      rule.eligibleUse === "hard_gate"
    ) {
      throw new Error(`Unvalidated hypothesis ${rule.id} cannot be a hard gate`);
    }

    if (
      rule.classification === "REJECTED_SHORTCUT" &&
      rule.eligibleUse !== "forbidden"
    ) {
      throw new Error(`Rejected shortcut ${rule.id} must be forbidden`);
    }

    if (rule.promotionState === "LIVE_CANDIDATE") {
      throw new Error(`Rule ${rule.id} cannot be live-eligible while project is locked`);
    }
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

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

