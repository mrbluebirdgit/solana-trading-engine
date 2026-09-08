function shortMint(mint) {
  return typeof mint === "string" && mint.length >= 12
    ? `${mint.slice(0, 4)}…${mint.slice(-4)}`
    : mint;
}

function valueOrUnknown(value, suffix = "") {
  return Number.isFinite(value) ? `${value}${suffix}` : "unknown";
}

function usd(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(6)}`;
}

function share(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "unknown";
}

function percent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "unknown";
}

function booleanEvidence(value) {
  return typeof value === "boolean" ? (value ? "yes" : "NO") : "unknown";
}

function providerLine(evidence, provider) {
  const result = evidence?.providers?.find((item) => item.provider === provider);
  if (!result) return `${provider}: not configured`;
  if (!result.ok) return `${provider}: unavailable (${result.errorCode ?? "request failed"})`;
  const partial = result.partialErrors?.length > 0 ? "; partial" : "";
  return `${provider}: ${result.capabilities.join(", ") || "connected"}${partial}`;
}

export function formatNarrativeAlert(
  match,
  evidence = null,
  deskAssessment = null,
  lawyerRanking = null,
) {
  if (
    match?.runtimeAuthority !== false ||
    match?.narrative?.runtimeAuthority !== false ||
    match?.mintCandidate?.runtimeAuthority !== false ||
    match?.score?.runtimeAuthority !== false
  ) {
    throw new TypeError("narrative alert input must be observation-only");
  }
  const { narrative, mintCandidate, score } = match;
  const mint = mintCandidate.mint;
  const encoded = encodeURIComponent(mint);
  const velocity = narrative.velocity === null
    ? "unknown (no baseline)"
    : `${narrative.velocity >= 0 ? "+" : ""}${narrative.velocity.toFixed(2)} relative change vs baseline`;
  const providerEvidence = evidence ? [
    `price at alert: ${usd(evidence.market?.priceUsd)} (${evidence.market?.priceProvider ?? "unknown"})`,
    `liquidity: ${usd(evidence.market?.liquidityUsd)} (${evidence.market?.liquidityProvider ?? "unknown"})`,
    `market cap: ${usd(evidence.market?.marketCapUsd)} (${evidence.market?.marketCapProvider ?? "unknown"})`,
    `recent volume: ${usd(evidence.market?.volumeUsd)} (${evidence.market?.volumeProvider ?? "unknown"})`,
    `holders: ${valueOrUnknown(evidence.market?.holderCount)} (${evidence.market?.holderProvider ?? "unknown"})`,
    `top 10 held: ${share(evidence.market?.top10HolderShare)} (${evidence.market?.top10HolderProvider ?? "unknown"})`,
    `GMGN smart/KOL wallets: ${valueOrUnknown(evidence.market?.smartMoneyParticipants)}/${valueOrUnknown(evidence.market?.notableWalletParticipants)}`,
    `GMGN bundled trading share: ${share(evidence.market?.providerBundledTradingVolumeShare)}`,
    `mint/freeze authority renounced: ${booleanEvidence(evidence.market?.mintAuthorityRenounced)}/${booleanEvidence(evidence.market?.freezeAuthorityRenounced)}`,
    `provider rug ratio: ${share(evidence.market?.providerRugRatio)} (${evidence.market?.rugRatioProvider ?? "unknown"})`,
    providerLine(evidence, "birdeye"),
    providerLine(evidence, "gmgn"),
    providerLine(evidence, "solscan"),
  ] : [];
  const desk = deskAssessment?.decision?.decision === "SCOUT_PASS" ? [
    `desk law: RISK CLEAR · SCOUT PASS · ${deskAssessment.decision.stage}`,
    `risk % dev/insider/bundle/fresh/sniper/rug/phishing: ${[
      deskAssessment.metrics.developerPercent,
      deskAssessment.metrics.insiderPercent,
      deskAssessment.metrics.bundledPercent,
      deskAssessment.metrics.freshPercent,
      deskAssessment.metrics.snipersPercent,
      deskAssessment.metrics.rugPercent,
      deskAssessment.metrics.phishingPercent,
    ].map(percent).join(" / ")}`,
  ] : [];
  const ranking = lawyerRanking ? [
    `THE LAWYER rank: ${lawyerRanking.rankScore.toFixed(1)}/100 (${lawyerRanking.modelOutcomes} learned outcomes; ranking only)`,
  ] : [];
  return Object.freeze({
    title: `NARRATIVE ${shortMint(mint)} · ${narrative.label}`,
    body: [
      "research priority: uncalibrated (not a success probability)",
      `priority score: ${score.priorityScore}/100`,
      `match: ${match.match.method} (${match.match.confidence.toFixed(2)})`,
      `attention: ${narrative.providers.join(", ") || "unknown"}`,
      `evidence channels: ${narrative.evidenceChannels.join(", ") || "unknown"}`,
      `unique authors: ${valueOrUnknown(narrative.uniqueAuthorCount)}`,
      `velocity: ${velocity}`,
      `observed matching mints/15m: ${match.competingMintCount}`,
      `token: ${mintCandidate.name ?? "unknown"} (${mintCandidate.symbol ?? "unknown"})`,
      `stage: ${mintCandidate.venueStage ?? "unknown"}`,
      ...desk,
      ...ranking,
      ...providerEvidence,
      `image: ${mintCandidate.imageUrl ? "yes" : "unknown"}`,
      `attached socials: ${mintCandidate.socialLinks.length}`,
      `missing evidence: ${score.missingEvidence.join(", ") || "none"}`,
      "authority: observe only",
      `Pump: https://pump.fun/coin/${encoded}`,
      `DexScreener: https://dexscreener.com/solana/${encoded}`,
      `Solscan: https://solscan.io/token/${encoded}`,
    ].join("\n"),
    priority: score.priorityScore >= 85 ? "high" : "default",
    runtimeAuthority: false,
  });
}
