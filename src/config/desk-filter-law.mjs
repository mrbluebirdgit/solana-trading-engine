import { readFileSync } from "node:fs";

const LAW_URL = new URL("../../config/desk-filter-law.v1.json", import.meta.url);
const EXPECTED_LAW = Object.freeze({
  schemaVersion: 1,
  lawVersion: "desk-filter-law.v1",
  runtimeMutable: false,
  decisions: ["RISK_KILL", "SCOUT_SKIP", "SCOUT_PASS"],
  authority: {
    mintAuthorityExists: "RISK_KILL",
    freezeAuthorityExists: "RISK_KILL",
    unknownAuthority: "SCOUT_SKIP",
  },
  riskCapsPercent: {
    developer: 5,
    insider: 10,
    bundled: 15,
    fresh: 30,
    snipers: 20,
    rug: 1,
    phishing: 0,
  },
  ignoredFilters: ["botTradingPercent", "telegramCalls"],
  optionalFilters: ["developerBurned"],
  stages: {
    curve: {
      smartMoneyMinimum: 1,
      holdersMinimum: 20,
      top10PercentMaximum: 25,
      marketCapUsdMinimum: 8_000,
      marketCapUsdMaximum: 80_000,
      volume5mUsdMinimum: 5_000,
      netInflow5mUsdMinimum: 0,
      transactions5mMinimum: 40,
      curveFillPercentMinimum: 2,
      curveFillPercentMaximum: 18,
    },
    migrated: {
      smartMoneyMinimum: 2,
      holdersMinimum: 40,
      top10PercentMaximum: 22,
      marketCapUsdMinimum: 25_000,
      marketCapUsdMaximum: 250_000,
      volume5mUsdMinimum: 15_000,
      netInflow5mUsdMinimum: 0,
      transactions5mMinimum: 80,
      migrationAgeMinutesMinimum: 0,
      migrationAgeMinutesMaximum: 12,
    },
  },
  terminalEntry: {
    operatorManaged: true,
    learningBuySolMinimum: 0.05,
    learningBuySolMaximum: 0.15,
    riskClearedBuySolMinimum: 0.3,
    riskClearedBuySolMaximum: 0.5,
    slippagePercent: 15,
    priorityFeeSol: 0.006,
    jitoTipSol: 0.007,
    antiMev: true,
  },
  terminalSites: [
    "https://axiom.trade",
    "https://photon-sol.tinyastro.io",
    "https://gmgn.ai",
  ],
  forbiddenSecretInputs: [
    "AGE_SECRET_KEY",
    "WALLET_PRIVATE_KEY",
    "AXIOM_API_KEY",
    "PHOTON_API_KEY",
  ],
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function loadLaw() {
  const parsed = JSON.parse(readFileSync(LAW_URL, "utf8"));
  if (canonical(parsed) !== canonical(EXPECTED_LAW)) {
    throw new Error(
      "desk filter law does not match its locked source contract; change both only by explicit owner instruction",
    );
  }
  return deepFreeze(parsed);
}

export const DESK_FILTER_LAW = loadLaw();

export const deskFilterLawConstants = Object.freeze({
  lawUrl: LAW_URL,
  expectedLaw: deepFreeze(structuredClone(EXPECTED_LAW)),
});
