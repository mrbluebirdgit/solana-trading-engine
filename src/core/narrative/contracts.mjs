const SOURCE_FAMILIES = new Set([
  "social_direct",
  "social_aggregate",
  "news",
  "search",
  "video",
  "community",
]);

function requiredText(value, field, maximum = 512) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maximum) {
    throw new TypeError(`${field} exceeds ${maximum} characters`);
  }
  return trimmed;
}

function optionalText(value, field, maximum = 2_000) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field, maximum);
}

function isoTimestamp(value, field) {
  const parsed = new Date(value);
  if (typeof value !== "string" || !Number.isFinite(parsed.valueOf())) {
    throw new TypeError(`${field} must be an ISO timestamp`);
  }
  return parsed.toISOString();
}

function optionalMetric(value, field) {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative finite number or null`);
  }
  return value;
}

function optionalHttpsUrl(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const text = requiredText(value, field, 2_048);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError(`${field} must be an HTTPS URL`);
  }
  if (url.protocol !== "https:") {
    throw new TypeError(`${field} must be an HTTPS URL`);
  }
  return url.toString();
}

function uniqueStrings(values, field, maximum = 32) {
  if (values === undefined || values === null) return Object.freeze([]);
  if (!Array.isArray(values) || values.length > maximum) {
    throw new TypeError(`${field} must be an array with at most ${maximum} entries`);
  }
  const normalized = values.map((value, index) =>
    requiredText(value, `${field}[${index}]`, 128).toLowerCase(),
  );
  return Object.freeze([...new Set(normalized)].sort());
}

export function createAttentionSample(input, { now = new Date() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("attention sample must be an object");
  }
  const observedAt = isoTimestamp(input.observedAt, "observedAt");
  const occurredAt = isoTimestamp(input.occurredAt, "occurredAt");
  const current = new Date(now);
  if (!Number.isFinite(current.valueOf())) throw new TypeError("now is invalid");
  if (
    new Date(observedAt).valueOf() > current.valueOf() + 5_000 ||
    new Date(occurredAt).valueOf() > current.valueOf() + 5_000
  ) {
    throw new TypeError("attention timestamps cannot be in the future");
  }
  if (new Date(occurredAt).valueOf() > new Date(observedAt).valueOf() + 5_000) {
    throw new TypeError("occurredAt cannot be after observedAt");
  }

  const sourceFamily = requiredText(input.sourceFamily, "sourceFamily", 64);
  if (!SOURCE_FAMILIES.has(sourceFamily)) {
    throw new TypeError("sourceFamily is unsupported");
  }
  const metrics = input.metrics ?? {};
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) {
    throw new TypeError("metrics must be an object");
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceMethodVersion: requiredText(
      input.sourceMethodVersion,
      "sourceMethodVersion",
      128,
    ),
    provider: requiredText(input.provider, "provider", 64).toLowerCase(),
    sourceFamily,
    sourceItemId: requiredText(input.sourceItemId, "sourceItemId", 256),
    label: requiredText(input.label, "label", 160),
    text: optionalText(input.text, "text"),
    url: optionalHttpsUrl(input.url, "url"),
    authorId: optionalText(input.authorId, "authorId", 256),
    occurredAt,
    observedAt,
    upstreamSources: uniqueStrings(input.upstreamSources, "upstreamSources"),
    metrics: Object.freeze({
      volume: optionalMetric(metrics.volume, "metrics.volume"),
      contributors: optionalMetric(metrics.contributors, "metrics.contributors"),
      interactions: optionalMetric(metrics.interactions, "metrics.interactions"),
      rank: optionalMetric(metrics.rank, "metrics.rank"),
    }),
    runtimeAuthority: false,
  });
}

export function createMintCandidate(input, { now = new Date() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("mint candidate must be an object");
  }
  const observedAt = isoTimestamp(input.observedAt, "observedAt");
  const current = new Date(now);
  if (!Number.isFinite(current.valueOf())) throw new TypeError("now is invalid");
  if (new Date(observedAt).valueOf() > current.valueOf() + 5_000) {
    throw new TypeError("mint candidate timestamp cannot be in the future");
  }
  if (!Array.isArray(input.socialLinks ?? [])) {
    throw new TypeError("socialLinks must be an array");
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceMethodVersion: requiredText(
      input.sourceMethodVersion,
      "sourceMethodVersion",
      128,
    ),
    mint: requiredText(input.mint, "mint", 64),
    name: optionalText(input.name, "name", 160),
    symbol: optionalText(input.symbol, "symbol", 32),
    description: optionalText(input.description, "description", 2_000),
    imageUrl: optionalHttpsUrl(input.imageUrl, "imageUrl"),
    socialLinks: Object.freeze(
      [...new Set(
        (input.socialLinks ?? []).map((link, index) =>
          optionalHttpsUrl(link, `socialLinks[${index}]`),
        ),
      )].filter(Boolean),
    ),
    observedAt,
    eventSlot:
      input.eventSlot === undefined || input.eventSlot === null
        ? null
        : Number.isSafeInteger(input.eventSlot) && input.eventSlot >= 0
          ? input.eventSlot
          : (() => { throw new TypeError("eventSlot must be a non-negative safe integer"); })(),
    venueStage: optionalText(input.venueStage, "venueStage", 64),
    canonicalPumpEvent: input.canonicalPumpEvent === true,
    runtimeAuthority: false,
  });
}

export const narrativeContractConstants = Object.freeze({
  sourceFamilies: Object.freeze([...SOURCE_FAMILIES]),
});
