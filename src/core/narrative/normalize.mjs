const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "by", "for", "from", "has", "have",
  "in", "is", "it", "new", "of", "on", "or", "that", "the", "this", "to",
  "with", "coin", "coins", "crypto", "memecoin", "meme", "pump", "token", "tokens",
]);

export function normalizeNarrativeText(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[$#@]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

export function meaningfulTokens(value) {
  return normalizeNarrativeText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function canonicalNarrativeKey(value) {
  return meaningfulTokens(value).slice(0, 8).join(" ");
}

function grams(value) {
  const compact = ` ${normalizeNarrativeText(value)} `;
  const found = new Set();
  for (let index = 0; index <= compact.length - 3; index += 1) {
    found.add(compact.slice(index, index + 3));
  }
  return found;
}

export function narrativeSimilarity(left, right) {
  const a = canonicalNarrativeKey(left);
  const b = canonicalNarrativeKey(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const jaccard = union === 0 ? 0 : intersection / union;
  const subset = Math.min(aTokens.size, bTokens.size) >= 2 &&
    intersection === Math.min(aTokens.size, bTokens.size)
    ? 0.85
    : 0;
  const aGrams = grams(a);
  const bGrams = grams(b);
  const gramIntersection = [...aGrams].filter((gram) => bGrams.has(gram)).length;
  const dice = aGrams.size + bGrams.size === 0
    ? 0
    : (2 * gramIntersection) / (aGrams.size + bGrams.size);
  return Math.max(jaccard, dice, subset);
}

export const narrativeNormalizationConstants = Object.freeze({
  stopWords: Object.freeze([...STOP_WORDS]),
});
