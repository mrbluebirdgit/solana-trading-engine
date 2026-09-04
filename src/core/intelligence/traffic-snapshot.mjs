const SCHEMA_VERSION = 1;

export const TRAFFIC_WINDOWS = Object.freeze([
  "30s",
  "2m",
  "5m",
  "15m",
  "1h",
  "3h",
  "24h",
]);

export const VENUE_STAGES = Object.freeze([
  "pump_curve_active",
  "migration_pending",
  "pumpswap_amm",
  "other_amm",
  "unknown",
]);

export const AGGREGATION_SCOPES = Object.freeze([
  "pair",
  "venue_token",
  "token_all_venues",
  "unknown",
]);

export const MARKET_CAP_DEFINITIONS = Object.freeze([
  "circulating",
  "fully_diluted",
  "provider_unspecified",
  "unknown",
]);

export const LAUNCH_COHORT_METHODS = Object.freeze([
  "same_slot_candidate",
  "exact_jito_bundle",
  "funding_linked_cluster",
  "union_model",
]);

export const PROVIDER_RATIO_DENOMINATORS = Object.freeze([
  "unspecified",
  "trading_volume",
  "supply",
  "wallet_count",
  "trade_count",
  "other",
]);

const PROVENANCE_KINDS = new Set([
  "ON_CHAIN_FACT",
  "PROVIDER_OBSERVATION",
  "PROVIDER_LABEL",
  "MODEL_INFERENCE",
  "UNKNOWN",
]);

const WINDOW_INPUT_FIELDS = Object.freeze([
  "buyVolumeUsd",
  "sellVolumeUsd",
  "buyTransactions",
  "sellTransactions",
  "rawUniqueMakers",
  "entityAdjustedMakers",
  "newAcquiringWallets",
  "holderCountStart",
  "holderCountEnd",
  "medianTradeUsd",
]);

const VENUE_INPUT_FIELDS = Object.freeze([
  "programId",
  "programVersion",
  "configAddress",
  "quoteMint",
  "curveProgressRatio",
  "canonicalPoolAddress",
]);

const MARKET_INPUT_FIELDS = Object.freeze([
  "liquidityUsd",
  "marketCapUsd",
  "fullyDilutedValueUsd",
  "executableBuyImpactBps",
  "executableSellImpactBps",
  "quoteNotionalUsd",
]);

const OWNERSHIP_INPUT_FIELDS = Object.freeze([
  "holderCount",
  "top10RawShare",
  "top10EntityAdjustedShare",
  "creatorShare",
  "earlyClusterShare",
]);

const SOCIAL_INPUT_FIELDS = Object.freeze([
  "mentionCount3h",
  "uniqueAuthors3h",
  "holderAuthors3h",
  "sourceCommunities3h",
  "mentionVelocityVsPrior3h",
  "botSuspectedAuthorShare",
]);

const TOP_LEVEL_FIELDS = Object.freeze([
  "chain",
  "mint",
  "observedAt",
  "decisionCutoff",
  "cutoffSlot",
  "venueStage",
  "aggregationScope",
  "pairAddress",
  "venue",
  "windows",
  "market",
  "ownership",
  "social",
  "providerLabels",
  "provenance",
]);

const MARKET_SECTION_FIELDS = Object.freeze([
  ...MARKET_INPUT_FIELDS,
  "marketCapDefinition",
]);
const OWNERSHIP_SECTION_FIELDS = Object.freeze([
  ...OWNERSHIP_INPUT_FIELDS,
  "launchCohorts",
]);
const LAUNCH_COHORT_FIELDS = Object.freeze([
  "method",
  "methodVersion",
  "source",
  "bundleId",
  "bundleStatus",
  "landingSlot",
  "transactionSignatures",
  "containsLaunchActivity",
  "containsBuyActivity",
  "componentMethods",
  "overlapEvidenceRef",
  "walletCount",
  "initialSupplyShare",
  "retainedSupplyShare",
  "tradingVolumeShare",
]);
const PROVIDER_LABEL_FIELDS = Object.freeze([
  "source",
  "field",
  "methodVersion",
  "value",
  "denominator",
]);
const PROVENANCE_FIELDS = Object.freeze([
  "field",
  "source",
  "sourceMethodVersion",
  "kind",
  "observedAt",
  "eventTime",
  "slot",
  "confidence",
]);

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

