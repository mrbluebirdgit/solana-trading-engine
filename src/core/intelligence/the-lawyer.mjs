import { DESK_FILTER_LAW } from "../../config/desk-filter-law.mjs";
import { TRADING_FLOOR_ROLES, tradingFloorOneLiners } from "../../config/trading-floor-roles.mjs";
import { createAtomicJsonStore } from "../runtime/atomic-json-store.mjs";

const MODEL_VERSION = "the-lawyer-online-logistic.v1";
const LEARNING_HORIZON_MS = 15 * 60 * 1_000;
const MAX_PENDING = 5_000;
const MAX_COMPLETED = 5_000;
const MAX_RECOMMENDATIONS = 500;
const LEARNING_RATE = 0.08;
const WEIGHT_DECAY = 0.001;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function immutable(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) immutable(child);
  return Object.freeze(value);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-clamp(value, -30, 30)));
}

function ratio(value, maximum) {
  return Number.isFinite(value) && maximum > 0
    ? clamp(value / maximum, 0, 1)
    : 0;
}

function safety(value, maximum) {
  if (!Number.isFinite(value)) return 0;
  if (maximum === 0) return value === 0 ? 1 : 0;
  return clamp(1 - value / maximum, 0, 1);
}

function strengthAbove(value, minimum) {
  if (!Number.isFinite(value)) return 0;
  return clamp((value - minimum) / Math.max(minimum, 1), 0, 1);
}

function featureVector(stage, metrics) {
  const law = DESK_FILTER_LAW.stages[stage];
  if (!law) throw new TypeError("THE LAWYER requires a curve or migrated stage");
  const common = {
    developerSafety: safety(metrics.developerPercent, DESK_FILTER_LAW.riskCapsPercent.developer),
    insiderSafety: safety(metrics.insiderPercent, DESK_FILTER_LAW.riskCapsPercent.insider),
    bundledSafety: safety(metrics.bundledPercent, DESK_FILTER_LAW.riskCapsPercent.bundled),
    freshSafety: safety(metrics.freshPercent, DESK_FILTER_LAW.riskCapsPercent.fresh),
    sniperSafety: safety(metrics.snipersPercent, DESK_FILTER_LAW.riskCapsPercent.snipers),
    rugSafety: safety(metrics.rugPercent, DESK_FILTER_LAW.riskCapsPercent.rug),
    phishingClear: metrics.phishingPercent === 0 ? 1 : 0,
    smartMoneyStrength: strengthAbove(metrics.smartMoneyCount, law.smartMoneyMinimum),
    holderStrength: strengthAbove(metrics.holderCount, law.holdersMinimum),
    top10Safety: safety(metrics.top10Percent, law.top10PercentMaximum),
    marketCapPosition: clamp(
      (metrics.marketCapUsd - law.marketCapUsdMinimum) /
        (law.marketCapUsdMaximum - law.marketCapUsdMinimum),
      0,
      1,
    ),
    volumeStrength: strengthAbove(metrics.volume5mUsd, law.volume5mUsdMinimum),
    inflowStrength: clamp(
      metrics.netInflow5mUsd / Math.max(metrics.volume5mUsd, 1),
      -1,
      1,
    ),
    transactionStrength: strengthAbove(metrics.transactions5m, law.transactions5mMinimum),
    botTradingContext: ratio(metrics.botTradingPercent, 100),
  };

  if (stage === "curve") {
    common.stagePosition = clamp(
      (metrics.curveFillPercent - law.curveFillPercentMinimum) /
        (law.curveFillPercentMaximum - law.curveFillPercentMinimum),
      0,
      1,
    );
  } else {
    common.stagePosition = safety(
      metrics.migrationAgeMinutes,
      law.migrationAgeMinutesMaximum,
    );
  }
  return Object.freeze(common);
}

function baseFitScore(features) {
  const entries = Object.entries(features).filter(([name]) => name !== "botTradingContext");
  const normalized = entries.reduce((sum, [, value]) => sum + clamp(value, 0, 1), 0) /
    Math.max(entries.length, 1);
  return clamp(normalized * 100, 0, 100);
}

