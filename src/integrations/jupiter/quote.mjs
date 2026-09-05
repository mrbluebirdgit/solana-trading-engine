import { createRouteQuote } from "../../core/execution/route-quote.mjs";

const DEFAULT_ORDER_ENDPOINT = "https://api.jup.ag/swap/v2/order";

export class JupiterQuoteError extends Error {
  constructor(message, { code, scope = "provider", retryable = false } = {}) {
    super(message);
    this.name = "JupiterQuoteError";
    this.code = code ?? "unknown";
    this.scope = scope;
    this.retryable = retryable;
  }
}

const CANDIDATE_ROUTE_CODES = new Set([
  "NO_ROUTES_FOUND",
  "COULD_NOT_FIND_ANY_ROUTE",
  "TOKEN_NOT_TRADABLE",
]);

const CANDIDATE_ROUTE_MESSAGES = [
  /^failed to get quotes?[.!]?$/i,
  /^no routes? found(?:[.: ].*)?$/i,
  /^could not find any route(?:[.: ].*)?$/i,
];

function structuredErrorCode(payload) {
  for (const value of [payload?.errorCode, payload?.code]) {
    if (typeof value === "string" && CANDIDATE_ROUTE_CODES.has(value)) {
      return value;
    }
  }
  return null;
}

function structuredErrorMessage(payload) {
  for (const value of [payload?.error, payload?.errorMessage, payload?.message]) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (CANDIDATE_ROUTE_MESSAGES.some((pattern) => pattern.test(normalized))) {
      return normalized;
    }
  }
  return null;
}

function routeUnavailable(payload) {
  return Boolean(structuredErrorCode(payload) || structuredErrorMessage(payload));
}

function httpQuoteError(status, payload) {
  if (status === 401 || status === 403) {
    return new JupiterQuoteError("Jupiter rejected the API key", {
      code: "authentication_failed",
    });
  }
  if (status === 429) {
    return new JupiterQuoteError("Jupiter quote rate limit reached", {
      code: "rate_limited",
      retryable: true,
    });
  }
  if (status === 400 && routeUnavailable(payload)) {
    return new JupiterQuoteError("Jupiter has no route yet for the requested token and size", {
      code: "route_unavailable",
      scope: "candidate",
      retryable: true,
    });
  }
  return new JupiterQuoteError(`Jupiter quote request failed with HTTP ${status}`, {
    code: status >= 500 ? "provider_unavailable" : "http_error",
    retryable: status >= 500,
  });
}

function normalizeRoute(routePlan) {
  if (!Array.isArray(routePlan)) {
    return [];
  }

  return routePlan.map((step) => ({
    venue: step?.swapInfo?.label,
    inputMint: step?.swapInfo?.inputMint,
    outputMint: step?.swapInfo?.outputMint,
    percent: step?.percent,
    bps: step?.bps,
  }));
}

export function normalizeJupiterQuote(payload, quotedAt = new Date()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Jupiter quote payload must be an object");
  }

  return createRouteQuote({
    provider: "jupiter",
    chain: "solana",
    quotedAt,
    providerQuoteId: payload.requestId ?? payload.quoteId,
    input: {
      mint: payload.inputMint,
      amountAtomic: payload.inAmount,
      usdValue: payload.inUsdValue,
    },
    output: {
      mint: payload.outputMint,
      amountAtomic: payload.outAmount,
      minimumAmountAtomic: payload.otherAmountThreshold,
      usdValue: payload.outUsdValue,
    },
    execution: {
      swapMode: payload.swapMode,
      router: payload.router,
      priceImpactPercent: payload.priceImpact,
      slippageBps: payload.slippageBps,
      totalFeeBps: payload.feeBps,
      signatureFeeLamports: payload.signatureFeeLamports,
      prioritizationFeeLamports: payload.prioritizationFeeLamports,
      rentFeeLamports: payload.rentFeeLamports,
      gasless: payload.gasless,
    },
    route: normalizeRoute(payload.routePlan),
  });
}

export async function requestJupiterQuote(
  { apiKey, inputMint, outputMint, amountAtomic },
  {
    fetchImpl = globalThis.fetch,
    endpoint = DEFAULT_ORDER_ENDPOINT,
    timeoutMs = 10_000,
    quotedAt = new Date(),
    signal: externalSignal,
  } = {},
) {
  const key = apiKey?.trim() ?? "";

  if (!key) {
    throw new Error("Jupiter API key is missing");
  }
  if (typeof inputMint !== "string" || inputMint.trim() === "") {
    throw new TypeError("Jupiter inputMint is required");
  }
  if (typeof outputMint !== "string" || outputMint.trim() === "") {
    throw new TypeError("Jupiter outputMint is required");
  }
  if (!/^\d+$/.test(String(amountAtomic)) || String(amountAtomic) === "0") {
    throw new TypeError("Jupiter amountAtomic must be a positive integer string");
  }

  const expected = Object.freeze({
    inputMint: inputMint.trim(),
    outputMint: outputMint.trim(),
    amountAtomic: String(amountAtomic),
  });

  const url = new URL(endpoint);
  url.searchParams.set("inputMint", expected.inputMint);
  url.searchParams.set("outputMint", expected.outputMint);
  url.searchParams.set("amount", expected.amountAtomic);

  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "x-api-key": key,
      },
      signal: externalSignal
        ? AbortSignal.any([AbortSignal.timeout(timeoutMs), externalSignal])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch {
    if (externalSignal?.aborted) {
      const error = new Error("Jupiter quote request was aborted");
      error.name = "AbortError";
      throw error;
    }
    throw new JupiterQuoteError("Jupiter quote request could not be completed", {
      code: "transport_failed",
      retryable: true,
    });
  }

  if (!response.ok) {
    let errorPayload = null;
    try {
      errorPayload = await response.json();
    } catch {
      // HTTP status remains a provider/integration failure without an exact,
      // allowlisted machine-readable candidate error code.
    }
    throw httpQuoteError(response.status, errorPayload);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new JupiterQuoteError("Jupiter quote response was not valid JSON", {
      code: "invalid_response",
    });
  }
  const responseRouteError = routeUnavailable(payload);
  if (responseRouteError) {
    throw new JupiterQuoteError("Jupiter has no route yet for the requested token and size", {
      code: "route_unavailable",
      scope: "candidate",
      retryable: true,
    });
  }
  if (
    payload?.inputMint !== expected.inputMint ||
    payload?.outputMint !== expected.outputMint ||
    payload?.inAmount !== expected.amountAtomic
  ) {
    throw new JupiterQuoteError(
      "Jupiter quote response did not match the requested route",
      { code: "invalid_response" },
    );
  }
  return normalizeJupiterQuote(payload, quotedAt);
}

export const jupiterQuoteConstants = Object.freeze({
  orderEndpoint: DEFAULT_ORDER_ENDPOINT,
});