function array(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`);
  }

  return value;
}

function finiteNumber(value, field, { minimum = 0, integer = false } = {}) {
  if (value === null || value === undefined || value === "") return null;

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
    (integer && !Number.isSafeInteger(number))
  ) {
    throw new TypeError(
      `${field} must be a finite${integer ? " safe integer" : ""} number >= ${minimum}`,
    );
  }

  return number;
}

function ratio(value, field) {
  const number = finiteNumber(value, field);
  if (number !== null && number > 1) {
    throw new TypeError(`${field} must be between 0 and 1`);
  }
  return number;
}

function signedFiniteNumber(value, field) {
  return finiteNumber(value, field, { minimum: Number.NEGATIVE_INFINITY });
}

function timestamp(value, field) {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be an RFC 3339 timestamp string`);
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) {
    throw new TypeError(`${field} must be an RFC 3339 timestamp string`);
  }

  const [, year, month, day, hour, minute, second] = match.map(Number);
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

function safeDivide(numerator, denominator) {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }

  const result = numerator / denominator;
  if (!Number.isFinite(result)) {
    throw new TypeError("derived numeric value must be finite");
  }
  return result;
}

function safeArithmetic(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError("derived numeric value must be finite");
  }
  return value;
}

function normalizeWindow(window, label) {
  const input = window === undefined ? {} : record(window, label);
  rejectUnknownFields(input, WINDOW_INPUT_FIELDS, label);
  const buyVolumeUsd = finiteNumber(input.buyVolumeUsd, `${label}.buyVolumeUsd`);
  const sellVolumeUsd = finiteNumber(input.sellVolumeUsd, `${label}.sellVolumeUsd`);
  const buyTransactions = finiteNumber(
    input.buyTransactions,
    `${label}.buyTransactions`,
    { integer: true },
  );
  const sellTransactions = finiteNumber(
    input.sellTransactions,
    `${label}.sellTransactions`,
    { integer: true },
  );
  const rawUniqueMakers = finiteNumber(
    input.rawUniqueMakers,
    `${label}.rawUniqueMakers`,
    { integer: true },
  );
  const entityAdjustedMakers = finiteNumber(
    input.entityAdjustedMakers,
    `${label}.entityAdjustedMakers`,
    { integer: true },
  );
  const newAcquiringWallets = finiteNumber(
    input.newAcquiringWallets,
    `${label}.newAcquiringWallets`,
    { integer: true },
  );
  const holderCountStart = finiteNumber(
    input.holderCountStart,
    `${label}.holderCountStart`,
    { integer: true },
  );
  const holderCountEnd = finiteNumber(
    input.holderCountEnd,
    `${label}.holderCountEnd`,
    { integer: true },
  );
  const medianTradeUsd = finiteNumber(input.medianTradeUsd, `${label}.medianTradeUsd`);

  if (
    rawUniqueMakers !== null &&
    entityAdjustedMakers !== null &&
    entityAdjustedMakers > rawUniqueMakers
  ) {
    throw new TypeError(`${label}.entityAdjustedMakers cannot exceed rawUniqueMakers`);
  }

  const totalVolumeUsd =
    buyVolumeUsd === null || sellVolumeUsd === null
      ? null
      : safeArithmetic(buyVolumeUsd + sellVolumeUsd);
  const totalTransactions =
    buyTransactions === null || sellTransactions === null
      ? null
      : safeArithmetic(buyTransactions + sellTransactions);

  return Object.freeze({
    buyVolumeUsd,
    sellVolumeUsd,
    totalVolumeUsd,
    netBuyVolumeUsd:
      buyVolumeUsd === null || sellVolumeUsd === null
        ? null
        : safeArithmetic(buyVolumeUsd - sellVolumeUsd),
    buyVolumeShare: safeDivide(buyVolumeUsd, totalVolumeUsd),
    buyTransactions,
    sellTransactions,
    totalTransactions,
    buyTransactionShare: safeDivide(buyTransactions, totalTransactions),
    rawUniqueMakers,
    entityAdjustedMakers,
    entityIndependenceRatio: safeDivide(entityAdjustedMakers, rawUniqueMakers),
    volumePerEntityUsd: safeDivide(totalVolumeUsd, entityAdjustedMakers),
    newAcquiringWallets,
    holderCountStart,
    holderCountEnd,
    holderGrowthRate:
      holderCountStart === null || holderCountEnd === null
        ? null
        : safeDivide(
            safeArithmetic(holderCountEnd - holderCountStart),
            holderCountStart,
          ),
    medianTradeUsd,
  });
}

