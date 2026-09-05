function ratio(a, b) {
  const total = a + b;
  return total > 0 ? a / total : 0;
}

export function evaluateEarlyMomentum({ candidate, pair, curve, security, previousPair, nowMs, config }) {
  const ageMs = nowMs - candidate.launchedAtMs;
  const reasons = [];
  if (ageMs < 0 || ageMs > config.maxAgeMs) return { verdict: "IGNORE", reasons: ["outside_age_window"] };
  if (!candidate.factoryProven) return { verdict: "IGNORE", reasons: ["factory_unproven"] };
  if (!pair) return { verdict: "WAIT", reasons: ["no_indexed_market"] };
  if (security?.isProxy) return { verdict: "REJECT", reasons: ["token_proxy"] };
  if (security && security.topTenPct > config.maxTopTenPct) {
    return { verdict: "REJECT", reasons: ["holder_concentration"] };
  }
  if (pair.priceChange.m5 <= 0 || pair.priceChange.m5 > config.maxFiveMinuteGainPct) {
    return { verdict: "WAIT", reasons: ["five_minute_price_not_actionable"] };
  }

  const buys = pair.txns.m5.buys;
  const sells = pair.txns.m5.sells;
  const buyTxnRatio = ratio(buys, sells);
  const curveBuyQuote = Number(curve?.buyQuote ?? 0);
  const curveSellQuote = Number(curve?.sellQuote ?? 0);
  const curveBuyRatio = ratio(curveBuyQuote, curveSellQuote);
  const buyDominant = buyTxnRatio >= config.minBuyVolumeRatio || curveBuyRatio >= config.minBuyVolumeRatio;
  if (!buyDominant) return { verdict: "WAIT", reasons: ["buy_flow_not_dominant"] };

  const uniqueBuyers = Number(curve?.uniqueBuyers ?? 0);
  const priorVolume = Number(previousPair?.volume?.m5 ?? 0);
  const volumeAccelerating = priorVolume === 0 || pair.volume.m5 >= priorVolume * 1.08;
  if (volumeAccelerating) reasons.push("five_minute_volume_accelerating");
  if (buyTxnRatio >= config.minBuyVolumeRatio) reasons.push("buy_transactions_dominant");
  if (curveBuyRatio >= config.minBuyVolumeRatio) reasons.push("curve_buy_value_dominant");
  if (candidate.protocol === "pons_v2") reasons.push("pons_v2_factory_proven");

  const strong =
    pair.liquidityUsd >= config.minStrongLiquidityUsd &&
    pair.volume.m5 >= config.minStrongFiveMinuteVolumeUsd &&
    uniqueBuyers >= config.minStrongUniqueBuyers &&
    volumeAccelerating;
  if (strong) return { verdict: "STRONG_MOMENTUM", reasons, ageMs, uniqueBuyers, buyTxnRatio, curveBuyRatio };

  const scout =
    pair.liquidityUsd >= config.minScoutLiquidityUsd &&
    pair.volume.m5 >= config.minScoutFiveMinuteVolumeUsd &&
    uniqueBuyers >= config.minScoutUniqueBuyers &&
    volumeAccelerating;
  if (scout) return { verdict: "EARLY_WATCH", reasons, ageMs, uniqueBuyers, buyTxnRatio, curveBuyRatio };

  return { verdict: "WAIT", reasons: ["thresholds_not_met"] };
}

