import { createDailyRequestBudget } from "../runtime/daily-request-budget.mjs";
import {
  readBirdeyeCandidateEvidence,
  readBirdeyePrice,
} from "../../integrations/birdeye/token-evidence.mjs";
import {
  readGmgnCandidateEvidence,
  readGmgnPrice,
} from "../../integrations/gmgn/token-evidence.mjs";

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 300) : "provider request failed";
}

function providerResult(provider, result) {
  if (result.status === "fulfilled") {
    return Object.freeze({
      provider,
      ok: true,
      observation: result.value.observation,
      capabilities: result.value.capabilities,
      partialErrors: result.value.partialErrors,
      error: null,
      runtimeAuthority: false,
    });
  }
  return Object.freeze({
    provider,
    ok: false,
    observation: null,
    capabilities: Object.freeze([]),
    partialErrors: Object.freeze([]),
    error: safeError(result.reason),
    errorCode: typeof result.reason?.code === "string" ? result.reason.code : "unknown",
    runtimeAuthority: false,
  });
}

function firstMetric(results, section, field) {
  for (const provider of ["birdeye", "gmgn"]) {
    const observation = results.find((result) => result.provider === provider && result.ok)
      ?.observation;
    const value = observation?.[section]?.[field];
    if (Number.isFinite(value)) return Object.freeze({ value, provider });
  }
  return Object.freeze({ value: null, provider: null });
}

function firstBoolean(results, section, field) {
  for (const provider of ["birdeye", "gmgn"]) {
    const observation = results.find((result) => result.provider === provider && result.ok)
      ?.observation;
    const value = observation?.[section]?.[field];
    if (typeof value === "boolean") return Object.freeze({ value, provider });
  }
  return Object.freeze({ value: null, provider: null });
}

function marketSummary(results) {
  const price = firstMetric(results, "market", "priceUsd");
  const liquidity = firstMetric(results, "market", "liquidityUsd");
  const marketCap = firstMetric(results, "market", "marketCapUsd");
  const volume = firstMetric(results, "market", "volumeUsd");
  const holders = firstMetric(results, "ownership", "holderCount");
  const top10 = firstMetric(results, "ownership", "top10HolderShare");
  const smartMoney = firstMetric(results, "behavior", "smartMoneyParticipants");
  const notable = firstMetric(results, "behavior", "notableWalletParticipants");
  const bundledTrading = firstMetric(
    results,
    "behavior",
    "providerBundledTradingVolumeShare",
  );
  const mintAuthorityRenounced = firstBoolean(
    results,
    "riskEvidence",
    "mintAuthorityRenounced",
  );
  const freezeAuthorityRenounced = firstBoolean(
    results,
    "riskEvidence",
    "freezeAuthorityRenounced",
  );
  const rugRatio = firstMetric(results, "riskEvidence", "providerRugRatio");
  return Object.freeze({
    priceUsd: price.value,
    priceProvider: price.provider,
    liquidityUsd: liquidity.value,
    liquidityProvider: liquidity.provider,
    marketCapUsd: marketCap.value,
    marketCapProvider: marketCap.provider,
    volumeUsd: volume.value,
    volumeProvider: volume.provider,
    holderCount: holders.value,
    holderProvider: holders.provider,
    top10HolderShare: top10.value,
    top10HolderProvider: top10.provider,
    smartMoneyParticipants: smartMoney.value,
    smartMoneyProvider: smartMoney.provider,
    notableWalletParticipants: notable.value,
    notableWalletProvider: notable.provider,
    providerBundledTradingVolumeShare: bundledTrading.value,
    bundledTradingProvider: bundledTrading.provider,
    mintAuthorityRenounced: mintAuthorityRenounced.value,
    mintAuthorityProvider: mintAuthorityRenounced.provider,
    freezeAuthorityRenounced: freezeAuthorityRenounced.value,
    freezeAuthorityProvider: freezeAuthorityRenounced.provider,
    providerRugRatio: rugRatio.value,
    rugRatioProvider: rugRatio.provider,
    runtimeAuthority: false,
  });
}

