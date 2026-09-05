import { heliusRpcRequest } from "./rpc.mjs";

function text(value, maximum) {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim().slice(0, maximum);
}

function httpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getHeliusAssetMetadata(apiKey, mint, options = {}) {
  if (typeof mint !== "string" || mint.trim() === "") {
    throw new TypeError("mint is required");
  }
  const result = await heliusRpcRequest(
    apiKey,
    "getAsset",
    { id: mint.trim(), displayOptions: { showFungible: true } },
    options,
  );
  if (!result || typeof result !== "object" || result.id !== mint.trim()) {
    throw new Error("Helius DAS returned mismatched asset metadata");
  }
  const metadata = result.content?.metadata ?? {};
  const files = Array.isArray(result.content?.files) ? result.content.files : [];
  const imageUrl = [
    result.content?.links?.image,
    ...files.map((file) => file?.uri),
  ].map(httpsUrl).find(Boolean) ?? null;
  return Object.freeze({
    sourceMethodVersion: "helius-das-getAsset.v1",
    mint: mint.trim(),
    name: text(metadata.name, 160),
    symbol: text(metadata.symbol, 32),
    description: text(metadata.description, 2_000),
    imageUrl,
    jsonUri: httpsUrl(result.content?.json_uri),
    runtimeAuthority: false,
  });
}
