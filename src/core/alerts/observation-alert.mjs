const STAGE_PRIORITY = Object.freeze({
  pump_curve_active: "watch",
  migration_pending: "high",
  pumpswap_amm: "normal",
  other_amm: "low",
  unknown: "low",
});

function shortMint(mint) {
  if (typeof mint !== "string" || mint.length < 12) return mint ?? "";
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function pct(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "n/a";
}

function retention(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

export function formatOpportunityAlert({
  mint,
  venueStage,
  cutoffSlot = null,
  mintAuthority = "unknown",
  freezeAuthority = "unknown",
  intendedBuyLamports = null,
  buyPriceImpactPercent = null,
  sellPriceImpactPercent = null,
  roundTripRetention = null,
  abstentionReason = null,
} = {}) {
  const priority = STAGE_PRIORITY[venueStage] ?? "low";
  const title = `${venueStage ?? "unknown"} ${shortMint(mint)}`;
  const lines = [
    `mint: ${mint}`,
    `stage: ${venueStage ?? "unknown"}`,
    `slot: ${cutoffSlot ?? "n/a"}`,
    `mint authority: ${mintAuthority}`,
    `freeze authority: ${freezeAuthority}`,
    `probe: ${intendedBuyLamports ?? "n/a"} lamports`,
    `buy impact: ${pct(buyPriceImpactPercent)}`,
    `sell impact: ${pct(sellPriceImpactPercent)}`,
    `round-trip keep: ${retention(roundTripRetention)}`,
    "authority: observe only",
  ];
  if (abstentionReason) {
    lines.splice(2, 0, `abstain: ${abstentionReason}`);
  }

  return Object.freeze({
    schemaVersion: 1,
    channelAgnostic: true,
    priority,
    title,
    body: lines.join("\n"),
    runtimeAuthority: false,
  });
}
