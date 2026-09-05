import { createAttentionSample } from "./contracts.mjs";
import {
  canonicalNarrativeKey,
  meaningfulTokens,
  normalizeNarrativeText,
} from "./normalize.mjs";

const HEADLINE_WORDS = new Set([
  "after", "amid", "announces", "announced", "breaking", "could", "first",
  "how", "launches", "launched", "latest", "live", "new", "news", "now",
  "releases", "released", "report", "reveals", "says", "today", "update",
  "updates", "watch", "what", "when", "where", "why", "will",
]);

function addCandidate(into, value, method) {
  const label = String(value ?? "").replace(/^[$#]/u, "").trim();
  const key = canonicalNarrativeKey(label);
  if (
    key.length < 2 ||
    /^\d+$/u.test(key) ||
    meaningfulTokens(label).some((token) => HEADLINE_WORDS.has(token))
  ) return;
  if (!into.has(key)) into.set(key, { label, key, method });
}

function stableId(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function properNounRuns(text) {
  const rawTokens = String(text ?? "").match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [];
  const runs = [];
  let current = [];
  function flush() {
    if (current.length > 0) runs.push(current.slice(0, 4).join(" "));
    current = [];
  }
  for (const token of rawTokens) {
    const normalized = normalizeNarrativeText(token);
    const startsUpper = /^\p{Lu}/u.test(token);
    const hasInteriorUpper = /^\p{Ll}.*\p{Lu}/u.test(token);
    const acronym = /^\p{Lu}{2,}[\p{L}\p{N}]*$/u.test(token);
    const numericContinuation = /^\d+[A-Za-z]?$/u.test(token) && current.length > 0;
    const eligible = (startsUpper || hasInteriorUpper || acronym || numericContinuation) &&
      !HEADLINE_WORDS.has(normalized);
    if (eligible) current.push(token);
    else flush();
  }
  flush();
  return runs;
}

export function extractNarrativeLabels(sample, { maximumLabels = 8 } = {}) {
  if (!sample || typeof sample !== "object") {
    throw new TypeError("attention sample is required");
  }
  const candidates = new Map();
  const combined = [sample.label, sample.text].filter(Boolean).join(" ");

  if (sample.sourceFamily !== "news" || meaningfulTokens(sample.label).length <= 4) {
    addCandidate(candidates, sample.label, "source_label");
  }
  for (const match of combined.matchAll(/(?:^|\s)([$#][\p{L}][\p{L}\p{N}_]{1,30})/gu)) {
    addCandidate(candidates, match[1], "tag");
  }
  for (const match of combined.matchAll(/[“"]([^“”"]{2,80})[”"]/gu)) {
    addCandidate(candidates, match[1], "quoted_phrase");
  }
  for (const label of properNounRuns(sample.label)) {
    addCandidate(candidates, label, "proper_noun_run");
  }

  return Object.freeze([...candidates.values()].slice(0, maximumLabels));
}

export function extractNarrativeEntitySamples(samples, { now = new Date() } = {}) {
  if (!Array.isArray(samples)) throw new TypeError("samples must be an array");
  const derived = [];
  for (const sample of samples) {
    for (const [index, entity] of extractNarrativeLabels(sample).entries()) {
      derived.push(createAttentionSample({
        sourceMethodVersion: `${sample.sourceMethodVersion}+entity-v1`.slice(0, 128),
        provider: sample.provider,
        sourceFamily: sample.sourceFamily,
        sourceItemId: `${sample.sourceItemId.slice(0, 220)}#e:${index}:${stableId(entity.key)}`,
        label: entity.label,
        text: sample.text ?? sample.label,
        url: sample.url,
        authorId: sample.authorId,
        occurredAt: sample.occurredAt,
        observedAt: sample.observedAt,
        upstreamSources: sample.upstreamSources,
        metrics: sample.metrics,
      }, { now }));
    }
  }
  return Object.freeze(derived);
}

export const narrativeEntityConstants = Object.freeze({
  version: "entity-v1",
  maximumLabelsPerSample: 8,
});