function freshModel() {
  return {
    bias: 0,
    weights: {},
    updates: 0,
    wins: 0,
    losses: 0,
  };
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validModel(model) {
  return Boolean(
    model &&
    Number.isFinite(model.bias) &&
    model.bias >= -4 &&
    model.bias <= 4 &&
    model.weights &&
    typeof model.weights === "object" &&
    !Array.isArray(model.weights) &&
    Object.values(model.weights).every(
      (weight) => Number.isFinite(weight) && weight >= -4 && weight <= 4,
    ) &&
    nonNegativeInteger(model.updates) &&
    nonNegativeInteger(model.wins) &&
    nonNegativeInteger(model.losses) &&
    model.wins + model.losses === model.updates
  );
}

function initialState() {
  return {
    schemaVersion: 1,
    lawVersion: DESK_FILTER_LAW.lawVersion,
    modelVersion: MODEL_VERSION,
    rolesContractVersion: TRADING_FLOOR_ROLES.contractVersion,
    models: { curve: freshModel(), migrated: freshModel() },
    pending: {},
    completed: [],
    performance: {
      fillAttempts: 0,
      fillFailures: 0,
      rugsAfterPass: 0,
    },
    recommendationSequence: 0,
    recommendations: [],
    lastPerformanceReview: { curve: 0, migrated: 0 },
  };
}

function validateState(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.lawVersion !== DESK_FILTER_LAW.lawVersion ||
    value.modelVersion !== MODEL_VERSION ||
    value.rolesContractVersion !== TRADING_FLOOR_ROLES.contractVersion ||
    !value.models?.curve ||
    !value.models?.migrated ||
    !validModel(value.models.curve) ||
    !validModel(value.models.migrated) ||
    !value.pending ||
    typeof value.pending !== "object" ||
    Array.isArray(value.pending) ||
    Object.keys(value.pending).length > MAX_PENDING ||
    Object.values(value.pending).some((pending) =>
      !pending ||
      !["curve", "migrated"].includes(pending.stage) ||
      typeof pending.candidateId !== "string" ||
      !pending.features ||
      Object.values(pending.features).some((feature) => !Number.isFinite(feature))
    ) ||
    !Array.isArray(value.completed) ||
    value.completed.length > MAX_COMPLETED ||
    value.completed.some((candidateId) => typeof candidateId !== "string") ||
    !value.performance ||
    !Object.values(value.performance).every(nonNegativeInteger) ||
    !nonNegativeInteger(value.recommendationSequence) ||
    !Array.isArray(value.recommendations) ||
    value.recommendations.length > MAX_RECOMMENDATIONS ||
    value.recommendations.some((recommendation) =>
      !recommendation ||
      typeof recommendation.recommendationId !== "string" ||
      !["PENDING_REVIEW", "APPROVED", "REJECTED", "DEFERRED"].includes(
        recommendation.status,
      )
    ) ||
    !value.lastPerformanceReview ||
    !nonNegativeInteger(value.lastPerformanceReview.curve) ||
    !nonNegativeInteger(value.lastPerformanceReview.migrated)
  ) {
    throw new Error("THE LAWYER state is incompatible with the locked desk law");
  }
  return value;
}

function scoreModel(model, features) {
  const linear = Object.entries(features).reduce(
    (sum, [name, value]) => sum + (model.weights[name] ?? 0) * value,
    model.bias,
  );
  return sigmoid(linear);
}

function requiredId(value, field) {
  if (typeof value !== "string" || value.trim() === "" || value.length > 300) {
    throw new TypeError(`${field} must be a non-empty string no longer than 300 characters`);
  }
  return value.trim();
}

function requireStarted(state) {
  if (!state) throw new Error("THE LAWYER must be started before use");
}

function trimState(state) {
  const pendingIds = Object.keys(state.pending);
  for (const id of pendingIds.slice(0, Math.max(0, pendingIds.length - MAX_PENDING))) {
    delete state.pending[id];
  }
  state.completed = state.completed.slice(-MAX_COMPLETED);
  state.recommendations = state.recommendations.slice(-MAX_RECOMMENDATIONS);
}

