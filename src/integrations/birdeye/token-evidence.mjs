import { createTokenObservation } from "../../core/intelligence/token-observation.mjs";

const BASE_URL = "https://public-api.birdeye.so";

function optionalNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function optionalInteger(...values) {
  const value = optionalNumber(...values);
  return value !== null && Number.isSafeInteger(value) ? value : null;
}

function optionalText(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "")?.trim() ?? null;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function share(value) {
  const number = optionalNumber(value);
  if (number === null || number < 0) return null;
  if (number <= 1) return number;
  return number <= 100 ? number / 100 : null;
}

function retryAfterMilliseconds(response, now = new Date()) {
  const raw = response?.headers?.get?.("retry-after");
  if (typeof raw !== "string" || raw.trim() === "") return 15 * 60 * 1_000;
  if (/^\d+$/.test(raw.trim())) return Math.max(1_000, Number(raw.trim()) * 1_000);
  const retryAt = new Date(raw).valueOf();
  const nowMs = new Date(now).valueOf();
  return Number.isFinite(retryAt) && retryAt > nowMs
    ? retryAt - nowMs
    : 15 * 60 * 1_000;
}

function providerError(message, { code, status = null } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function applyBackoff(budget, options) {
  if (typeof budget?.backoff === "function") {
    await budget.backoff(options);
  } else if (typeof budget?.blockFor === "function") {
    await budget.blockFor(options.retryAfterMs ?? options.baseMs);
  }
}

async function requestBirdeye(pathname, {
  apiKey,
  mint,
  budget,
  fetchImpl = fetch,
  signal: externalSignal,
  timeoutMs = 6_000,
  now = () => new Date(),
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("Birdeye API key is required");
  }
  if (typeof mint !== "string" || mint.trim() === "") {
    throw new TypeError("Birdeye mint is required");
  }
  const permit = await budget.take();
  if (!permit.ok) {
    throw providerError(`Birdeye ${permit.reason.replaceAll("_", " ")}`, {
      code: permit.reason,
    });
  }

  const endpoint = new URL(pathname, BASE_URL);
  endpoint.searchParams.set("address", mint.trim());
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: {
        accept: "application/json",
        "X-API-KEY": apiKey.trim(),
        "x-chain": "solana",
      },
      signal,
    });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    await applyBackoff(budget, { baseMs: 30_000, maximumMs: 15 * 60 * 1_000 });
    if (timeoutSignal.aborted) {
      throw providerError("Birdeye request timed out", { code: "timeout" });
    }
    throw providerError("Birdeye request could not be completed", { code: "network" });
  }

  if (!response.ok) {
    if (response.status === 429) {
      await applyBackoff(budget, {
        retryAfterMs: retryAfterMilliseconds(response, now()),
        baseMs: 30_000,
        maximumMs: 24 * 60 * 60 * 1_000,
      });
    } else if (response.status === 401 || response.status === 403) {
      await applyBackoff(budget, {
        retryAfterMs: 24 * 60 * 60 * 1_000,
        baseMs: 24 * 60 * 60 * 1_000,
        maximumMs: 24 * 60 * 60 * 1_000,
      });
    } else if (response.status >= 500) {
      await applyBackoff(budget, {
        baseMs: 30_000,
        maximumMs: 15 * 60 * 1_000,
      });
    }
    const code = response.status === 401 || response.status === 403
      ? "authorization_failed"
      : response.status === 429
        ? "rate_limited"
        : `http_${response.status}`;
    throw providerError(`Birdeye returned HTTP ${response.status}`, {
      code,
      status: response.status,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    await applyBackoff(budget, { baseMs: 30_000, maximumMs: 5 * 60 * 1_000 });
    throw providerError("Birdeye returned malformed JSON", { code: "malformed_response" });
  }
  if (payload?.success !== true || !payload.data || typeof payload.data !== "object") {
    throw providerError("Birdeye response did not contain token data", {
      code: "token_data_unavailable",
    });
  }
  await budget.succeed?.();
  return payload.data;
}

export function normalizeBirdeyeToken({ mint, overview = {}, security = {}, observedAt }) {
  const mintable = optionalBoolean(security.mintable);
  const freezeable = optionalBoolean(security.freezeable);
  return createTokenObservation({
    source: "birdeye",
    sourceMethodVersion: "birdeye-token-overview-security.v1",
    chain: "solana",
    address: mint,
    observedAt,
    identity: {
      name: optionalText(overview.name),
      symbol: optionalText(overview.symbol),
    },
    market: {
      priceUsd: optionalNumber(overview.price),
      liquidityUsd: optionalNumber(overview.liquidity),
      marketCapUsd: optionalNumber(overview.marketCap, overview.mc, overview.fdv),
      volumeUsd: optionalNumber(
        overview.v5mUSD,
        overview.v30mUSD,
        overview.v1hUSD,
        overview.v24hUSD,
      ),
      priceChangePercent: optionalNumber(
        overview.priceChange5mPercent,
        overview.priceChange30mPercent,
        overview.priceChange1hPercent,
      ),
    },
    ownership: {
      holderCount: optionalInteger(overview.holder, overview.holderCount),
      top10HolderShare: share(
        security.top10HolderPercent ?? overview.top10HolderPercent,
      ),
      developerTeamShare: share(
        security.creatorPercentage ?? overview.creatorPercentage,
      ),
    },
    riskEvidence: {
      mintAuthorityRenounced: mintable === null ? null : !mintable,
      freezeAuthorityRenounced: freezeable === null ? null : !freezeable,
    },
  });
}

export async function readBirdeyeCandidateEvidence({
  apiKey,
  mint,
  budget,
  fetchImpl = fetch,
  signal,
  timeoutMs,
  now = () => new Date(),
} = {}) {
  const [overviewResult, securityResult] = await Promise.allSettled([
    requestBirdeye("/defi/token_overview", {
      apiKey,
      mint,
      budget,
      fetchImpl,
      signal,
      timeoutMs,
      now,
    }),
    requestBirdeye("/defi/token_security", {
      apiKey,
      mint,
      budget,
      fetchImpl,
      signal,
      timeoutMs,
      now,
    }),
  ]);
  if (signal?.aborted) throw signal.reason ?? new Error("Birdeye request aborted");
  if (overviewResult.status === "rejected" && securityResult.status === "rejected") {
    throw overviewResult.reason;
  }
  const observedAt = new Date(now()).toISOString();
  const observation = normalizeBirdeyeToken({
    mint,
    overview: overviewResult.status === "fulfilled" ? overviewResult.value : {},
    security: securityResult.status === "fulfilled" ? securityResult.value : {},
    observedAt,
  });
  return Object.freeze({
    provider: "birdeye",
    observation,
    capabilities: Object.freeze([
      ...(overviewResult.status === "fulfilled" ? ["market", "holders"] : []),
      ...(securityResult.status === "fulfilled" ? ["security"] : []),
    ]),
    partialErrors: Object.freeze([
      ...(overviewResult.status === "rejected" ? [overviewResult.reason.message] : []),
      ...(securityResult.status === "rejected" ? [securityResult.reason.message] : []),
    ]),
    runtimeAuthority: false,
  });
}

export async function readBirdeyePrice({
  apiKey,
  mint,
  budget,
  fetchImpl = fetch,
  signal,
  timeoutMs,
  now = () => new Date(),
} = {}) {
  const data = await requestBirdeye("/defi/price", {
    apiKey,
    mint,
    budget,
    fetchImpl,
    signal,
    timeoutMs,
    now,
  });
  const priceUsd = optionalNumber(data.value, data.price);
  if (priceUsd === null || priceUsd <= 0) {
    throw providerError("Birdeye price is unavailable", { code: "price_unavailable" });
  }
  return Object.freeze({
    provider: "birdeye",
    sourceMethodVersion: "birdeye-defi-price.v1",
    mint: mint.trim(),
    priceUsd,
    observedAt: new Date(now()).toISOString(),
    runtimeAuthority: false,
  });
}

export const birdeyeTokenEvidenceConstants = Object.freeze({ baseUrl: BASE_URL });
