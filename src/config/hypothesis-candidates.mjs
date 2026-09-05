const SCHEMA_VERSION = "1.0.0";
const REQUIRED_ALLOWED_USES = new Set(["chronological_replay", "forward_paper"]);
const VALID_PHASES = new Set([
  "global",
  "new_pair",
  "pump_curve_active",
  "migration_pending",
  "pumpswap_amm",
  "copy_trade",
  "execution",
  "exit",
  "portfolio",
]);
const VALID_UNITS = new Set([
  "seconds",
  "minutes",
  "hours",
  "days",
  "usd",
  "sol",
  "ratio",
  "supply_ratio",
  "wallet_count",
  "transaction_count",
  "trade_count",
  "token_count",
  "launch_count",
  "slot_count",
  "smart_wallet_count",
  "score",
]);
const COUNT_UNITS = new Set([
  "wallet_count",
  "transaction_count",
  "trade_count",
  "token_count",
  "launch_count",
  "slot_count",
  "smart_wallet_count",
]);
const RATIO_UNITS = new Set(["ratio", "supply_ratio"]);
const VALID_OPERATORS = new Set([
  "minimum",
  "maximum",
  "trigger_at_or_above",
  "trigger_at_or_below",
  "range",
]);
const VALID_IMPLEMENTATION_STATUSES = new Set([
  "CATALOGUED_FEATURE",
  "UNIMPLEMENTED",
]);
const FORBIDDEN_EXPERIMENT_KEYS = new Set([
  "active",
  "activevalue",
  "selected",
  "selectedvalue",
  "enabled",
  "live",
  "livetrading",
  "liveauthority",
  "runtimeauthority",
  "runtimepolicy",
  "runtimevalue",
  "action",
  "buy",
  "sell",
  "signer",
  "privatekey",
  "secret",
  "walletseed",
]);

export function parseHypothesisCandidates(source) {
  let registry;
  try {
    registry = JSON.parse(source);
  } catch (error) {
    throw new Error(`Hypothesis candidate registry must be valid JSON: ${error.message}`);
  }

  validateHypothesisCandidates(registry);
  return deepFreeze(registry);
}

