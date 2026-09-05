import { requestJson } from "../attention/request.mjs";

function httpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getDexScreenerTokenEnrichment(mint, {
  fetchImpl = fetch,
  signal,
} = {}) {
  if (typeof mint !== "string" || mint.trim() === "") {
    throw new TypeError("mint is required");
  }
  const payload = await requestJson(
    `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint.trim())}`,
    { fetchImpl, signal, provider: "DexScreener" },
  );
  if (payload?.pairs !== null && payload?.pairs !== undefined && !Array.isArray(payload.pairs)) {
    throw new Error("DexScreener returned malformed pair data");
  }
  const pairs = (payload?.pairs ?? []).filter((pair) =>
    pair?.chainId === "solana" &&
    (pair?.baseToken?.address === mint.trim() || pair?.quoteToken?.address === mint.trim()),
  );
  pairs.sort((left, right) =>
    (Number(right?.liquidity?.usd) || 0) - (Number(left?.liquidity?.usd) || 0),
  );
  const pair = pairs[0];
  if (!pair) return null;
  const token = pair.baseToken?.address === mint.trim()
    ? pair.baseToken
    : pair.quoteToken;
  const socials = Array.isArray(pair.info?.socials) ? pair.info.socials : [];
  return Object.freeze({
    sourceMethodVersion: "dexscreener-latest-token-pairs.v1",
    mint: mint.trim(),
    name: typeof token?.name === "string" ? token.name.trim().slice(0, 160) : null,
    symbol: typeof token?.symbol === "string" ? token.symbol.trim().slice(0, 32) : null,
    imageUrl: httpsUrl(pair.info?.imageUrl),
    socialLinks: Object.freeze(
      [...new Set(socials.map((item) => httpsUrl(item?.url)).filter(Boolean))],
    ),
    pairUrl: httpsUrl(pair.url),
    pairAddress: typeof pair.pairAddress === "string" ? pair.pairAddress : null,
    liquidityUsd: Number.isFinite(Number(pair?.liquidity?.usd))
      ? Number(pair.liquidity.usd)
      : null,
    runtimeAuthority: false,
  });
}
