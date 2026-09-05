import { createTokenObservation } from "../../core/intelligence/token-observation.mjs";

const BASE_URL = "https://pro-api.solscan.io/v2.0";

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

async function requestSolscan(pathname, {
  apiKey,
  query = {},
  budget,
  fetchImpl = fetch,
  signal: externalSignal,
  timeoutMs = 6_000,
  now = () => new Date(),
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("Solscan API key is required");
  }
  const permit = await budget.take();
  if (!permit.ok) {
    throw providerError(`Solscan ${permit.reason.replaceAll("_", " ")}`, {
      code: permit.reason,
    });
  }

  const endpoint = new URL(pathname.replace(/^\/+/, ""), `${BASE_URL}/`);
  for (const [name, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") {
      endpoint.searchParams.set(name, String(value));
    }
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: {
        accept: "application/json",
        token: apiKey.trim(),
      },
      signal,
    });
  } catch (error) {
    if (externalSignal?.aborted) throw error;
    await applyBackoff(budget, { baseMs: 30_000, maximumMs: 15 * 60 * 1_000 });
    if (timeoutSignal.aborted) {
      throw providerError("Solscan request timed out", { code: "timeout" });
    }
    throw providerError("Solscan request could not be completed", { code: "network" });
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
      await applyBackoff(budget, { baseMs: 30_000, maximumMs: 15 * 60 * 1_000 });
    }
    const code = response.status === 401 || response.status === 403
      ? "authorization_failed"
      : response.status === 429
        ? "rate_limited"
        : `http_${response.status}`;
    throw providerError(`Solscan returned HTTP ${response.status}`, {
      code,
      status: response.status,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    await applyBackoff(budget, { baseMs: 30_000, maximumMs: 5 * 60 * 1_000 });
    throw providerError("Solscan returned malformed JSON", { code: "malformed_response" });
  }
  if (payload?.success !== true || !payload.data || typeof payload.data !== "object") {
    throw providerError("Solscan response did not contain token data", {
      code: "token_data_unavailable",
    });
  }
  await budget.succeed?.();
  return payload.data;
}

function authorityRenounced(value) {
  if (value === undefined) return null;
  if (value === null || value === "") return true;
  if (typeof value === "string") return value.trim() === "";
  return null;
}

export function normalizeSolscanToken({ mint, metadata = {}, holders = {}, observedAt }) {
  const items = Array.isArray(holders.items) ? holders.items : [];
  const holderShares = items.slice(0, 10)
    .map((holder) => share(holder?.percentage))
    .filter((value) => value !== null);
  const top10HolderShare = holderShares.length > 0
    ? holderShares.reduce((sum, value) => sum + value, 0)
    : null;
  return createTokenObservation({
    source: "solscan",
    sourceMethodVersion: "solscan-token-meta-holders.v2",
    chain: "solana",
    address: mint,
    observedAt,
    identity: {
      name: optionalText(metadata.name),
      symbol: optionalText(metadata.symbol),
    },
    market: {
      priceUsd: optionalNumber(metadata.price),
      marketCapUsd: optionalNumber(metadata.market_cap),
      volumeUsd: optionalNumber(metadata.total_dex_vol_24h, metadata.volume_24h),
      priceChangePercent: optionalNumber(metadata.price_change_24h),
    },
    ownership: {
      holderCount: optionalInteger(holders.total, metadata.holder),
      top10HolderShare: top10HolderShare === null ? null : Math.min(1, top10HolderShare),
    },
    riskEvidence: {
      mintAuthorityRenounced: authorityRenounced(metadata.mint_authority),
      freezeAuthorityRenounced: authorityRenounced(metadata.freeze_authority),
    },
    venue: {
      createdAtUnix: optionalInteger(metadata.created_time),
    },
  });
}

export async function readSolscanCandidateEvidence({
  apiKey,
  mint,
  budget,
  fetchImpl = fetch,
  signal,
  timeoutMs,
  now = () => new Date(),
} = {}) {
  if (typeof mint !== "string" || mint.trim() === "") {
    throw new TypeError("Solscan mint is required");
  }
  const address = mint.trim();
  let [metadataResult, holdersResult] = await Promise.allSettled([
    requestSolscan("/token/meta", {
      apiKey,
      query: { address },
      budget,
      fetchImpl,
      signal,
      timeoutMs,
      now,
    }),
    requestSolscan("/token/holders", {
      apiKey,
      query: { address, page: 1, page_size: 10 },
      budget,
      fetchImpl,
      signal,
      timeoutMs,
      now,
    }),
  ]);
  if (signal?.aborted) throw signal.reason ?? new Error("Solscan request aborted");
  if (
    metadataResult.status === "fulfilled" &&
    metadataResult.value.address !== address
  ) {
    metadataResult = {
      status: "rejected",
      reason: providerError("Solscan token response did not match the requested mint", {
        code: "token_data_unavailable",
      }),
    };
  }
  if (metadataResult.status === "rejected" && holdersResult.status === "rejected") {
    throw metadataResult.reason;
  }
  const observation = normalizeSolscanToken({
    mint: address,
    metadata: metadataResult.status === "fulfilled" ? metadataResult.value : {},
    holders: holdersResult.status === "fulfilled" ? holdersResult.value : {},
    observedAt: new Date(now()).toISOString(),
  });
  return Object.freeze({
    provider: "solscan",
    observation,
    capabilities: Object.freeze([
      ...(metadataResult.status === "fulfilled" ? ["market", "security"] : []),
      ...(holdersResult.status === "fulfilled" ? ["holders"] : []),
    ]),
    partialErrors: Object.freeze([
      ...(metadataResult.status === "rejected" ? [metadataResult.reason.message] : []),
      ...(holdersResult.status === "rejected" ? [holdersResult.reason.message] : []),
    ]),
    runtimeAuthority: false,
  });
}

export async function readSolscanPrice({
  apiKey,
  mint,
  budget,
  fetchImpl = fetch,
  signal,
  timeoutMs,
  now = () => new Date(),
} = {}) {
  if (typeof mint !== "string" || mint.trim() === "") {
    throw new TypeError("Solscan mint is required");
  }
  const data = await requestSolscan("/token/meta", {
    apiKey,
    query: { address: mint?.trim() },
    budget,
    fetchImpl,
    signal,
    timeoutMs,
    now,
  });
  if (data.address !== mint.trim()) {
    throw providerError("Solscan token response did not match the requested mint", {
      code: "token_data_unavailable",
    });
  }
  const priceUsd = optionalNumber(data.price);
  if (priceUsd === null || priceUsd <= 0) {
    throw providerError("Solscan price is unavailable", { code: "price_unavailable" });
  }
  return Object.freeze({
    provider: "solscan",
    sourceMethodVersion: "solscan-token-meta-price.v2",
    mint: mint.trim(),
    priceUsd,
    observedAt: new Date(now()).toISOString(),
    runtimeAuthority: false,
  });
}

export const solscanTokenEvidenceConstants = Object.freeze({ baseUrl: BASE_URL });
