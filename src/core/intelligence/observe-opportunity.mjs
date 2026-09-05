import { collectPumpStageFromHelius } from "../../integrations/helius/pump-stage-collector.mjs";
import { quoteIntendedSize } from "../../integrations/jupiter/intended-size.mjs";
import { formatOpportunityAlert } from "../alerts/observation-alert.mjs";
import { evaluateOpportunity } from "../decision/evaluate-opportunity.mjs";

const CANDIDATE_REJECTION_REASONS = new Set([
  "buy_impact",
  "quote_unavailable",
  "sell_impact",
  "stage_unresolved",
]);

const CANDIDATE_STAGE_ABSTENTIONS = new Set([
  "complete_false_with_canonical_pool",
  "token_2022_extensions_uninspected",
]);

const RETRYABLE_STAGE_ABSTENTIONS = new Set([
  "bonding_curve_snapshot_unavailable",
  "invalid_rpc_context_slot",
  "mint_account_absent",
  "quote_mint_changed_during_snapshot",
]);

function stageScope(reason) {
  if (!reason) return null;
  return CANDIDATE_STAGE_ABSTENTIONS.has(reason) ? "candidate" : "provider";
}

function classifyOutcome({ stageErrorScope, quoteErrorScope, decision }) {
  if (stageErrorScope === "provider" || quoteErrorScope === "provider") {
    return "provider_failure";
  }
  if (stageErrorScope === "candidate" || quoteErrorScope === "candidate") {
    return "candidate_rejection";
  }
  if (decision?.decision === "ALERT_ONLY") return "complete";
  const reasons = Array.isArray(decision?.reasons) ? decision.reasons : [];
  if (
    decision?.decision === "REJECT" &&
    reasons.length > 0 &&
    reasons.every(({ code }) => CANDIDATE_REJECTION_REASONS.has(code))
  ) {
    return "candidate_rejection";
  }
  return "provider_failure";
}

export async function observeOpportunity({
  heliusApiKey,
  jupiterApiKey,
  mint,
  buyLamports,
  minContextSlot,
  fetchImpl,
  now,
  signal,
} = {}, {
  collectStageImpl = collectPumpStageFromHelius,
  quoteIntendedSizeImpl = quoteIntendedSize,
  formatAlertImpl = formatOpportunityAlert,
  evaluateImpl = evaluateOpportunity,
} = {}) {
  const clock =
    typeof now === "function"
      ? now
      : () => (now === undefined ? new Date() : new Date(now));
  const stage = await collectStageImpl(heliusApiKey, mint, {
    fetchImpl,
    now: clock,
    minContextSlot,
    signal,
  });
  const stageErrorScope = stageScope(stage.abstentionReason);
  const stageErrorRetryable = RETRYABLE_STAGE_ABSTENTIONS.has(
    stage.abstentionReason,
  );

  let quotes = null;
  let quoteError = null;
  let quoteErrorCode = null;
  let quoteErrorScope = null;
  let quoteErrorRetryable = false;
  if (!stageErrorScope) {
    try {
      quotes = await quoteIntendedSizeImpl(
        { apiKey: jupiterApiKey, mint, buyLamports },
        { fetchImpl, now: clock, signal },
      );
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError") throw error;
      quoteError = error.message;
      quoteErrorCode = typeof error?.code === "string" ? error.code : "unknown";
      quoteErrorScope = error?.scope === "candidate" ? "candidate" : "provider";
      quoteErrorRetryable = error?.retryable === true;
    }
  }

  const alert = formatAlertImpl({
    mint: stage.mint,
    venueStage: stage.venueStage,
    cutoffSlot: stage.cutoffSlot,
    mintAuthority: stage.mintAuthority,
    freezeAuthority: stage.freezeAuthority,
    intendedBuyLamports: quotes?.intendedBuyLamports ?? buyLamports ?? null,
    buyPriceImpactPercent: quotes?.buyPriceImpactPercent ?? null,
    sellPriceImpactPercent: quotes?.sellPriceImpactPercent ?? null,
    roundTripRetention: quotes?.roundTripRetention ?? null,
    abstentionReason: stage.abstentionReason ?? quoteError,
  });

  const decision = evaluateImpl({
    stage,
    stageErrorScope,
    stageErrorRetryable,
    quotes,
    quoteError,
    quoteErrorCode,
    quoteErrorScope,
    quoteErrorRetryable,
    now: clock(),
  });
  const observationOutcome = classifyOutcome({
    stageErrorScope,
    quoteErrorScope,
    decision,
  });

  return Object.freeze({
    schemaVersion: 1,
    sourceMethodVersion: "observe-opportunity.v1",
    stage,
    stageErrorScope,
    stageErrorRetryable,
    observationOutcome,
    quotes,
    quoteError,
    quoteErrorCode,
    quoteErrorScope,
    quoteErrorRetryable,
    alert,
    decision,
    runtimeAuthority: false,
  });
}
