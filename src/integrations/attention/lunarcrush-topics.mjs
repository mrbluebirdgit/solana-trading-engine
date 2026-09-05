import { createAttentionSample } from "../../core/narrative/contracts.mjs";
import { canonicalNarrativeKey } from "../../core/narrative/normalize.mjs";
import { requestJson } from "./request.mjs";

export async function readLunarCrushTopics({
  apiKey,
  fetchImpl = fetch,
  now = new Date(),
  signal,
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("LunarCrush API key is required");
  }
  const payload = await requestJson(
    "https://lunarcrush.com/api4/public/topics/list/v1",
    {
      fetchImpl,
      signal,
      provider: "LunarCrush",
      headers: { authorization: `Bearer ${apiKey.trim()}` },
    },
  );
  if (!Array.isArray(payload?.data)) {
    throw new Error("LunarCrush returned malformed topic data");
  }
  const observedAt = new Date(now).toISOString();
  return Object.freeze(payload.data.map((topic) => {
    const label = [topic?.title, topic?.topic].find((value) =>
      typeof value === "string" && value.trim() !== "",
    ) ?? "";
    const key = canonicalNarrativeKey(label);
    if (!key) return null;
    return createAttentionSample({
      sourceMethodVersion: "lunarcrush-topics-list.v1",
      provider: "lunarcrush",
      sourceFamily: "social_aggregate",
      sourceItemId: `${key}:${observedAt}`,
      label,
      text: null,
      url: null,
      authorId: null,
      occurredAt: observedAt,
      observedAt,
      upstreamSources: ["x", "reddit", "youtube", "tiktok"],
      metrics: {
        volume: Number.isFinite(topic?.num_posts) ? topic.num_posts : null,
        contributors: Number.isFinite(topic?.num_contributors)
          ? topic.num_contributors
          : null,
        interactions: Number.isFinite(topic?.interactions_24h)
          ? topic.interactions_24h
          : null,
        rank: Number.isFinite(topic?.topic_rank) ? topic.topic_rank : null,
      },
    }, { now });
  }).filter(Boolean));
}