export function validateHypothesisCandidates(registry) {
  requireRecord(registry, "Hypothesis candidate registry");
  for (const [key, value] of Object.entries(registry)) {
    if (key === "runtimeAuthority") continue;
    assertNoForbiddenExperimentKeys({ [key]: value }, "Hypothesis candidate registry");
  }

  if (registry.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Hypothesis candidate schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (registry.projectStatus !== "LIVE_LOCKED" || registry.runtimeAuthority !== false) {
    throw new Error("Hypothesis candidates must remain live-locked and non-authoritative");
  }
  if (registry.classification !== "UNVALIDATED_HYPOTHESES") {
    throw new Error("Hypothesis candidate registry must be explicitly unvalidated");
  }

  validateAllowedUses(registry.allowedUses);
  if (
    !Array.isArray(registry.forbiddenUses) ||
    !registry.forbiddenUses.includes("live_execution") ||
    !registry.forbiddenUses.includes("transaction_signing")
  ) {
    throw new Error("Hypothesis candidate registry must forbid live execution and signing");
  }

  if (!Array.isArray(registry.sourceIntakes) || registry.sourceIntakes.length === 0) {
    throw new Error("Hypothesis candidate registry requires source intakes");
  }
  const sourceIds = new Set();
  for (const source of registry.sourceIntakes) {
    requireRecord(source, "Content source");
    requireText(source.id, "Content source id");
    if (sourceIds.has(source.id)) throw new Error(`Duplicate content source ${source.id}`);
    sourceIds.add(source.id);
    requireText(source.kind, `Content source ${source.id} kind`);
    if (source.kind === "USER_CHAT_MESSAGE") {
      if (source.artifactName !== null || source.sha256 !== null) {
        throw new Error(
          `Chat source ${source.id} artifactName and sha256 must be null when exact content is not stored`,
        );
      }
    } else {
      requireText(source.artifactName, `Content source ${source.id} artifactName`);
      if (!/^[a-f0-9]{64}$/.test(source.sha256)) {
        throw new Error(`File source ${source.id} sha256 must be lowercase SHA-256`);
      }
    }
    requireText(source.locator, `Content source ${source.id} locator`);
    requireText(source.evidenceStatus, `Content source ${source.id} evidenceStatus`);
    requireText(source.limits, `Content source ${source.id} limits`);
  }

  if (!Array.isArray(registry.candidates) || registry.candidates.length === 0) {
    throw new Error("Hypothesis candidate registry requires candidates");
  }
  const candidateIds = new Set();
  for (const candidate of registry.candidates) {
    validateCandidate(candidate, sourceIds);
    if (candidateIds.has(candidate.id)) {
      throw new Error(`Duplicate hypothesis candidate ${candidate.id}`);
    }
    candidateIds.add(candidate.id);
  }

  if (!Array.isArray(registry.exitLadders) || registry.exitLadders.length === 0) {
    throw new Error("Hypothesis candidate registry requires exit ladders");
  }
  const ladderIds = new Set();
  for (const ladder of registry.exitLadders) {
    validateExitLadder(ladder, sourceIds);
    if (ladderIds.has(ladder.id)) throw new Error(`Duplicate exit ladder ${ladder.id}`);
    ladderIds.add(ladder.id);
  }

  return {
    candidateCount: candidateIds.size,
    exitLadderCount: ladderIds.size,
    sourceCount: sourceIds.size,
  };
}

function validateAllowedUses(uses) {
  if (!Array.isArray(uses) || uses.length !== REQUIRED_ALLOWED_USES.size) {
    throw new Error("allowedUses must contain chronological_replay and forward_paper only");
  }
  const unique = new Set(uses);
  if (
    unique.size !== REQUIRED_ALLOWED_USES.size ||
    [...unique].some((use) => !REQUIRED_ALLOWED_USES.has(use))
  ) {
    throw new Error("allowedUses must contain chronological_replay and forward_paper only");
  }
}

function validateCandidate(candidate, sourceIds) {
  requireRecord(candidate, "Hypothesis candidate");
  assertNoForbiddenExperimentKeys(candidate, `Candidate ${candidate.id ?? "<unknown>"}`);
  requireText(candidate.id, "Hypothesis candidate id");
  if (candidate.classification !== "UNVALIDATED_HYPOTHESIS") {
    throw new Error(`Candidate ${candidate.id} must be UNVALIDATED_HYPOTHESIS`);
  }
  if (candidate.validationStatus !== "UNVALIDATED") {
    throw new Error(`Candidate ${candidate.id} must remain UNVALIDATED`);
  }
  if (!VALID_PHASES.has(candidate.phase)) {
    throw new Error(`Candidate ${candidate.id} has invalid phase`);
  }
  if (!VALID_UNITS.has(candidate.unit)) {
    throw new Error(`Candidate ${candidate.id} has invalid unit`);
  }
  if (!VALID_OPERATORS.has(candidate.operator)) {
    throw new Error(`Candidate ${candidate.id} has invalid operator`);
  }
  if (!VALID_IMPLEMENTATION_STATUSES.has(candidate.implementationStatus)) {
    throw new Error(`Candidate ${candidate.id} has invalid implementationStatus`);
  }
  if (candidate.implementationStatus === "CATALOGUED_FEATURE") {
    requireText(candidate.featureRef, `Candidate ${candidate.id} featureRef`);
  } else if (candidate.featureRef !== null) {
    throw new Error(`Unimplemented candidate ${candidate.id} must have a null featureRef`);
  }
  requireText(candidate.sourceRef, `Candidate ${candidate.id} sourceRef`);
  if (!sourceIds.has(candidate.sourceRef)) {
    throw new Error(`Candidate ${candidate.id} references unknown source ${candidate.sourceRef}`);
  }
  requireText(candidate.trialFamily, `Candidate ${candidate.id} trialFamily`);
  requirePositiveInteger(candidate.maxTrials, `Candidate ${candidate.id} maxTrials`);
  requireText(candidate.falsification, `Candidate ${candidate.id} falsification`);

  if (!Array.isArray(candidate.candidateValues) || candidate.candidateValues.length === 0) {
    throw new Error(`Candidate ${candidate.id} requires candidateValues`);
  }
  if (candidate.candidateValues.length > candidate.maxTrials) {
    throw new Error(`Candidate ${candidate.id} candidateValues exceed maxTrials`);
  }
  if (candidate.operator === "range") {
    for (const value of candidate.candidateValues) {
      validateRange(value, candidate);
    }
  } else {
    for (const value of candidate.candidateValues) {
      validateScalar(value, candidate.unit, `Candidate ${candidate.id} value`);
    }
  }
}

function validateExitLadder(ladder, sourceIds) {
  requireRecord(ladder, "Exit ladder");
  assertNoForbiddenExperimentKeys(ladder, `Exit ladder ${ladder.id ?? "<unknown>"}`);
  requireText(ladder.id, "Exit ladder id");
  if (
    ladder.classification !== "UNVALIDATED_HYPOTHESIS" ||
    ladder.validationStatus !== "UNVALIDATED"
  ) {
    throw new Error(`Exit ladder ${ladder.id} must remain an unvalidated hypothesis`);
  }
  if (ladder.phase !== "exit") throw new Error(`Exit ladder ${ladder.id} must use exit phase`);
  if (ladder.implementationStatus !== "UNIMPLEMENTED" || ladder.featureRef !== null) {
    throw new Error(`Exit ladder ${ladder.id} must remain unimplemented`);
  }
  requireText(ladder.sourceRef, `Exit ladder ${ladder.id} sourceRef`);
  if (!sourceIds.has(ladder.sourceRef)) {
    throw new Error(`Exit ladder ${ladder.id} references unknown source ${ladder.sourceRef}`);
  }
  requireText(ladder.trialFamily, `Exit ladder ${ladder.id} trialFamily`);
  requirePositiveInteger(ladder.maxTrials, `Exit ladder ${ladder.id} maxTrials`);
  requireText(ladder.falsification, `Exit ladder ${ladder.id} falsification`);
  if (!Array.isArray(ladder.steps) || ladder.steps.length === 0) {
    throw new Error(`Exit ladder ${ladder.id} requires steps`);
  }

  let allocated = 0;
  for (const [index, step] of ladder.steps.entries()) {
    requireRecord(step, `Exit ladder ${ladder.id} step ${index}`);
    validateScalar(step.allocationRatio, "ratio", `Exit ladder ${ladder.id} allocation`);
    if (step.allocationRatio <= 0) {
      throw new Error(`Exit ladder ${ladder.id} allocations must be positive`);
    }
    allocated += step.allocationRatio;
    const hasMultiple = Object.hasOwn(step, "targetMultiple");
    const hasRange = Object.hasOwn(step, "targetMultipleRange");
    if (hasMultiple === hasRange) {
      throw new Error(`Exit ladder ${ladder.id} step must have one target multiple form`);
    }
    if (hasMultiple) {
      validateScalar(step.targetMultiple, "ratio", `Exit ladder ${ladder.id} target multiple`, {
        ratioBounded: false,
      });
      if (step.targetMultiple <= 1) {
        throw new Error(`Exit ladder ${ladder.id} target multiples must exceed one`);
      }
    } else {
      validatePositiveRange(step.targetMultipleRange, `Exit ladder ${ladder.id} target range`);
      if (step.targetMultipleRange.min <= 1) {
        throw new Error(`Exit ladder ${ladder.id} target ranges must exceed one`);
      }
    }
  }
  validateScalar(ladder.runnerAllocationRatio, "ratio", `Exit ladder ${ladder.id} runner allocation`);
  allocated += ladder.runnerAllocationRatio;
  if (Math.abs(allocated - 1) > 1e-9) {
    throw new Error(`Exit ladder ${ladder.id} allocations must sum to one`);
  }
}

function validateRange(value, candidate) {
  requireRecord(value, `Candidate ${candidate.id} range`);
  if (Object.keys(value).some((key) => key !== "min" && key !== "max")) {
    throw new Error(`Candidate ${candidate.id} range has unknown fields`);
  }
  validateScalar(value.min, candidate.unit, `Candidate ${candidate.id} range min`);
  validateScalar(value.max, candidate.unit, `Candidate ${candidate.id} range max`);
  if (value.min > value.max) {
    throw new Error(`Candidate ${candidate.id} range min cannot exceed max`);
  }
}

function validatePositiveRange(value, label) {
  requireRecord(value, label);
  if (Object.keys(value).some((key) => key !== "min" && key !== "max")) {
    throw new Error(`${label} has unknown fields`);
  }
  validateScalar(value.min, "ratio", `${label} min`, { ratioBounded: false });
  validateScalar(value.max, "ratio", `${label} max`, { ratioBounded: false });
  if (value.min > value.max) throw new Error(`${label} min cannot exceed max`);
}

function validateScalar(value, unit, label, { ratioBounded = true } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (value < 0) throw new Error(`${label} cannot be negative`);
  if (COUNT_UNITS.has(unit) && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer count`);
  }
  if (ratioBounded && RATIO_UNITS.has(unit) && value > 1) {
    throw new Error(`${label} must be between zero and one`);
  }
}

function assertNoForbiddenExperimentKeys(value, label) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
    if (FORBIDDEN_EXPERIMENT_KEYS.has(normalized)) {
      throw new Error(`${label} cannot contain forbidden field ${key}`);
    }
    assertNoForbiddenExperimentKeys(nested, label);
  }
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

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

