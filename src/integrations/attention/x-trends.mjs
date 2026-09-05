import { createAttentionSample } from "../../core/narrative/contracts.mjs";
import { canonicalNarrativeKey } from "../../core/narrative/normalize.mjs";
import { requestJson } from "./request.mjs";

export async function readXTrends({
  bearerToken,
  woeids = [1],
  fetchImpl = fetch,
  now = new Date(),
  signal,
} = {}) {
  if (typeof bearerToken !== "string" || bearerToken.trim() === "") {
    throw new TypeError("X bearer token is required");
  }
  if (!Array.isArray(woeids) || woeids.length === 0 || woeids.length > 5) {
    throw new TypeError("X WOEIDs must contain between one and five locations");
  }
  const observedAt = new Date(now).toISOString();
  const responses = await Promise.all(woeids.map(async (woeid) => {
    if (!Number.isSafeInteger(woeid) || woeid < 1) {
      throw new TypeError("X WOEIDs must be positive integers");
    }
    const payload = await requestJson(
      `https://api.x.com/2/trends/by/woeid/${woeid}`,
      {
        fetchImpl,
        signal,
        provider: "X Trends",
        headers: { authorization: `Bearer ${bearerToken.trim()}` },
      },
    );
    if (!Array.isArray(payload?.data)) {
      throw new Error("X Trends returned malformed data");
    }
    return payload.data.map((trend) => ({ woeid, trend }));
  }));

  return Object.freeze(responses.flatMap((items) => items.map(({ woeid, trend }) => {
    const label = typeof trend?.trend_name === "string"
      ? trend.trend_name.trim()
      : "";
    const key = canonicalNarrativeKey(label);
    if (!key) return null;
    return createAttentionSample({
      sourceMethodVersion: "x-trends-by-woeid.v1",
      provider: "x",
      sourceFamily: "social_direct",
      sourceItemId: `${woeid}:${key}:${observedAt}`,
      label,
      text: null,
      url: typeof trend?.url === "string" && trend.url.startsWith("https://")
        ? trend.url
        : null,
      authorId: null,
      occurredAt: observedAt,
      observedAt,
      upstreamSources: ["x"],
      metrics: {
        volume: Number.isFinite(trend?.tweet_count) ? trend.tweet_count : null,
        contributors: null,
        interactions: null,
        rank: null,
      },
    }, { now });
  }).filter(Boolean)));
}
