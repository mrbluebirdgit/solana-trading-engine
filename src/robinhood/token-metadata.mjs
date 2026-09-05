import { decodeAbiString, decodeAbiUint } from "./abi.mjs";

const SELECTORS = Object.freeze({
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
});

async function safeCall(rpc, address, data) {
  try {
    return await rpc.ethCall(address, data);
  } catch {
    return null;
  }
}

export async function readTokenMetadata(rpc, address) {
  const [nameRaw, symbolRaw, decimalsRaw, supplyRaw] = await Promise.all([
    safeCall(rpc, address, SELECTORS.name),
    safeCall(rpc, address, SELECTORS.symbol),
    safeCall(rpc, address, SELECTORS.decimals),
    safeCall(rpc, address, SELECTORS.totalSupply),
  ]);
  return {
    name: decodeAbiString(nameRaw) ?? "Unknown",
    symbol: decodeAbiString(symbolRaw) ?? "UNKNOWN",
    decimals: Number(decodeAbiUint(decimalsRaw) ?? 18n),
    totalSupply: (decodeAbiUint(supplyRaw) ?? 0n).toString(),
  };
}

