const DEFAULT_ENDPOINT = "https://pro-api.solscan.io/v2.0/token/meta";
const SOL_MINT = "So11111111111111111111111111111111111111112";

export async function checkSolscanReadAccess(
  apiKey,
  {
    fetchImpl = globalThis.fetch,
    endpoint = DEFAULT_ENDPOINT,
    timeoutMs = 10_000,
  } = {},
) {
  const key = apiKey?.trim() ?? "";
  if (!key) throw new Error("Solscan API key is missing");
  const url = new URL(endpoint);
  url.searchParams.set("address", SOL_MINT);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json", token: key },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error("Solscan token request timed out");
    throw new Error("Solscan token request could not be completed");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Solscan rejected the API key");
    }
    if (response.status === 429) throw new Error("Solscan rate limit reached");
    throw new Error(`Solscan token request failed with HTTP ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Solscan returned an invalid JSON response");
  }
  if (payload?.success !== true || payload?.data?.address !== SOL_MINT) {
    throw new Error("Solscan response did not contain SOL token metadata");
  }
  return Object.freeze({
    ok: true,
    capability: "token_meta",
    network: "solana-mainnet",
  });
}

export const solscanHealthConstants = Object.freeze({ endpoint: DEFAULT_ENDPOINT, solMint: SOL_MINT });
