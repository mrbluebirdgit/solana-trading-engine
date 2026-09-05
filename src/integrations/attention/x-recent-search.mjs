import { createAttentionSample } from "../../core/narrative/contracts.mjs";
import { canonicalNarrativeKey } from "../../core/narrative/normalize.mjs";
import { requestJson } from "./request.mjs";

function safeQuery(label) {
  const key = canonicalNarrativeKey(label);
  if (key.length < 2 || key.length > 120) return null;
  const escaped = key.replaceAll('"', "");
  return escaped.includes(" ")
    ? `"${escaped}" lang:en -is:retweet`
    : `${escaped} lang:en -is:retweet`;
}

export async function searchXRecent({
  bearerToken,
  labels,
  maximumQueries = 5,
  fetchImpl = fetch,
  now = new Date(),
  signal,
} = {}) {
  if (typeof bearerToken !== "string" || bearerToken.trim() === "") {
    throw new TypeError("X bearer token is required");
  }
  if (!Array.isArray(labels)) throw new TypeError("labels must be an array");
  const unique = [...new Set(labels.map(canonicalNarrativeKey).filter(Boolean))]
    .slice(0, maximumQueries);
  const observedAt = new Date(now).toISOString();
  const results = await Promise.all(unique.map(async (label) => {
    const query = safeQuery(label);
    if (!query) return [];
    const endpoint = new URL("https://api.x.com/2/tweets/search/recent");
    endpoint.searchParams.set("query", query);
    endpoint.searchParams.set("max_results", "10");
    endpoint.searchParams.set("tweet.fields", "author_id,created_at,lang,public_metrics");
    const payload = await requestJson(endpoint, {
      fetchImpl,
      signal,
      provider: "X Recent Search",
      headers: { authorization: `Bearer ${bearerToken.trim()}` },
    });
    if (payload?.data !== undefined && !Array.isArray(payload.data)) {
      throw new Error("X Recent Search returned malformed data");
    }
    return (payload.data ?? []).map((post) => {
      if (typeof post?.id !== "string" || post.id.trim() === "") return null;
      const metrics = post?.public_metrics ?? {};
      const interactions = [
        metrics.like_count,
        metrics.reply_count,
        metrics.repost_count ?? metrics.retweet_count,
        metrics.quote_count,
      ].filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
      return createAttentionSample({
        sourceMethodVersion: "x-recent-search.v1",
        provider: "x",
        sourceFamily: "social_direct",
        sourceItemId: post.id,
        label,
        text: typeof post.text === "string" ? post.text : null,
        url: `https://x.com/i/web/status/${encodeURIComponent(post.id)}`,
        authorId: typeof post.author_id === "string" ? post.author_id : null,
        occurredAt: typeof post.created_at === "string" ? post.created_at : observedAt,
        observedAt,
        upstreamSources: ["x"],
        metrics: {
          volume: null,
          contributors: null,
          interactions,
          rank: null,
        },
      }, { now });
    }).filter(Boolean);
  }));
  return Object.freeze(results.flat());
}