function normalizeProvenance(item, index, cutoff, cutoffSlot) {
  item = record(item, `provenance[${index}]`);
  rejectUnknownFields(item, PROVENANCE_FIELDS, `provenance[${index}]`);

  const observedAt = timestamp(item.observedAt, `provenance[${index}].observedAt`);
  if (new Date(observedAt) > new Date(cutoff)) {
    throw new TypeError(`provenance[${index}] is later than the decision cutoff`);
  }

  const eventTime =
    item.eventTime === undefined || item.eventTime === null
      ? null
      : timestamp(item.eventTime, `provenance[${index}].eventTime`);
  if (eventTime !== null && new Date(eventTime) > new Date(cutoff)) {
    throw new TypeError(`provenance[${index}] event time is later than the decision cutoff`);
  }
  if (eventTime !== null && new Date(eventTime) > new Date(observedAt)) {
    throw new TypeError(`provenance[${index}] event time is later than its observation time`);
  }

  const slot = finiteNumber(item.slot, `provenance[${index}].slot`, {
    integer: true,
  });
  if (slot !== null && cutoffSlot !== null && slot > cutoffSlot) {
    throw new TypeError(`provenance[${index}] slot is later than the cutoff slot`);
  }

  if (!PROVENANCE_KINDS.has(item.kind)) {
    throw new TypeError(`provenance[${index}].kind is invalid`);
  }
  if (item.kind === "ON_CHAIN_FACT" && slot === null) {
    throw new TypeError(`provenance[${index}].slot is required for on-chain facts`);
  }

  const confidence = ratio(item.confidence, `provenance[${index}].confidence`);
  if (item.kind === "MODEL_INFERENCE" && confidence === null) {
    throw new TypeError(
      `provenance[${index}].confidence is required for model inference`,
    );
  }

  return Object.freeze({
    field: requiredText(item.field, `provenance[${index}].field`),
    source: requiredText(item.source, `provenance[${index}].source`),
    sourceMethodVersion: requiredText(
      item.sourceMethodVersion,
      `provenance[${index}].sourceMethodVersion`,
    ),
    kind: item.kind,
    observedAt,
    eventTime,
    slot,
    confidence,
  });
}

