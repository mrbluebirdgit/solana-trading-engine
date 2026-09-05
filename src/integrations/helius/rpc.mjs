const HELIUS_MAINNET_RPC = "https://mainnet.helius-rpc.com/";

export function heliusRpcUrl(apiKey) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("Helius API key is required");
  }
  const endpoint = new URL(HELIUS_MAINNET_RPC);
  endpoint.searchParams.set("api-key", apiKey.trim());
  return endpoint;
}

export async function heliusRpcRequest(
  apiKey,
  method,
  params,
  { fetchImpl = fetch, timeoutMs = 10_000, id = 1, signal: externalSignal } = {},
) {
  const endpoint = heliusRpcUrl(apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: externalSignal
        ? AbortSignal.any([controller.signal, externalSignal])
        : controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Helius RPC returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error("Helius RPC returned a JSON-RPC error");
    }
    return payload.result;
  } catch (error) {
    if (error.name === "AbortError") {
      if (externalSignal?.aborted) {
        throw new Error(`Helius RPC ${method} was aborted`);
      }
      throw new Error(`Helius RPC ${method} timed out`);
    }
    if (
      typeof error.message === "string" &&
      (error.message.startsWith("Helius RPC") || error.message.includes("required"))
    ) {
      throw error;
    }
    throw new Error(`Helius RPC ${method} could not be completed`);
  } finally {
    clearTimeout(timeout);
  }
}
