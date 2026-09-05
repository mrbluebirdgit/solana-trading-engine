const DECISIONS = Object.freeze(["REJECT", "ALERT_ONLY", "PAPER_ELIGIBLE"]);

const DEFAULTS = Object.freeze({
  maximumSignalDataAgeSeconds: 15,
  maximumPriceImpactPercent: 2,
  minimumIndependentDataSources: 2,
});

const RFC3339_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

function add(reasons, code, detail) {
  reasons.push(Object.freeze({ code, detail }));
}

function impactTooHigh(value, limit) {
  return Math.max(0, value) > limit;
}

function observedAtMilliseconds(value) {
  if (typeof value !== "string") return null;
  const match = value.match(RFC3339_TIMESTAMP);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const milliseconds = new Date(value).valueOf();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function validateQuoteSet(quotes, stage, observedAtMs, nowMs, maximumAgeSeconds) {
  if (quotes.runtimeAuthority !== false || quotes.source !== "jupiter") {
    return ["invalid_quote_provenance", "quote source or authority marker is invalid"];
  }
  if (quotes.mint !== stage.mint || !/^\d+$/.test(quotes.intendedBuyLamports ?? "")) {
    return ["quote_request_mismatch", "quote mint or intended notional does not match"];
  }

  const buy = quotes.buy;
  const sell = quotes.sell;
  if (
    buy?.provider !== "jupiter" ||
    sell?.provider !== "jupiter" ||
    buy?.input?.mint !== NATIVE_SOL_MINT ||
    buy?.output?.mint !== stage.mint ||
    sell?.input?.mint !== stage.mint ||
    sell?.output?.mint !== NATIVE_SOL_MINT ||
    buy?.input?.amountAtomic !== quotes.intendedBuyLamports ||
    sell?.input?.amountAtomic !== buy?.output?.amountAtomic
  ) {
    return ["quote_route_mismatch", "round-trip quote direction or amount does not match"];
  }

  for (const [side, quote] of [["buy", buy], ["sell", sell]]) {
    const quotedAtMs = observedAtMilliseconds(quote?.quotedAt);
    if (quotedAtMs === null || quotedAtMs < observedAtMs || quotedAtMs > nowMs) {
      return ["invalid_quote_time", `${side} quote timestamp is invalid or incoherent`];
    }
    if ((nowMs - quotedAtMs) / 1000 > maximumAgeSeconds) {
      return ["stale_quote", `${side} quote exceeds the maximum data age`];
    }
  }

  if (
    buy.execution?.priceImpactPercent !== quotes.buyPriceImpactPercent ||
    sell.execution?.priceImpactPercent !== quotes.sellPriceImpactPercent
  ) {
    return ["quote_impact_mismatch", "top-level and route quote impacts disagree"];
  }
  if (!Number.isFinite(quotes.roundTripRetention) || quotes.roundTripRetention < 0) {
    return ["invalid_round_trip", "round-trip retention must be a finite non-negative number"];
  }
  return null;
}

export function evaluateOpportunity({
  stage,
  quotes,
  quoteError = null,
  now = new Date(),
  limits = DEFAULTS,
} = {}) {
  const reasons = [];

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

  if (stage.observedAt === undefined || stage.observedAt === null || stage.observedAt === "") {
    add(reasons, "missing_observed_at", "observation timestamp is required");
    return finalize("REJECT", reasons, stage, quotes);
  }

  const observedAtMs = observedAtMilliseconds(stage.observedAt);
  if (observedAtMs === null) {
    add(reasons, "invalid_observed_at", "observation timestamp is invalid");
    return finalize("REJECT", reasons, stage, quotes);
  }

  const nowMs = new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) {
    add(reasons, "invalid_evaluation_time", "evaluation timestamp is invalid");
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (observedAtMs > nowMs) {
    add(reasons, "future_observation", "observation timestamp is in the future");
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (!Number.isSafeInteger(stage.cutoffSlot) || stage.cutoffSlot < 0) {
    add(
      reasons,
      "invalid_cutoff_slot",
      "cutoff slot must be a non-negative safe integer",
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  const ageSeconds = (nowMs - observedAtMs) / 1000;

  if (ageSeconds > limits.maximumSignalDataAgeSeconds) {
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

  if (
    !Number.isFinite(quotes.buyPriceImpactPercent)
  ) {
    add(
      reasons,
      "invalid_buy_impact",
      "buy impact must be a finite number",
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (
    !Number.isFinite(quotes.sellPriceImpactPercent)
  ) {
    add(
      reasons,
      "invalid_sell_impact",
      "sell impact must be a finite number",
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  const quoteValidation = validateQuoteSet(
    quotes,
    stage,
    observedAtMs,
    nowMs,
    limits.maximumSignalDataAgeSeconds,
  );
  if (quoteValidation) {
    add(reasons, quoteValidation[0], quoteValidation[1]);
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (
    impactTooHigh(
      quotes.buyPriceImpactPercent,
      limits.maximumPriceImpactPercent,
    )
  ) {
    add(
      reasons,
      "buy_impact",
      `buy impact ${quotes.buyPriceImpactPercent} exceeds ${limits.maximumPriceImpactPercent}%`,
    );
    return finalize("REJECT", reasons, stage, quotes);
  }

  if (
    impactTooHigh(
      quotes.sellPriceImpactPercent,
      limits.maximumPriceImpactPercent,
    )
  ) {
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
    notificationEligible: false,
    runtimeAuthority: false,
  });
}

export const evaluationConstants = Object.freeze({
  decisions: DECISIONS,
  defaults: DEFAULTS,
});
