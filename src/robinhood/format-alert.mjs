function usd(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

function pct(value) {
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(1)}%`;
}

export function formatMomentumAlert({ candidate, pair, curve, security, decision, metadata, nowMs }) {
  const ageMinutes = Math.max(0, Math.floor((nowMs - candidate.launchedAtMs) / 60_000));
  const chart = pair.url ?? `https://dexscreener.com/robinhood/${pair.pairAddress}`;
  const explorer = `https://robinhoodchain.blockscout.com/token/${candidate.token}`;
  const invalidationLiquidity = Math.round(pair.liquidityUsd * 0.72);
  return [
    `${decision.verdict.replace("_", " ")}: ${metadata.name} ($${metadata.symbol})`,
    `Age ${ageMinutes}m | Price ${usd(pair.priceUsd, pair.priceUsd < 0.01 ? 8 : 6)} | MC ${usd(pair.marketCapUsd || pair.fdvUsd)}`,
    `5m ${pct(pair.priceChange.m5)} | 1h ${pct(pair.priceChange.h1)} | 5m volume ${usd(pair.volume.m5)} | Liquidity ${usd(pair.liquidityUsd)}`,
    `5m buys/sells ${pair.txns.m5.buys}/${pair.txns.m5.sells} | Pons unique buyers ${curve.uniqueBuyers}`,
    `Security: Pons factory proven; source ${security.sourceVerified ? "verified" : "not verified"}; proxy ${security.isProxy ? "YES" : "no"}; top 10 ${security.topTenPct ? `${security.topTenPct.toFixed(1)}%` : "unavailable"}`,
    `Trigger: ${decision.reasons.join(", ")}`,
    `Invalidation: 5m momentum <= 0, sell flow takes control, or liquidity < ${usd(invalidationLiquidity)}.`,
    `CA ${candidate.token}`,
    `${chart}\n${explorer}`,
  ].join("\n");
}

