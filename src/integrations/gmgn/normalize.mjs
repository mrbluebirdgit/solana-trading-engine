import { createTokenObservation } from "../../core/intelligence/token-observation.mjs";

function gmgnFlag(value) {
  if (value === 1 || value === true) return true;
  if (value === 0 || value === false) return false;
  if (value === null || value === undefined || value === "") return null;
  throw new TypeError("GMGN flag must be 0, 1, true, false, or missing");
}

function canonicalChain(value) {
  return value === undefined || value === null || value === "sol"
    ? "solana"
    : value;
}

export function normalizeGmgnToken(
  rawToken,
  { observedAt, sourceMethodVersion } = {},
) {
  if (!rawToken || typeof rawToken !== "object" || Array.isArray(rawToken)) {
    throw new TypeError("GMGN token payload must be an object");
  }

  return createTokenObservation({
    source: "gmgn",
    sourceMethodVersion,
    chain: canonicalChain(rawToken.chain),
    address: rawToken.address,
    observedAt: observedAt ?? new Date().toISOString(),
    identity: {
      name: rawToken.name,
      symbol: rawToken.symbol,
    },
    market: {
      priceUsd: rawToken.price,
      liquidityUsd: rawToken.liquidity,
      marketCapUsd: rawToken.market_cap,
      volumeUsd: rawToken.volume,
      priceChangePercent: rawToken.price_change_percent,
    },
    ownership: {
      holderCount: rawToken.holder_count,
      top10HolderShare: rawToken.top_10_holder_rate,
      developerTeamShare: rawToken.dev_team_hold_rate,
    },
    behavior: {
      smartMoneyParticipants: rawToken.smart_degen_count,
      notableWalletParticipants: rawToken.renowned_count,
      sniperParticipants: rawToken.sniper_count,
      providerBundlerRate: rawToken.bundler_rate,
      providerBundledTradingVolumeShare:
        rawToken.bundler_trader_amount_rate,
      suspiciousTraderVolumeShare: rawToken.rat_trader_amount_rate,
      botParticipantShare: rawToken.bot_degen_rate,
    },
    riskEvidence: {
      honeypot: gmgnFlag(rawToken.is_honeypot),
      washTrading: gmgnFlag(rawToken.is_wash_trading),
      mintAuthorityRenounced: gmgnFlag(rawToken.renounced_mint),
      freezeAuthorityRenounced: gmgnFlag(
        rawToken.renounced_freeze_account,
      ),
      providerRugRatio: rawToken.rug_ratio,
    },
    venue: {
      launchpad: rawToken.launchpad_platform ?? rawToken.launchpad,
      exchange: rawToken.exchange,
      createdAtUnix: rawToken.creation_timestamp,
    },
  });
}

