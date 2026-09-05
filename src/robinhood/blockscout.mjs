const API = "https://robinhoodchain.blockscout.com/api/v2";

async function getJson(path, fetchImpl) {
  const response = await fetchImpl(`${API}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Blockscout HTTP ${response.status}`);
  return response.json();
}

export async function inspectRobinhoodToken(address, { fetchImpl = fetch } = {}) {
  const [contract, token, holders] = await Promise.all([
    getJson(`/smart-contracts/${address}`, fetchImpl).catch(() => null),
    getJson(`/tokens/${address}`, fetchImpl).catch(() => null),
    getJson(`/tokens/${address}/holders`, fetchImpl).catch(() => null),
  ]);
  const totalSupply = Number(token?.total_supply ?? 0);
  const decimals = Number(token?.decimals ?? 18);
  const normalizedSupply = totalSupply / (10 ** decimals);
  const rows = Array.isArray(holders?.items) ? holders.items : [];
  const percentages = rows.slice(0, 10).map((row) => {
    const value = Number(row.value ?? 0) / (10 ** decimals);
    return normalizedSupply > 0 ? (value / normalizedSupply) * 100 : 0;
  });
  return {
    sourceVerified: Boolean(contract?.is_verified ?? contract?.is_verified_via_sourcify),
    isProxy: Boolean(contract?.is_proxy),
    implementationAddress: contract?.implementations?.[0]?.address_hash ?? null,
    holdersCount: Number(token?.holders_count ?? 0),
    topTenPct: percentages.reduce((sum, value) => sum + value, 0),
    topHolderPct: percentages[0] ?? 0,
  };
}

