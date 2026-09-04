const SCHEMA_VERSION = 1;

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function optionalText(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function freezeSection(section) {
  return Object.freeze(section);
}

export function createTokenObservation({
  source,
  chain,
  address,
  observedAt,
  identity = {},
  market = {},
  ownership = {},
  behavior = {},
  riskEvidence = {},
  venue = {},
}) {
  const timestamp = new Date(observedAt);

  if (Number.isNaN(timestamp.valueOf())) {
    throw new TypeError("observedAt must be a valid timestamp");
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    source: requiredText(source, "source"),
    chain: requiredText(chain, "chain"),
    address: requiredText(address, "address"),
    observedAt: timestamp.toISOString(),
    identity: freezeSection({
      name: optionalText(identity.name),
      symbol: optionalText(identity.symbol),
    }),
    market: freezeSection({
      priceUsd: optionalNumber(market.priceUsd),
      liquidityUsd: optionalNumber(market.liquidityUsd),
      marketCapUsd: optionalNumber(market.marketCapUsd),
      volumeUsd: optionalNumber(market.volumeUsd),
      priceChangePercent: optionalNumber(market.priceChangePercent),
    }),
    ownership: freezeSection({
      holderCount: optionalNumber(ownership.holderCount),
      top10HolderShare: optionalNumber(ownership.top10HolderShare),
      developerTeamShare: optionalNumber(ownership.developerTeamShare),
    }),
    behavior: freezeSection({
      smartMoneyParticipants: optionalNumber(behavior.smartMoneyParticipants),
      notableWalletParticipants: optionalNumber(
        behavior.notableWalletParticipants,
      ),
      sniperParticipants: optionalNumber(behavior.sniperParticipants),
      bundledTradeShare: optionalNumber(behavior.bundledTradeShare),
      suspiciousTraderVolumeShare: optionalNumber(
        behavior.suspiciousTraderVolumeShare,
      ),
      botParticipantShare: optionalNumber(behavior.botParticipantShare),
    }),
    riskEvidence: freezeSection({
      honeypot: optionalBoolean(riskEvidence.honeypot),
      washTrading: optionalBoolean(riskEvidence.washTrading),
      mintAuthorityRenounced: optionalBoolean(
        riskEvidence.mintAuthorityRenounced,
      ),
      freezeAuthorityRenounced: optionalBoolean(
        riskEvidence.freezeAuthorityRenounced,
      ),
      providerRugRatio: optionalNumber(riskEvidence.providerRugRatio),
    }),
    venue: freezeSection({
      launchpad: optionalText(venue.launchpad),
      exchange: optionalText(venue.exchange),
      createdAtUnix: optionalNumber(venue.createdAtUnix),
    }),
  });
}