export function createCandidateProviderEnricher({
  config,
  fetchImpl = fetch,
  clock = () => new Date(),
  createBudgetImpl = createDailyRequestBudget,
  readBirdeyeCandidateImpl = readBirdeyeCandidateEvidence,
  readBirdeyePriceImpl = readBirdeyePrice,
  readGmgnCandidateImpl = readGmgnCandidateEvidence,
  readGmgnPriceImpl = readGmgnPrice,
} = {}) {
  if (!config) throw new TypeError("provider enrichment config is required");
  const budgets = {};
  const readiness = {};
  if (config.birdeyeApiKey) {
    budgets.birdeye = createBudgetImpl({
      provider: "birdeye",
      dailyLimit: config.birdeyeDailyRequestLimit,
      reserve: config.birdeyeDailyRequestReserve,
      statePath: config.birdeyeBudgetStatePath,
      clock,
    });
  }
  if (config.gmgnApiKey) {
    budgets.gmgn = createBudgetImpl({
      provider: "gmgn",
      dailyLimit: config.gmgnDailyRequestLimit,
      reserve: config.gmgnDailyRequestReserve,
      statePath: config.gmgnBudgetStatePath,
      clock,
    });
  }

  const state = {
    configuredProviders: Object.freeze(Object.keys(budgets)),
    evidenceRequests: 0,
    priceRequests: 0,
    successfulEvidenceRequests: 0,
    successfulPriceRequests: 0,
    lastEvidenceAt: null,
    lastPriceAt: null,
  };

  async function start() {
    await Promise.all(Object.entries(budgets).map(async ([provider, budget]) => {
      try {
        await budget.ready();
        readiness[provider] = Object.freeze({ ok: true, error: null });
      } catch (error) {
        readiness[provider] = Object.freeze({ ok: false, error: safeError(error) });
      }
    }));
    return snapshot();
  }

  async function enrich({ mint, signal } = {}) {
    if (typeof mint !== "string" || mint.trim() === "") {
      throw new TypeError("candidate mint is required");
    }
    state.evidenceRequests += 1;
    const tasks = [];
    const providers = [];
    if (readiness.birdeye?.ok) {
      providers.push("birdeye");
      tasks.push(readBirdeyeCandidateImpl({
        apiKey: config.birdeyeApiKey,
        mint,
        budget: budgets.birdeye,
        fetchImpl,
        signal,
        timeoutMs: config.candidateProviderTimeoutMs,
        now: clock,
      }));
    }
    if (readiness.gmgn?.ok) {
      providers.push("gmgn");
      tasks.push(readGmgnCandidateImpl({
        apiKey: config.gmgnApiKey,
        mint,
        budget: budgets.gmgn,
        signal,
        timeoutMs: config.candidateProviderTimeoutMs,
        now: clock,
      }));
    }
    const settled = await Promise.allSettled(tasks);
    const results = Object.freeze(settled.map((result, index) =>
      providerResult(providers[index], result),
    ));
    if (results.some((result) => result.ok)) {
      state.successfulEvidenceRequests += 1;
      state.lastEvidenceAt = new Date(clock()).toISOString();
    }
    return Object.freeze({
      schemaVersion: 1,
      observedAt: new Date(clock()).toISOString(),
      mint: mint.trim(),
      providers: results,
      market: marketSummary(results),
      runtimeAuthority: false,
    });
  }

  async function readPrice({ mint, signal } = {}) {
    state.priceRequests += 1;
    const attempts = [];
    if (readiness.birdeye?.ok) {
      try {
        const result = await readBirdeyePriceImpl({
          apiKey: config.birdeyeApiKey,
          mint,
          budget: budgets.birdeye,
          fetchImpl,
          signal,
          timeoutMs: config.candidateProviderTimeoutMs,
          now: clock,
        });
        state.successfulPriceRequests += 1;
        state.lastPriceAt = result.observedAt;
        return result;
      } catch (error) {
        if (signal?.aborted) throw error;
        attempts.push(`Birdeye: ${safeError(error)}`);
      }
    }
    if (readiness.gmgn?.ok) {
      try {
        const result = await readGmgnPriceImpl({
          apiKey: config.gmgnApiKey,
          mint,
          budget: budgets.gmgn,
          signal,
          timeoutMs: config.candidateProviderTimeoutMs,
          now: clock,
        });
        state.successfulPriceRequests += 1;
        state.lastPriceAt = result.observedAt;
        return result;
      } catch (error) {
        if (signal?.aborted) throw error;
        attempts.push(`GMGN: ${safeError(error)}`);
      }
    }
    const error = new Error(attempts.join("; ") || "no price provider is available");
    error.code = "price_providers_unavailable";
    throw error;
  }

  function snapshot() {
    return Object.freeze({
      ...state,
      providerReadiness: Object.freeze({ ...readiness }),
      budgets: Object.freeze(Object.fromEntries(
        Object.entries(budgets).map(([provider, budget]) => [provider, budget.snapshot()]),
      )),
      runtimeAuthority: false,
    });
  }

  async function stop() {
    await Promise.all(Object.values(budgets).map((budget) => budget.flush()));
  }

  return Object.freeze({ start, enrich, readPrice, snapshot, stop });
}
