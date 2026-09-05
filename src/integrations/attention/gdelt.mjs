import { createAttentionSample } from "../../core/narrative/contracts.mjs";
import { canonicalNarrativeKey } from "../../core/narrative/normalize.mjs";
import { requestJson } from "./request.mjs";

export async function searchGdeltNews({
  labels,
  maximumQueries = 3,
  fetchImpl = fetch,
  now = new Date(),
  signal,
} = {}) {
  if (!Array.isArray(labels)) throw new TypeError("labels must be an array");
  const queries = [...new Set(labels.map(canonicalNarrativeKey).filter(Boolean))]
    .slice(0, maximumQueries);
  const observedAt = new Date(now).toISOString();
  const responses = await Promise.all(queries.map(async (label) => {
    const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
    endpoint.searchParams.set("query", label.includes(" ") ? `\"${label}\"` : label);
    endpoint.searchParams.set("mode", "artlist");
    endpoint.searchParams.set("maxrecords", "25");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("sort", "datedesc");
    const payload = await requestJson(endpoint, {
      fetchImpl,
      signal,
      provider: "GDELT",
      timeoutMs: 12_000,
    });
    if (payload?.articles !== undefined && !Array.isArray(payload.articles)) {
      throw new Error("GDELT returned malformed article data");
    }
    return (payload.articles ?? []).map((article, index) => {
      const seen = String(article?.seendate ?? "").replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
        "$1-$2-$3T$4:$5:$6.000Z",
      );
      const occurredAt = Number.isFinite(new Date(seen).valueOf())
        ? new Date(seen).toISOString()
        : observedAt;
      return createAttentionSample({
        sourceMethodVersion: "gdelt-doc-v2-artlist.v1",
        provider: "gdelt",
        sourceFamily: "news",
        sourceItemId: article?.url ?? `${label}:${observedAt}:${index}`,
        label,
        text: typeof article?.title === "string" ? article.title : null,
        url: typeof article?.url === "string" && article.url.startsWith("https://")
          ? article.url
          : null,
        authorId: typeof article?.domain === "string" ? article.domain : null,
        occurredAt,
        observedAt,
        upstreamSources: [String(article?.domain ?? "gdelt_unknown_source")],
        metrics: {},
      }, { now });
    });
  }));
  return Object.freeze(responses.flat());
}