export function createTheLawyer({
  statePath,
  clock = () => new Date(),
  createStoreImpl = createAtomicJsonStore,
} = {}) {
  const store = createStoreImpl({ filePath: statePath, defaultValue: initialState() });
  let state = null;

  async function persist() {
    trimState(state);
    await store.save(state);
  }

  function addRecommendation({ type, stage = null, evidence, proposedAction, ownerLawChange }) {
    state.recommendationSequence += 1;
    const recommendation = {
      schemaVersion: 1,
      recommendationId: `lawyer-${state.recommendationSequence}`,
      createdAt: new Date(clock()).toISOString(),
      type,
      stage,
      status: "PENDING_REVIEW",
      recipients: [...TRADING_FLOOR_ROLES.lawyer.recommendationRecipients],
      evidence,
      proposedAction,
      ownerLawChange,
      automaticChangeApplied: false,
      runtimeAuthority: false,
    };
    state.recommendations.push(recommendation);
    return immutable(clone(recommendation));
  }

  function maybePerformanceReview(stage) {
    const model = state.models[stage];
    const last = state.lastPerformanceReview[stage] ?? 0;
    if (model.updates < 20 || model.updates - last < 20) return null;
    state.lastPerformanceReview[stage] = model.updates;
    const sorted = Object.entries(model.weights).sort((left, right) => right[1] - left[1]);
    return addRecommendation({
      type: "RANKING_PERFORMANCE_REVIEW",
      stage,
      evidence: {
        outcomes: model.updates,
        wins: model.wins,
        losses: model.losses,
        winRate: model.updates > 0 ? model.wins / model.updates : null,
        strongestPositiveFactors: sorted.slice(0, 3).map(([feature, weight]) => ({ feature, weight })),
        strongestNegativeFactors: sorted.slice(-3).reverse().map(([feature, weight]) => ({ feature, weight })),
      },
      proposedAction: "Review the learned ordering factors; keep the desk-law thresholds unchanged unless the owner orders a manual change.",
      ownerLawChange: false,
    });
  }

  async function start() {
    state = validateState(await store.load());
    return snapshot();
  }

  async function rank({ candidateId, decision, metrics, observedAt } = {}) {
    requireStarted(state);
    const id = requiredId(candidateId, "candidateId");
    if (
      decision?.lawVersion !== DESK_FILTER_LAW.lawVersion ||
      decision?.decision !== "SCOUT_PASS" ||
      decision?.scoutEligible !== true
    ) {
      throw new Error("THE LAWYER can rank only a SCOUT_PASS under the current desk law");
    }
    if (state.completed.includes(id)) {
      throw new Error("THE LAWYER will not relearn a completed candidate");
    }
    if (state.pending[id]) return immutable(clone(state.pending[id].ranking));

    const stage = decision.stage;
    const features = featureVector(stage, metrics);
    const model = state.models[stage];
    const learnedProbability = scoreModel(model, features);
    const fitScore = baseFitScore(features);
    const learnedWeight = clamp(model.updates / 20, 0, 1);
    const rankScore = clamp(
      fitScore * (1 - learnedWeight) + learnedProbability * 100 * learnedWeight,
      0,
      100,
    );
    const ranking = {
      schemaVersion: 1,
      modelVersion: MODEL_VERSION,
      lawVersion: DESK_FILTER_LAW.lawVersion,
      candidateId: id,
      stage,
      rankScore,
      baseFitScore: fitScore,
      learnedProbability,
      modelOutcomes: model.updates,
      hardThresholdsChanged: false,
      adjustmentScope: "ranking_weights_only",
      runtimeAuthority: false,
    };
    state.pending[id] = {
      candidateId: id,
      stage,
      observedAt: new Date(observedAt ?? clock()).toISOString(),
      features: { ...features },
      ranking,
    };
    await persist();
    return immutable(clone(ranking));
  }

  async function recordOutcome({
    candidateId,
    horizonMs,
    returnPercent,
    adverseOutcome = false,
  } = {}) {
    requireStarted(state);
    const id = requiredId(candidateId, "candidateId");
    if (horizonMs !== LEARNING_HORIZON_MS) {
      return Object.freeze({ learned: false, reason: "non_learning_horizon" });
    }
    if (state.completed.includes(id)) {
      return Object.freeze({ learned: false, reason: "already_completed" });
    }
    const pending = state.pending[id];
    if (!pending) return Object.freeze({ learned: false, reason: "candidate_not_pending" });
    if (typeof adverseOutcome !== "boolean") {
      throw new TypeError("adverseOutcome must be boolean");
    }
    if (!Number.isFinite(returnPercent)) {
      throw new TypeError("returnPercent must be finite");
    }

    const target = adverseOutcome === true || returnPercent <= 0 ? 0 : 1;
    const model = state.models[pending.stage];
    const prediction = scoreModel(model, pending.features);
    const error = target - prediction;
    for (const [feature, value] of Object.entries(pending.features)) {
      const prior = model.weights[feature] ?? 0;
      model.weights[feature] = clamp(
        prior * (1 - WEIGHT_DECAY) + LEARNING_RATE * error * value,
        -4,
        4,
      );
    }
    model.bias = clamp(model.bias + LEARNING_RATE * error, -4, 4);
    model.updates += 1;
    if (target === 1) model.wins += 1;
    else model.losses += 1;
    state.completed.push(id);
    delete state.pending[id];
    const recommendation = maybePerformanceReview(pending.stage);
    await persist();
    return immutable({
      learned: true,
      target,
      predictionBeforeUpdate: prediction,
      modelOutcomes: model.updates,
      recommendation,
      hardThresholdsChanged: false,
      runtimeAuthority: false,
    });
  }

  async function recordOperationalResult({
    candidateId = null,
    stage = null,
    fillStatus = null,
    rugDetected = false,
    metrics = null,
  } = {}) {
    requireStarted(state);
    if (candidateId !== null) requiredId(candidateId, "candidateId");
    if (stage !== null && !["curve", "migrated"].includes(stage)) {
      throw new TypeError("stage must be curve, migrated, or null");
    }
    if (typeof rugDetected !== "boolean") {
      throw new TypeError("rugDetected must be boolean");
    }
    const recommendations = [];
    if (fillStatus !== null && !["filled", "failed"].includes(fillStatus)) {
      throw new TypeError("fillStatus must be filled, failed, or null");
    }
    if (fillStatus) {
      state.performance.fillAttempts += 1;
      if (fillStatus === "failed") state.performance.fillFailures += 1;
      if (
        fillStatus === "failed" &&
        state.performance.fillFailures % 3 === 0
      ) {
        recommendations.push(addRecommendation({
          type: "REVIEW_TERMINAL_SLIPPAGE",
          stage,
          evidence: {
            fillAttempts: state.performance.fillAttempts,
            fillFailures: state.performance.fillFailures,
            currentSlippagePercent: DESK_FILTER_LAW.terminalEntry.slippagePercent,
          },
          proposedAction: "Review fill failures and, only by an explicit manual desk-law change, adjust terminal slippage if warranted.",
          ownerLawChange: true,
        }));
      }
    }
    if (rugDetected === true) {
      state.performance.rugsAfterPass += 1;
      recommendations.push(addRecommendation({
        type: "REVIEW_BUNDLE_AND_DEVELOPER_CAPS",
        stage,
        evidence: {
          candidateId,
          rugsAfterPass: state.performance.rugsAfterPass,
          candidateDeveloperPercent: metrics?.developerPercent ?? null,
          candidateBundledPercent: metrics?.bundledPercent ?? null,
          currentDeveloperMaximum: DESK_FILTER_LAW.riskCapsPercent.developer,
          currentBundledMaximum: DESK_FILTER_LAW.riskCapsPercent.bundled,
        },
        proposedAction: "Review this escaped rug and consider manually tightening the bundle and developer caps.",
        ownerLawChange: true,
      }));
    }
    await persist();
    return immutable({
      recorded: true,
      recommendations,
      hardThresholdsChanged: false,
      runtimeAuthority: false,
    });
  }

  async function decideRecommendation({ recommendationId, decision, decidedBy } = {}) {
    requireStarted(state);
    const id = requiredId(recommendationId, "recommendationId");
    if (!["APPROVED", "REJECTED", "DEFERRED"].includes(decision)) {
      throw new TypeError("decision must be APPROVED, REJECTED, or DEFERRED");
    }
    if (!TRADING_FLOOR_ROLES.lawyer.recommendationRecipients.includes(decidedBy)) {
      throw new Error("recommendation decisions belong to CHIEF OF STAFF or CHIEF");
    }
    const recommendation = state.recommendations.find((item) => item.recommendationId === id);
    if (!recommendation) throw new Error("recommendation not found");
    if (recommendation.status !== "PENDING_REVIEW") {
      throw new Error("recommendation has already been decided");
    }
    recommendation.status = decision;
    recommendation.decidedBy = decidedBy;
    recommendation.decidedAt = new Date(clock()).toISOString();
    recommendation.automaticChangeApplied = false;
    await persist();
    return immutable(clone(recommendation));
  }

  function snapshot() {
    requireStarted(state);
    return immutable({
      schemaVersion: state.schemaVersion,
      lawVersion: state.lawVersion,
      modelVersion: state.modelVersion,
      role: TRADING_FLOOR_ROLES.roles.find((role) => role.name === "THE LAWYER"),
      tradingFloorInstructions: tradingFloorOneLiners(),
      models: clone(state.models),
      pendingCandidates: Object.keys(state.pending).length,
      completedCandidates: state.completed.length,
      performance: clone(state.performance),
      recommendations: clone(state.recommendations),
      hardThresholdsChanged: false,
      runtimeAuthority: false,
    });
  }

  async function stop() {
    if (state) await persist();
    await store.flush();
  }

  return Object.freeze({
    start,
    rank,
    recordOutcome,
    recordOperationalResult,
    decideRecommendation,
    snapshot,
    stop,
  });
}

export const theLawyerConstants = Object.freeze({
  modelVersion: MODEL_VERSION,
  learningHorizonMs: LEARNING_HORIZON_MS,
  learningRate: LEARNING_RATE,
  weightDecay: WEIGHT_DECAY,
});
