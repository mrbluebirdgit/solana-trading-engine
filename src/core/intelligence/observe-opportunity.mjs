import { collectPumpStageFromHelius } from "../../integrations/helius/pump-stage-collector.mjs";
import { quoteIntendedSize } from "../../integrations/jupiter/intended-size.mjs";
import { formatOpportunityAlert } from "../alerts/observation-alert.mjs";
import { evaluateOpportunity } from "../decision/evaluate-opportunity.mjs";

export async function observeOpportunity({
  heliusApiKey,
  jupiterApiKey,
  mint,
  buyLamports,
  fetchImpl,
  now,
} = {}) {
  const stage = await collectPumpStageFromHelius(heliusApiKey, mint, {
    fetchImpl,
    now,
  });

  let quotes = null;
  let quoteError = null;
  try {
    quotes = await quoteIntendedSize(
      { apiKey: jupiterApiKey, mint, buyLamports },
      { fetchImpl },
    );
  } catch (error) {
    quoteError = error.message;
  }

  const alert = formatOpportunityAlert({
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

  const decision = evaluateOpportunity({
    stage,
    quotes,
    quoteError,
    now,
  });

  return Object.freeze({
    schemaVersion: 1,
    sourceMethodVersion: "observe-opportunity.v1",
    stage,
    quotes,
    quoteError,
    alert,
    decision,
    runtimeAuthority: false,
  });
}
