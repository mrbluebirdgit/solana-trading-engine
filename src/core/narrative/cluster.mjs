import {
  canonicalNarrativeKey,
  narrativeSimilarity,
} from "./normalize.mjs";

const CHANNEL_BY_FAMILY = Object.freeze({
  social_direct: "social",
  social_aggregate: "social",
  news: "news",
  search: "search",
  video: "video",
  community: "community",
});

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function periodStrength(samples) {
  const byMethod = new Map();
  for (const sample of samples) {
    const methodKey = `${sample.provider}:${sample.sourceMethodVersion}`;
    const existing = byMethod.get(methodKey) ?? {
      itemIds: new Set(),
      metricValues: [],
    };
    existing.itemIds.add(sample.sourceItemId);
    const metric = sample.metrics.volume ?? sample.metrics.interactions;
    if (Number.isFinite(metric)) existing.metricValues.push(metric);
    byMethod.set(methodKey, existing);
  }
  return new Map(
    [...byMethod.entries()].map(([methodKey, values]) => [
      methodKey,
      values.metricValues.length > 0
        ? Object.freeze({ kind: "metric", value: median(values.metricValues) })
        : Object.freeze({ kind: "count", value: values.itemIds.size }),
    ]),
  );
}

function velocityFor(samples, nowMs, recentWindowMs, horizonMs) {
  const recent = samples.filter((sample) =>
    nowMs - new Date(sample.observedAt).valueOf() <= recentWindowMs,
  );
  const baseline = samples.filter((sample) => {
    const age = nowMs - new Date(sample.observedAt).valueOf();
    return age > recentWindowMs && age <= horizonMs;
  });
  if (recent.length === 0 || baseline.length === 0) return null;

  const recentByProvider = periodStrength(recent);
  const baselineByProvider = periodStrength(baseline);
  const baselineWindows = Math.max(1, (horizonMs - recentWindowMs) / recentWindowMs);
  const ratios = [];
  for (const [methodKey, recentStrength] of recentByProvider) {
    const priorStrength = baselineByProvider.get(methodKey);
    if (
      !priorStrength ||
      recentStrength.kind !== priorStrength.kind ||
      !Number.isFinite(priorStrength.value) ||
      priorStrength.value <= 0
    ) continue;
    const normalizedPrior = priorStrength.kind === "count"
      ? priorStrength.value / baselineWindows
      : priorStrength.value;
    ratios.push((recentStrength.value - normalizedPrior) / normalizedPrior);
  }
  return median(ratios);
}

function clusterId(key) {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `narrative-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function clusterAttentionSamples(samples, {
  now = new Date(),
  horizonMs = 60 * 60 * 1_000,
  recentWindowMs = 15 * 60 * 1_000,
  minimumSimilarity = 0.72,
} = {}) {
  if (!Array.isArray(samples)) throw new TypeError("samples must be an array");
  const nowMs = new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new TypeError("now is invalid");
  if (!Number.isFinite(horizonMs) || horizonMs <= recentWindowMs) {
    throw new TypeError("horizonMs must exceed recentWindowMs");
  }

  const eligible = samples
    .filter((sample) => {
      const observed = new Date(sample?.observedAt).valueOf();
      return Number.isFinite(observed) && observed <= nowMs && nowMs - observed <= horizonMs;
    })
    .sort((left, right) =>
      new Date(right.observedAt).valueOf() - new Date(left.observedAt).valueOf(),
    );
  const clusters = [];
  for (const sample of eligible) {
    const key = canonicalNarrativeKey(sample.label);
    if (key.length < 2) continue;
    let cluster = clusters.find((candidate) =>
      narrativeSimilarity(candidate.key, key) >= minimumSimilarity,
    );
    if (!cluster) {
      cluster = { key, label: sample.label, samples: [] };
      clusters.push(cluster);
    }
    cluster.samples.push(sample);
  }

  return Object.freeze(clusters.map((cluster) => {
    const channels = [...new Set(
      cluster.samples.map((sample) => CHANNEL_BY_FAMILY[sample.sourceFamily]),
    )].filter(Boolean).sort();
    const providers = [...new Set(cluster.samples.map((sample) => sample.provider))].sort();
    const authors = [...new Set(
      cluster.samples.map((sample) => sample.authorId).filter(Boolean),
    )];
    const latestObservedAt = cluster.samples.reduce(
      (latest, sample) => sample.observedAt > latest ? sample.observedAt : latest,
      cluster.samples[0].observedAt,
    );
    const newest = cluster.samples.find((sample) => sample.observedAt === latestObservedAt);
    const velocity = velocityFor(
      cluster.samples,
      nowMs,
      recentWindowMs,
      horizonMs,
    );
    return Object.freeze({
      schemaVersion: 1,
      id: clusterId(cluster.key),
      key: cluster.key,
      label: newest?.label ?? cluster.label,
      latestObservedAt,
      firstObservedAt: cluster.samples.reduce(
        (earliest, sample) => sample.observedAt < earliest ? sample.observedAt : earliest,
        cluster.samples[0].observedAt,
      ),
      observationCount: cluster.samples.length,
      providerCount: providers.length,
      evidenceChannelCount: channels.length,
      providers: Object.freeze(providers),
      evidenceChannels: Object.freeze(channels),
      uniqueAuthorCount: authors.length > 0 ? authors.length : null,
      velocity,
      velocityWindowMs: recentWindowMs,
      velocityBaselineMs: horizonMs - recentWindowMs,
      samples: Object.freeze([...cluster.samples]),
      runtimeAuthority: false,
    });
  }));
}

export const narrativeClusterConstants = Object.freeze({
  channelByFamily: CHANNEL_BY_FAMILY,
  defaultHorizonMs: 60 * 60 * 1_000,
  defaultRecentWindowMs: 15 * 60 * 1_000,
});
