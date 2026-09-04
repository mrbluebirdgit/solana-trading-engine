function assertFinite(policy, path, { minimum = 0, maximum = Infinity } = {}) {
  const value = path.split(".").reduce((current, key) => current?.[key], policy);

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(
      `${path} must be a finite number between ${minimum} and ${maximum}`,
    );
  }

  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new TypeError("policy must be an object");
  }

  if (policy.policyVersion !== "1.0.0") {
    throw new TypeError("policyVersion must be 1.0.0");
  }

  if (policy.chain !== "solana") {
    throw new TypeError("chain must be solana");
  }

  if (policy.operatingMode?.liveTrading !== false) {
    throw new TypeError("live trading must remain disabled in policy v1");
  }

  if (policy.operatingMode?.failClosed !== true) {
    throw new TypeError("policy must fail closed");
  }

  if (
    policy.operatingMode?.explicitActivationPhrase !== "ENABLE LIVE TRADING"
  ) {
    throw new TypeError("explicit live-trading activation phrase is required");
  }

  const initialPosition = assertFinite(
    policy,
    "portfolioRisk.initialPositionPercentOfTradingBankroll",
    { maximum: 100 },
  );
  const maximumPosition = assertFinite(
    policy,
    "portfolioRisk.maximumSinglePositionPercentOfTradingBankroll",
    { maximum: 100 },
  );
  const maximumExposure = assertFinite(
    policy,
    "portfolioRisk.maximumTotalExposurePercentOfTradingBankroll",
    { maximum: 100 },
  );

  if (initialPosition > maximumPosition || maximumPosition > maximumExposure) {
    throw new TypeError(
      "position limits must satisfy initial <= single-position <= total exposure",
    );
  }

  for (const path of [
    "alerts.minimumSingleBuyUsd",
    "freshnessAndExecution.maximumSignalDataAgeSeconds",
    "freshnessAndExecution.maximumCopyPriceMovePercent",
    "freshnessAndExecution.maximumPriceImpactPercent",
    "freshnessAndExecution.maximumSlippagePercent",
    "portfolioRisk.maximumOpenPositions",
    "portfolioRisk.dailyLossKillSwitchPercent",
    "portfolioRisk.weeklyLossKillSwitchPercent",
    "portfolioRisk.maximumConsecutiveLossesBeforePause",
    "discovery.volumeAccelerationMinimumMultiple",
    "discovery.holderGrowthMinimumPercent24h",
    "tokenSafety.minimumIndependentDataSources",
    "tokenSafety.graduated.minimumLiquiditySol",
    "tokenSafety.graduated.maximumTop10HolderPercent",
    "tokenSafety.graduated.maximumBundlerOrRelatedEarlyHolderPercent",
    "tokenSafety.graduated.maximumMarketCapUsdForEarlyGrowth",
    "tokenSafety.graduated.minimumIndependentTierAEntitiesForAutoExecution",
    "paperAcceptance.minimumCompletedEligibleSignals",
    "paperAcceptance.minimumCalendarDays"
  ]) {
    assertFinite(policy, path);
  }

  const weights = Object.values(policy.entityScoring?.weights ?? {});

  if (
    weights.length !== 7 ||
    weights.some((weight) => !Number.isFinite(weight) || weight < 0) ||
    weights.reduce((total, weight) => total + weight, 0) !== 100
  ) {
    throw new TypeError("entity scoring weights must contain 7 values totaling 100");
  }

  for (const path of [
    "portfolioRisk.noLeverage",
    "portfolioRisk.noBorrowing",
    "portfolioRisk.noAveragingDown",
    "portfolioRisk.noMartingale",
    "signerSecurity.dedicatedBalanceCappedWalletOnly",
    "signerSecurity.mainWalletForbidden",
    "signerSecurity.allowlistedProgramsAndTransactionShapesOnly",
    "signerSecurity.arbitraryTransfersForbidden",
    "signerSecurity.deterministicCodeEnforcesEveryTradeGate",
    "signerSecurity.modelExcludedFromSigningPath"
  ]) {
    const value = path.split(".").reduce((current, key) => current?.[key], policy);
    if (value !== true) {
      throw new TypeError(`${path} must remain enabled`);
    }
  }

  return deepFreeze(policy);
}

export function parsePolicy(source) {
  let policy;

  try {
    policy = JSON.parse(source);
  } catch {
    throw new TypeError("policy file must remain JSON-compatible YAML");
  }

  return validatePolicy(policy);
}