function normalizeLaunchCohort(cohort, index, cutoffSlot) {
  const label = `ownership.launchCohorts[${index}]`;
  cohort = record(cohort, label);
  rejectUnknownFields(cohort, LAUNCH_COHORT_FIELDS, label);

  if (!LAUNCH_COHORT_METHODS.includes(cohort.method)) {
    throw new TypeError(`${label}.method is invalid`);
  }

  const componentMethods =
    cohort.componentMethods === undefined || cohort.componentMethods === null
      ? null
      : array(cohort.componentMethods, `${label}.componentMethods`).map(
          (method, componentIndex) => {
            if (
              ![
                "same_slot_candidate",
                "exact_jito_bundle",
                "funding_linked_cluster",
              ].includes(method)
            ) {
              throw new TypeError(
                `${label}.componentMethods[${componentIndex}] is invalid`,
              );
            }
            return method;
          },
        );
  const overlapEvidenceRef = optionalText(
    cohort.overlapEvidenceRef,
    `${label}.overlapEvidenceRef`,
  );
  if (cohort.method === "union_model") {
    if (
      componentMethods === null ||
      componentMethods.length < 2 ||
      new Set(componentMethods).size !== componentMethods.length ||
      overlapEvidenceRef === null
    ) {
      throw new TypeError(
        `${label} union model requires distinct component methods and overlap evidence`,
      );
    }
  } else if (componentMethods !== null || overlapEvidenceRef !== null) {
    throw new TypeError(
      `${label} component and overlap fields are only valid for a union model`,
    );
  }

  const bundleId = cohort.bundleId
    ? requiredText(cohort.bundleId, `${label}.bundleId`)
    : null;
  const landingSlot = finiteNumber(
    cohort.landingSlot,
    `${label}.landingSlot`,
    { integer: true },
  );
  const transactionSignatures =
    cohort.transactionSignatures === undefined ||
    cohort.transactionSignatures === null
      ? null
      : array(cohort.transactionSignatures, `${label}.transactionSignatures`).map(
          (signature, signatureIndex) =>
            requiredText(
              signature,
              `${label}.transactionSignatures[${signatureIndex}]`,
            ),
        );
  if (cohort.method === "exact_jito_bundle") {
    if (
      bundleId === null ||
      cohort.bundleStatus !== "landed" ||
      landingSlot === null ||
      transactionSignatures === null ||
      transactionSignatures.length < 1 ||
      transactionSignatures.length > 5 ||
      new Set(transactionSignatures).size !== transactionSignatures.length ||
      cohort.containsLaunchActivity !== true ||
      cohort.containsBuyActivity !== true
    ) {
      throw new TypeError(
        `${label} requires landed Jito evidence, 1-5 unique signatures, and launch-plus-buy activity`,
      );
    }
    if (landingSlot > cutoffSlot) {
      throw new TypeError(`${label}.landingSlot is later than the cutoff slot`);
    }
  } else if (
    bundleId !== null ||
    cohort.bundleStatus !== undefined ||
    landingSlot !== null ||
    transactionSignatures !== null ||
    cohort.containsLaunchActivity !== undefined ||
    cohort.containsBuyActivity !== undefined
  ) {
    throw new TypeError(
      `${label} Jito fields are only valid for exact landed-bundle evidence`,
    );
  }

  const initialSupplyShare = ratio(
    cohort.initialSupplyShare,
    `${label}.initialSupplyShare`,
  );
  const retainedSupplyShare = ratio(
    cohort.retainedSupplyShare,
    `${label}.retainedSupplyShare`,
  );
  const tradingVolumeShare = ratio(
    cohort.tradingVolumeShare,
    `${label}.tradingVolumeShare`,
  );
  return Object.freeze({
    method: cohort.method,
    methodVersion: requiredText(cohort.methodVersion, `${label}.methodVersion`),
    source: requiredText(cohort.source, `${label}.source`),
    bundleId,
    bundleStatus: cohort.method === "exact_jito_bundle" ? "landed" : null,
    landingSlot,
    transactionSignatures:
      transactionSignatures === null
        ? null
        : Object.freeze(transactionSignatures),
    containsLaunchActivity:
      cohort.method === "exact_jito_bundle" ? true : null,
    containsBuyActivity:
      cohort.method === "exact_jito_bundle" ? true : null,
    componentMethods:
      componentMethods === null ? null : Object.freeze(componentMethods),
    overlapEvidenceRef,
    walletCount: finiteNumber(cohort.walletCount, `${label}.walletCount`, {
      integer: true,
    }),
    initialSupplyShare,
    retainedSupplyShare,
    retentionRatio: safeDivide(retainedSupplyShare, initialSupplyShare),
    tradingVolumeShare,
  });
}

function normalizeProviderLabel(label, index) {
  const path = `providerLabels[${index}]`;
  label = record(label, path);
  rejectUnknownFields(label, PROVIDER_LABEL_FIELDS, path);

  const source = requiredText(label.source, `${path}.source`);
  const field = requiredText(label.field, `${path}.field`);
  const denominator = label.denominator ?? "unspecified";
  if (!PROVIDER_RATIO_DENOMINATORS.includes(denominator)) {
    throw new TypeError(`${path}.denominator is invalid`);
  }
  const expectedDenominator = new Map([
    ["gmgn:bundler_rate", "unspecified"],
    ["gmgn:bundler_trader_amount_rate", "trading_volume"],
  ]).get(`${source}:${field}`);
  if (expectedDenominator && denominator !== expectedDenominator) {
    throw new TypeError(`${path}.denominator contradicts the provider field`);
  }
  const value = ratio(label.value, `${path}.value`);
  if (value === null) {
    throw new TypeError(`${path}.value is required`);
  }

  return Object.freeze({
    source,
    field,
    methodVersion: requiredText(
      label.methodVersion,
      `${path}.methodVersion`,
    ),
    value,
    denominator,
  });
}

function populatedPaths(prefix, value, fieldNames) {
  return fieldNames
    .filter((field) => value[field] !== null)
    .map((field) => `${prefix}.${field}`);
}

