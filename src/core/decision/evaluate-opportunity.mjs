const DECISIONS = Object.freeze(["REJECT", "ALERT_ONLY", "PAPER_ELIGIBLE"]);

const DEFAULTS = Object.freeze({
  maximumSignalDataAgeSeconds: 15,
  maximumPriceImpactPercent: 2,
  minimumIndependentDataSources: 2,
});

function add(reasons, code, detail) {
  reasons.push(Object.freeze({ code, detail }));
}

function impactTooHigh(value, limit) {
  return Number.isFinite(value) && Math.abs(value) > limit;
}

export function evaluateOpportunity({
  stage,
  quotes,
  quoteError = null,
  now = new Date(),
  limits = DEFAULTS,
} = {}) {
  const reasons = [];
  const observedAt = stage?.observedAt ? new Date(stage.observedAt) : null;
  const ageSeconds =
    observedAt && !Number.isNaN(observedAt.valueOf())
      ? Math.max(0, (new Date(now).valueOf() - observedAt.valueOf()) / 1000)
      : null;

  if (!stage?.mint || !stage?.venueStage) {
    add(reasons, "missing_stage", "canonical mint/stage was not resolved");
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (stage.venueStage === "unknown" || stage.abstentionReason) {
    add(
      reasons,
      "stage_unresolved",
      stage.abstentionReason ?? "venue stage is unknown",
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (ageSeconds !== null && ageSeconds > limits.maximumSignalDataAgeSeconds) {
    add(
      reasons,
      "stale_observation",
      `observation age ${ageSeconds.toFixed(1)}s exceeds ${limits.maximumSignalDataAgeSeconds}s`,
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (!quotes || quoteError) {
    add(reasons, "quote_unavailable", quoteError ?? "intended-size quotes missing");
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (impactTooHigh(quotes.buyPriceImpactPercent, limits.maximumPriceImpactPercent)) {
    add(
      reasons,
      "buy_impact",
      `buy impact ${quotes.buyPriceImpactPercent} exceeds ${limits.maximumPriceImpactPercent}%`,
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (impactTooHigh(quotes.sellPriceImpactPercent, limits.maximumPriceImpactPercent)) {
    add(
      reasons,
      "sell_impact",
      `sell impact ${quotes.sellPriceImpactPercent} exceeds ${limits.maximumPriceImpactPercent}%`,
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  add(reasons, "live_locked", "v1 may alert or paper-evaluate, never live-buy");
  add(
    reasons,
    "missing_independent_market_tape",
    "holder, flow, and creator evidence are not populated, so paper eligibility stays closed",
  );

  if (stage.venueStage === "pump_curve_active") {
    add(
      reasons,
      "curve_alert_only",
      "unvalidated early-curve reserves remain alert-only",
    );
  }

  return finalize("ALERT_ONLY", reasons, stage, quotes);
}

function finalize(decision, reasons, stage, quotes) {
  if (!DECISIONS.includes(decision)) {
    throw new Error("invalid decision");
  }
  return Object.freeze({
    schemaVersion: 1,
    decision,
    reasons: Object.freeze(reasons),
    mint: stage?.mint ?? null,
    venueStage: stage?.venueStage ?? null,
    cutoffSlot: stage?.cutoffSlot ?? null,
    buyPriceImpactPercent: quotes?.buyPriceImpactPercent ?? null,
    sellPriceImpactPercent: quotes?.sellPriceImpactPercent ?? null,
    runtimeAuthority: false,
  });
}

export const evaluationConstants = Object.freeze({
  decisions: DECISIONS,
  defaults: DEFAULTS,
});
