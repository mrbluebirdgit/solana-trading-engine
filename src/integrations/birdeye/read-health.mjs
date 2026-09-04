const DEFAULT_PRICE_ENDPOINT = "https://public-api.birdeye.so/defi/price";
const SOL_MINT = "So11111111111111111111111111111111111111112";

function classifyHttpFailure(status) {
  if (status === 401 || status === 403) {
    return "Birdeye rejected the API key";
  }

  if (status === 429) {
    return "Birdeye rate limit reached";
  }

  return `Birdeye price request failed with HTTP ${status}`;
}

export async function checkBirdeyeReadAccess(
  apiKey,
  {
    fetchImpl = globalThis.fetch,
    endpoint = DEFAULT_PRICE_ENDPOINT,
    timeoutMs = 10_000,
  } = {},
) {
  const key = apiKey?.trim() ?? "";

  if (!key) {
    throw new Error("Birdeye API key is missing");
  }

  const url = new URL(endpoint);
  url.searchParams.set("address", SOL_MINT);

  let response;

  try {
    response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "X-API-KEY": key,
        "x-chain": "solana",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw new Error("Birdeye price request timed out");
    }

    throw new Error("Birdeye price request could not be completed");
  }

  if (!response.ok) {
    throw new Error(classifyHttpFailure(response.status));
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Birdeye returned an invalid JSON response");
  }

  const usdPrice = payload?.data?.value;

  if (
    payload?.success !== true ||
    !Number.isFinite(usdPrice) ||
    usdPrice <= 0
  ) {
    throw new Error("Birdeye response did not contain a valid SOL price");
  }

  return Object.freeze({
    ok: true,
    capability: "price",
    network: "solana-mainnet",
  });
}

export const birdeyeHealthConstants = Object.freeze({
  priceEndpoint: DEFAULT_PRICE_ENDPOINT,
  solMint: SOL_MINT,
});