function requiredProvenancePaths({
  venueStage,
  aggregationScope,
  pairAddress,
  venue,
  windows,
  market,
  ownership,
  social,
  providerLabels,
}) {
  const paths = [];

  if (venueStage !== "unknown") paths.push("venueStage");
  if (aggregationScope !== "unknown") paths.push("aggregationScope");
  if (pairAddress !== null) paths.push("pairAddress");
  paths.push(...populatedPaths("venue", venue, VENUE_INPUT_FIELDS));

  for (const window of TRAFFIC_WINDOWS) {
    paths.push(
      ...populatedPaths(`windows.${window}`, windows[window], WINDOW_INPUT_FIELDS),
    );
  }

  paths.push(...populatedPaths("market", market, MARKET_INPUT_FIELDS));
  if (market.marketCapDefinition !== "unknown") {
    paths.push("market.marketCapDefinition");
  }
  paths.push(...populatedPaths("ownership", ownership, OWNERSHIP_INPUT_FIELDS));
  if (ownership.launchCohorts !== null) {
    ownership.launchCohorts.forEach((_, index) => {
      paths.push(`ownership.launchCohorts[${index}]`);
    });
  }
  paths.push(...populatedPaths("social", social, SOCIAL_INPUT_FIELDS));
  if (providerLabels !== null) {
    providerLabels.forEach((_, index) => paths.push(`providerLabels[${index}]`));
  }

  return paths;
}

function validateProvenanceCoverage(requiredPaths, provenance, {
  venueStage,
  ownership,
  providerLabels,
}) {
  const allowedPaths = new Set([...requiredPaths, "cutoffSlot"]);
  for (const item of provenance) {
    if (!allowedPaths.has(item.field)) {
      throw new TypeError(`provenance field ${item.field} is not a raw snapshot field`);
    }
  }

  for (const path of requiredPaths) {
    if (
      !provenance.some(
        (item) => item.field === path && item.kind !== "UNKNOWN",
      )
    ) {
      throw new TypeError(`missing point-in-time provenance for ${path}`);
    }
  }

  if (
    venueStage !== "unknown" &&
    !provenance.some(
      (item) => item.field === "venueStage" && item.kind === "ON_CHAIN_FACT",
    )
  ) {
    throw new TypeError("venueStage requires canonical on-chain provenance");
  }

  if (ownership.launchCohorts !== null) {
    const requiredKind = new Map([
      ["same_slot_candidate", "ON_CHAIN_FACT"],
      ["exact_jito_bundle", "PROVIDER_OBSERVATION"],
      ["funding_linked_cluster", "MODEL_INFERENCE"],
      ["union_model", "MODEL_INFERENCE"],
    ]);
    ownership.launchCohorts.forEach((cohort, index) => {
      if (
        !provenance.some(
          (item) =>
            item.field === `ownership.launchCohorts[${index}]` &&
            item.source === cohort.source &&
            item.kind === requiredKind.get(cohort.method),
        )
      ) {
        throw new TypeError(
          `ownership.launchCohorts[${index}] requires matching ${cohort.method} provenance`,
        );
      }
    });
  }

  if (providerLabels !== null) {
    providerLabels.forEach((label, index) => {
      if (
        !provenance.some(
          (item) =>
            item.field === `providerLabels[${index}]` &&
            item.kind === "PROVIDER_LABEL" &&
            item.source === label.source,
        )
      ) {
        throw new TypeError(
          `providerLabels[${index}] requires matching provider-label provenance`,
        );
      }
    });
  }
}

