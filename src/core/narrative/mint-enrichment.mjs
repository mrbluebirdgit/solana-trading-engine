import { createMintCandidate } from "./contracts.mjs";
import { getDexScreenerTokenEnrichment } from "../../integrations/dexscreener/token-enrichment.mjs";
import { getHeliusAssetMetadata } from "../../integrations/helius/asset-metadata.mjs";

export async function enrichPumpMint({
  heliusApiKey,
  mint,
  eventSlot,
  venueStage,
  observedAt,
  fetchImpl,
  signal,
  now = new Date(),
} = {}, {
  getHeliusAssetMetadataImpl = getHeliusAssetMetadata,
  getDexScreenerTokenEnrichmentImpl = getDexScreenerTokenEnrichment,
} = {}) {
  const [heliusResult, dexResult] = await Promise.allSettled([
    getHeliusAssetMetadataImpl(heliusApiKey, mint, { fetchImpl, signal }),
    getDexScreenerTokenEnrichmentImpl(mint, { fetchImpl, signal }),
  ]);
  if (heliusResult.status !== "fulfilled") {
    throw new Error("canonical mint metadata unavailable from Helius DAS");
  }
  const helius = heliusResult.value;
  const dex = dexResult.status === "fulfilled" ? dexResult.value : null;
  const name = helius.name ?? dex?.name ?? null;
  const symbol = helius.symbol ?? dex?.symbol ?? null;
  if (!name && !symbol) {
    throw new Error("mint metadata has no name or symbol");
  }
  return createMintCandidate({
    sourceMethodVersion: "pump-mint-enrichment.v1",
    mint,
    name,
    symbol,
    description: helius.description,
    imageUrl: helius.imageUrl ?? dex?.imageUrl ?? null,
    socialLinks: dex?.socialLinks ?? [],
    observedAt,
    eventSlot,
    venueStage,
    canonicalPumpEvent: true,
  }, { now });
}
