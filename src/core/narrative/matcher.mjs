import {
  canonicalNarrativeKey,
  meaningfulTokens,
  narrativeSimilarity,
  normalizeNarrativeText,
} from "./normalize.mjs";

function compact(value) {
  return normalizeNarrativeText(value).replaceAll(" ", "");
}

export function matchNarrativeToMint(narrative, mintCandidate) {
  const key = canonicalNarrativeKey(narrative?.key ?? narrative?.label ?? "");
  if (!key) return null;
  const name = normalizeNarrativeText(mintCandidate?.name ?? "");
  const symbol = compact(mintCandidate?.symbol ?? "");
  const description = normalizeNarrativeText(mintCandidate?.description ?? "");
  const keyCompact = compact(key);
  const keyTokens = meaningfulTokens(key);

  if (name === key) {
    return Object.freeze({ method: "exact_name", confidence: 1, runtimeAuthority: false });
  }
  if (keyCompact.length >= 3 && symbol === keyCompact) {
    return Object.freeze({ method: "exact_symbol", confidence: 0.98, runtimeAuthority: false });
  }
  if (
    keyTokens.length > 0 &&
    keyTokens.every((token) => name.split(" ").includes(token))
  ) {
    return Object.freeze({ method: "name_tokens", confidence: 0.9, runtimeAuthority: false });
  }
  if (
    key.length >= 4 &&
    description &&
    description.includes(key)
  ) {
    return Object.freeze({ method: "description_phrase", confidence: 0.78, runtimeAuthority: false });
  }

  const nameSimilarity = narrativeSimilarity(key, name);
  if (nameSimilarity >= 0.72) {
    return Object.freeze({
      method: "fuzzy_name",
      confidence: Math.min(0.88, nameSimilarity),
      runtimeAuthority: false,
    });
  }
  return null;
}
