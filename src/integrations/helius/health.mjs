const HELIUS_MAINNET_RPC = "https://mainnet.helius-rpc.com/";

export async function checkHeliusHealth(
  apiKey,
  { fetchImpl = fetch, timeoutMs = 10_000 } = {},
) {
  const endpoint = new URL(HELIUS_MAINNET_RPC);
  endpoint.searchParams.set("api-key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Helius RPC returned HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (payload.error || payload.result !== "ok") {
      throw new Error("Helius RPC did not return a healthy response");
    }

    return { ok: true, network: "mainnet" };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Helius RPC health check timed out");
    }

    if (error.message.startsWith("Helius RPC")) {
      throw error;
    }

    throw new Error("Helius RPC health check could not be completed");
  } finally {
    clearTimeout(timeout);
  }
}