export function createTrafficSnapshot(input) {
  input = record(input, "snapshot");
  rejectUnknownFields(input, TOP_LEVEL_FIELDS, "snapshot");
  let {
    chain = "solana",
    mint,
    observedAt,
    decisionCutoff = observedAt,
    cutoffSlot,
    venueStage = "unknown",
    aggregationScope = "unknown",
    pairAddress = null,
    venue = {},
    windows = {},
    market = {},
    ownership = {},
    social = {},
    providerLabels = null,
    provenance = [],
  } = input;
  venue = record(venue, "venue");
  windows = record(windows, "windows");
  market = record(market, "market");
  ownership = record(ownership, "ownership");
  social = record(social, "social");
  rejectUnknownFields(venue, VENUE_INPUT_FIELDS, "venue");
  rejectUnknownFields(market, MARKET_SECTION_FIELDS, "market");
  rejectUnknownFields(ownership, OWNERSHIP_SECTION_FIELDS, "ownership");
  rejectUnknownFields(social, SOCIAL_INPUT_FIELDS, "social");
  provenance = array(provenance, "provenance");
  if (providerLabels !== null) {
    providerLabels = array(providerLabels, "providerLabels");
  }
  if (ownership.launchCohorts !== undefined && ownership.launchCohorts !== null) {
    array(ownership.launchCohorts, "ownership.launchCohorts");
  }

  if (!VENUE_STAGES.includes(venueStage)) {
    throw new TypeError("venueStage is invalid");
  }
  if (!AGGREGATION_SCOPES.includes(aggregationScope)) {
    throw new TypeError("aggregationScope is invalid");
  }
  const normalizedPairAddress = optionalText(pairAddress, "pairAddress");
  if (aggregationScope === "pair" && normalizedPairAddress === null) {
    throw new TypeError("pairAddress is required for pair aggregation");
  }
  if (aggregationScope !== "pair" && normalizedPairAddress !== null) {
    throw new TypeError("pairAddress is only valid for pair aggregation");
  }

  const normalizedObservedAt = timestamp(observedAt, "observedAt");
  const normalizedCutoff = timestamp(decisionCutoff, "decisionCutoff");
  if (new Date(normalizedObservedAt) > new Date(normalizedCutoff)) {
    throw new TypeError("observedAt cannot be later than decisionCutoff");
  }
  const normalizedCutoffSlot = finiteNumber(cutoffSlot, "cutoffSlot", {
    integer: true,
  });
  if (normalizedCutoffSlot === null) {
    throw new TypeError("cutoffSlot is required for a Solana traffic snapshot");
  }

  const normalizedChain = requiredText(chain, "chain");
  if (normalizedChain !== "solana") {
    throw new TypeError("chain must use the canonical solana identifier");
  }

  const unknownWindow = Object.keys(windows).find(
    (window) => !TRAFFIC_WINDOWS.includes(window),
  );
  if (unknownWindow) {
    throw new TypeError(`Unsupported traffic window ${unknownWindow}`);
  }

  const normalizedWindows = Object.fromEntries(
    TRAFFIC_WINDOWS.map((window) => [
      window,
      normalizeWindow(windows[window], `windows.${window}`),
    ]),
  );

  const normalizedVenue = Object.freeze({
    programId: optionalText(venue.programId, "venue.programId"),
    programVersion: optionalText(
      venue.programVersion,
      "venue.programVersion",
    ),
    configAddress: optionalText(venue.configAddress, "venue.configAddress"),
    quoteMint: optionalText(venue.quoteMint, "venue.quoteMint"),
    curveProgressRatio: ratio(
      venue.curveProgressRatio,
      "venue.curveProgressRatio",
    ),
    canonicalPoolAddress: optionalText(
      venue.canonicalPoolAddress,
      "venue.canonicalPoolAddress",
    ),
  });

  const liquidityUsd = finiteNumber(market.liquidityUsd, "market.liquidityUsd");
  const marketCapUsd = finiteNumber(market.marketCapUsd, "market.marketCapUsd");
  const marketCapDefinition = market.marketCapDefinition ?? "unknown";
  if (!MARKET_CAP_DEFINITIONS.includes(marketCapDefinition)) {
    throw new TypeError("market.marketCapDefinition is invalid");
  }
  if (marketCapUsd !== null && marketCapDefinition === "unknown") {
    throw new TypeError(
      "market.marketCapDefinition is required when marketCapUsd is present",
    );
  }
  if (liquidityUsd !== null && aggregationScope === "unknown") {
    throw new TypeError(
      "aggregationScope is required when market.liquidityUsd is present",
    );
  }
  const executableBuyImpactBps = finiteNumber(
    market.executableBuyImpactBps,
    "market.executableBuyImpactBps",
  );
  const executableSellImpactBps = finiteNumber(
    market.executableSellImpactBps,
    "market.executableSellImpactBps",
  );
  const quoteNotionalUsd = finiteNumber(
    market.quoteNotionalUsd,
    "market.quoteNotionalUsd",
  );
  if (
    (executableBuyImpactBps !== null || executableSellImpactBps !== null) &&
    (quoteNotionalUsd === null || quoteNotionalUsd === 0)
  ) {
    throw new TypeError(
      "market.quoteNotionalUsd must be positive when executable impact is present",
    );
  }
  const normalizedMarket = Object.freeze({
    liquidityUsd,
    marketCapUsd,
    marketCapDefinition,
    fullyDilutedValueUsd: finiteNumber(
      market.fullyDilutedValueUsd,
      "market.fullyDilutedValueUsd",
    ),
    liquidityToMarketCap: safeDivide(liquidityUsd, marketCapUsd),
    executableBuyImpactBps,
    executableSellImpactBps,
    quoteNotionalUsd,
  });

  const normalizedLaunchCohorts =
    ownership.launchCohorts === undefined || ownership.launchCohorts === null
      ? null
      : Object.freeze(
          ownership.launchCohorts.map((cohort, index) =>
            normalizeLaunchCohort(cohort, index, normalizedCutoffSlot),
          ),
        );
  const normalizedOwnership = Object.freeze({
    holderCount: finiteNumber(ownership.holderCount, "ownership.holderCount", {
      integer: true,
    }),
    top10RawShare: ratio(ownership.top10RawShare, "ownership.top10RawShare"),
    top10EntityAdjustedShare: ratio(
      ownership.top10EntityAdjustedShare,
      "ownership.top10EntityAdjustedShare",
    ),
    creatorShare: ratio(ownership.creatorShare, "ownership.creatorShare"),
    earlyClusterShare: ratio(
      ownership.earlyClusterShare,
      "ownership.earlyClusterShare",
    ),
    launchCohorts: normalizedLaunchCohorts,
  });

  const mentionCount3h = finiteNumber(
    social.mentionCount3h,
    "social.mentionCount3h",
    { integer: true },
  );
  const uniqueAuthors3h = finiteNumber(
    social.uniqueAuthors3h,
    "social.uniqueAuthors3h",
    { integer: true },
  );
  if (
    mentionCount3h !== null &&
    uniqueAuthors3h !== null &&
    uniqueAuthors3h > mentionCount3h
  ) {
    throw new TypeError("social.uniqueAuthors3h cannot exceed mentionCount3h");
  }
  const holderAuthors3h = finiteNumber(
    social.holderAuthors3h,
    "social.holderAuthors3h",
    { integer: true },
  );
  if (
    uniqueAuthors3h !== null &&
    holderAuthors3h !== null &&
    holderAuthors3h > uniqueAuthors3h
  ) {
    throw new TypeError("social.holderAuthors3h cannot exceed uniqueAuthors3h");
  }

  const normalizedSocial = Object.freeze({
    mentionCount3h,
    uniqueAuthors3h,
    uniqueAuthorShare: safeDivide(uniqueAuthors3h, mentionCount3h),
    holderAuthors3h,
    sourceCommunities3h: finiteNumber(
      social.sourceCommunities3h,
      "social.sourceCommunities3h",
      { integer: true },
    ),
    mentionVelocityVsPrior3h: signedFiniteNumber(
      social.mentionVelocityVsPrior3h,
      "social.mentionVelocityVsPrior3h",
    ),
    botSuspectedAuthorShare: ratio(
      social.botSuspectedAuthorShare,
      "social.botSuspectedAuthorShare",
    ),
  });
  const normalizedProviderLabels =
    providerLabels === null
      ? null
      : Object.freeze(
          providerLabels.map((label, index) =>
            normalizeProviderLabel(label, index),
          ),
        );
  const normalizedProvenance = Object.freeze(
    provenance.map((item, index) =>
      normalizeProvenance(
        item,
        index,
        normalizedCutoff,
        normalizedCutoffSlot,
      ),
    ),
  );
  const provenancePaths = requiredProvenancePaths({
    venueStage,
    aggregationScope,
    pairAddress: normalizedPairAddress,
    venue: normalizedVenue,
    windows: normalizedWindows,
    market: normalizedMarket,
    ownership: normalizedOwnership,
    social: normalizedSocial,
    providerLabels: normalizedProviderLabels,
  });
  validateProvenanceCoverage(provenancePaths, normalizedProvenance, {
    venueStage,
    ownership: normalizedOwnership,
    providerLabels: normalizedProviderLabels,
  });

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    projectStatus: "LIVE_LOCKED",
    runtimeAuthority: false,
    chain: normalizedChain,
    mint: requiredText(mint, "mint"),
    observedAt: normalizedObservedAt,
    decisionCutoff: normalizedCutoff,
    cutoffSlot: normalizedCutoffSlot,
    venueStage,
    aggregationScope,
    pairAddress: normalizedPairAddress,
    venue: normalizedVenue,
    windows: Object.freeze(normalizedWindows),
    market: normalizedMarket,
    ownership: normalizedOwnership,
    social: normalizedSocial,
    providerLabels: normalizedProviderLabels,
    provenance: normalizedProvenance,
  });
}
