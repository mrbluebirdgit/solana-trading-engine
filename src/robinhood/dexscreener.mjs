const BASE_URL = "https://api.dexscreener.com/token-pairs/v1/robinhood";

function finite(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export async function fetchBestRobinhoodPair(tokenAddress, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${BASE_URL}/${tokenAddress}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
  const pairs = await response.json();
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const matching = pairs.filter((pair) => pair.chainId === "robinhood");
  const pair = matching.sort((a, b) => finite(b.liquidity?.usd) - finite(a.liquidity?.usd))[0];
  if (!pair) return null;
  return {
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    url: pair.url,
    priceUsd: finite(pair.priceUsd),
    liquidityUsd: finite(pair.liquidity?.usd),
    fdvUsd: finite(pair.fdv),
    marketCapUsd: finite(pair.marketCap),
    pairCreatedAtMs: finite(pair.pairCreatedAt),
    priceChange: {
      m5: finite(pair.priceChange?.m5),
      h1: finite(pair.priceChange?.h1),
      h6: finite(pair.priceChange?.h6),
    },
    volume: {
      m5: finite(pair.volume?.m5),
      h1: finite(pair.volume?.h1),
      h6: finite(pair.volume?.h6),
    },
    txns: {
      m5: { buys: finite(pair.txns?.m5?.buys), sells: finite(pair.txns?.m5?.sells) },
      h1: { buys: finite(pair.txns?.h1?.buys), sells: finite(pair.txns?.h1?.sells) },
    },
    baseToken: pair.baseToken ?? null,
    quoteToken: pair.quoteToken ?? null,
    socials: pair.info?.socials ?? [],
    websites: pair.info?.websites ?? [],
  };
}

