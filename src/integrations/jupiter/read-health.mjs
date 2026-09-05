const DEFAULT_PRICE_ENDPOINT = "https://api.jup.ag/price/v3";
const SOL_MINT = "So11111111111111111111111111111111111111112";

function classifyHttpFailure(status) {
  if (status === 401 || status === 403) {
    return "Jupiter rejected the API key";
  }

  if (status === 429) {
    return "Jupiter rate limit reached";
  }

  return `Jupiter price request failed with HTTP ${status}`;
}

export async function checkJupiterReadAccess(
  apiKey,
  {
    fetchImpl = globalThis.fetch,
    endpoint = DEFAULT_PRICE_ENDPOINT,
    timeoutMs = 10_000,
  } = {},
) {
  const key = apiKey?.trim() ?? "";

  if (!key) {
    throw new Error("Jupiter API key is missing");
  }

  const url = new URL(endpoint);
  url.searchParams.set("ids", SOL_MINT);

  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "x-api-key": key,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw new Error("Jupiter price request timed out");
    }

    throw new Error("Jupiter price request could not be completed");
  }

  if (!response.ok) {
    throw new Error(classifyHttpFailure(response.status));
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Jupiter returned an invalid JSON response");
  }

  const usdPrice = payload?.[SOL_MINT]?.usdPrice;

  if (!Number.isFinite(usdPrice) || usdPrice <= 0) {
    throw new Error("Jupiter response did not contain a valid SOL price");
  }

  return Object.freeze({
    ok: true,
    capability: "price-v3",
    network: "solana-mainnet",
  });
}

export const jupiterHealthConstants = Object.freeze({
  priceEndpoint: DEFAULT_PRICE_ENDPOINT,
  solMint: SOL_MINT,
});

