import { createRouteQuote } from "../../core/execution/route-quote.mjs";

const DEFAULT_ORDER_ENDPOINT = "https://api.jup.ag/swap/v2/order";

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
  } = {},
) {
  const key = apiKey?.trim() ?? "";

  if (!key) {
    throw new Error("Jupiter API key is missing");
  }

  const url = new URL(endpoint);
  url.searchParams.set("inputMint", inputMint);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", amountAtomic);

  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "x-api-key": key,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("Jupiter quote request could not be completed");
  }

  if (!response.ok) {
    throw new Error(`Jupiter quote request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  return normalizeJupiterQuote(payload, quotedAt);
}

export const jupiterQuoteConstants = Object.freeze({
  orderEndpoint: DEFAULT_ORDER_ENDPOINT,
});
