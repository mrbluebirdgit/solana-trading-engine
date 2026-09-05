function shortMint(mint) {
  return typeof mint === "string" && mint.length >= 12
    ? `${mint.slice(0, 4)}…${mint.slice(-4)}`
    : mint;
}

function valueOrUnknown(value, suffix = "") {
  return Number.isFinite(value) ? `${value}${suffix}` : "unknown";
}

export function formatNarrativeAlert(match) {
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
