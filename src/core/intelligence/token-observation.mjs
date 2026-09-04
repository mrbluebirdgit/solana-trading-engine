const SCHEMA_VERSION = 2;

const TOP_LEVEL_FIELDS = Object.freeze([
  "source",
  "sourceMethodVersion",
  "chain",
  "address",
  "observedAt",
  "identity",
  "market",
  "ownership",
  "behavior",
  "riskEvidence",
  "venue",
]);

const SECTION_FIELDS = Object.freeze({
  identity: ["name", "symbol"],
  market: [
    "priceUsd",
    "liquidityUsd",
    "marketCapUsd",
    "volumeUsd",
    "priceChangePercent",
  ],
  ownership: ["holderCount", "top10HolderShare", "developerTeamShare"],
  behavior: [
    "smartMoneyParticipants",
    "notableWalletParticipants",
    "sniperParticipants",
    "providerBundlerRate",
    "providerBundledTradingVolumeShare",
    "suspiciousTraderVolumeShare",
    "botParticipantShare",
  ],
  riskEvidence: [
    "honeypot",
    "washTrading",
    "mintAuthorityRenounced",
    "freezeAuthorityRenounced",
    "providerRugRatio",
  ],
  venue: ["launchpad", "exchange", "createdAtUnix"],
});

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function optionalText(value, field) {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, field);
}

function optionalNumber(
  value,
  field,
  { minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY, integer = false } = {},
) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    throw new TypeError(`${field} must be numeric`);
  }

  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < minimum ||
    number > maximum ||
    (integer && !Number.isSafeInteger(number))
  ) {
    throw new TypeError(`${field} is outside its valid numeric range`);
  }

  return number;
}

function optionalBoolean(value, field) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "boolean") {
    throw new TypeError(`${field} must be boolean`);
  }
  return value;
}

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
  return value;
}

function rejectUnknownFields(value, allowedFields, field) {
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw new TypeError(`${field}.${unknown} is not a recognized field`);
  }
}

function timestamp(value, field) {
  if (
    typeof value !== "string" ||
    !/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new TypeError(`${field} must be an RFC 3339 timestamp string`);
  }

  const [, year, month, day, hour, minute, second] = value
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
    .map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new TypeError(`${field} must be a valid timestamp`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new TypeError(`${field} must be a valid timestamp`);
  }
  return parsed.toISOString();
}

function freezeSection(section) {
  return Object.freeze(section);
}

export function createTokenObservation(input) {
  input = record(input, "observation");
  rejectUnknownFields(input, TOP_LEVEL_FIELDS, "observation");
  let {
    source,
    sourceMethodVersion,
    chain,
    address,
    observedAt,
    identity = {},
    market = {},
    ownership = {},
    behavior = {},
    riskEvidence = {},
    venue = {},
  } = input;
  identity = record(identity, "identity");
  market = record(market, "market");
  ownership = record(ownership, "ownership");
  behavior = record(behavior, "behavior");
  riskEvidence = record(riskEvidence, "riskEvidence");
  venue = record(venue, "venue");
  for (const [name, section] of Object.entries({
    identity,
    market,
    ownership,
    behavior,
    riskEvidence,
    venue,
  })) {
    rejectUnknownFields(section, SECTION_FIELDS[name], name);
  }
  const normalizedChain = requiredText(chain, "chain");
  if (normalizedChain !== "solana") {
    throw new TypeError("chain must use the canonical solana identifier");
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    source: requiredText(source, "source"),
    sourceMethodVersion: requiredText(
      sourceMethodVersion,
      "sourceMethodVersion",
    ),
    chain: normalizedChain,
    address: requiredText(address, "address"),
    observedAt: timestamp(observedAt, "observedAt"),
    identity: freezeSection({
      name: optionalText(identity.name, "identity.name"),
      symbol: optionalText(identity.symbol, "identity.symbol"),
    }),
    market: freezeSection({
      priceUsd: optionalNumber(market.priceUsd, "market.priceUsd", { minimum: 0 }),
      liquidityUsd: optionalNumber(market.liquidityUsd, "market.liquidityUsd", { minimum: 0 }),
      marketCapUsd: optionalNumber(market.marketCapUsd, "market.marketCapUsd", { minimum: 0 }),
      volumeUsd: optionalNumber(market.volumeUsd, "market.volumeUsd", { minimum: 0 }),
      priceChangePercent: optionalNumber(
        market.priceChangePercent,
        "market.priceChangePercent",
      ),
    }),
    ownership: freezeSection({
      holderCount: optionalNumber(ownership.holderCount, "ownership.holderCount", {
        minimum: 0,
        integer: true,
      }),
      top10HolderShare: optionalNumber(
        ownership.top10HolderShare,
        "ownership.top10HolderShare",
        { minimum: 0, maximum: 1 },
      ),
      developerTeamShare: optionalNumber(
        ownership.developerTeamShare,
        "ownership.developerTeamShare",
        { minimum: 0, maximum: 1 },
      ),
    }),
    behavior: freezeSection({
      smartMoneyParticipants: optionalNumber(
        behavior.smartMoneyParticipants,
        "behavior.smartMoneyParticipants",
        { minimum: 0, integer: true },
      ),
      notableWalletParticipants: optionalNumber(
        behavior.notableWalletParticipants,
        "behavior.notableWalletParticipants",
        { minimum: 0, integer: true },
      ),
      sniperParticipants: optionalNumber(
        behavior.sniperParticipants,
        "behavior.sniperParticipants",
        { minimum: 0, integer: true },
      ),
      providerBundlerRate: optionalNumber(
        behavior.providerBundlerRate,
        "behavior.providerBundlerRate",
        { minimum: 0, maximum: 1 },
      ),
      providerBundledTradingVolumeShare: optionalNumber(
        behavior.providerBundledTradingVolumeShare,
        "behavior.providerBundledTradingVolumeShare",
        { minimum: 0, maximum: 1 },
      ),
      suspiciousTraderVolumeShare: optionalNumber(
        behavior.suspiciousTraderVolumeShare,
        "behavior.suspiciousTraderVolumeShare",
        { minimum: 0, maximum: 1 },
      ),
      botParticipantShare: optionalNumber(
        behavior.botParticipantShare,
        "behavior.botParticipantShare",
        { minimum: 0, maximum: 1 },
      ),
    }),
    riskEvidence: freezeSection({
      honeypot: optionalBoolean(riskEvidence.honeypot, "riskEvidence.honeypot"),
      washTrading: optionalBoolean(
        riskEvidence.washTrading,
        "riskEvidence.washTrading",
      ),
      mintAuthorityRenounced: optionalBoolean(
        riskEvidence.mintAuthorityRenounced,
        "riskEvidence.mintAuthorityRenounced",
      ),
      freezeAuthorityRenounced: optionalBoolean(
        riskEvidence.freezeAuthorityRenounced,
        "riskEvidence.freezeAuthorityRenounced",
      ),
      providerRugRatio: optionalNumber(
        riskEvidence.providerRugRatio,
        "riskEvidence.providerRugRatio",
        { minimum: 0, maximum: 1 },
      ),
    }),
    venue: freezeSection({
      launchpad: optionalText(venue.launchpad, "venue.launchpad"),
      exchange: optionalText(venue.exchange, "venue.exchange"),
      createdAtUnix: optionalNumber(venue.createdAtUnix, "venue.createdAtUnix", {
        minimum: 0,
        integer: true,
      }),
    }),
  });
}
