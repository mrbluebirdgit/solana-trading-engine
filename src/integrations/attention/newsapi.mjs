import { createAttentionSample } from "../../core/narrative/contracts.mjs";
import { canonicalNarrativeKey } from "../../core/narrative/normalize.mjs";
import { requestJson } from "./request.mjs";

export async function readNewsApiHeadlines({
  apiKey,
  countries = ["us"],
  fetchImpl = fetch,
  now = new Date(),
  signal,
  budget,
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("NewsAPI key is required");
  }
  if (
    !Array.isArray(countries) ||
    countries.length < 1 ||
    countries.length > 5 ||
    countries.some((country) => !/^[a-z]{2}$/i.test(country))
  ) {
    throw new TypeError("NewsAPI countries must contain one to five ISO alpha-2 codes");
  }
  const observedAt = new Date(now).toISOString();
  const responses = await Promise.all(
    [...new Set(countries.map((country) => country.toLowerCase()))].map(async (country) => {
      const endpoint = new URL("https://newsapi.org/v2/top-headlines");
      endpoint.searchParams.set("country", country);
      endpoint.searchParams.set("pageSize", "100");
      const payload = await requestJson(endpoint, {
        fetchImpl,
        signal,
        provider: "NewsAPI",
        budget,
        headers: { "x-api-key": apiKey.trim() },
      });
      if (!Array.isArray(payload?.articles)) {
        throw new Error("NewsAPI returned malformed article data");
      }
      return payload.articles.map((article) => ({ article, country }));
    }),
  );
  return Object.freeze(responses.flat().map(({ article, country }, index) => {
    const label = typeof article?.title === "string" ? article.title.trim() : "";
    if (!canonicalNarrativeKey(label)) return null;
    const occurredAt = Number.isFinite(new Date(article?.publishedAt).valueOf())
      ? new Date(article.publishedAt).toISOString()
      : observedAt;
    return createAttentionSample({
      sourceMethodVersion: "newsapi-top-headlines.v1",
      provider: "newsapi",
      sourceFamily: "news",
      sourceItemId: article?.url ?? `${country}:${observedAt}:${index}:${label}`,
      label,
      text: typeof article?.description === "string" ? article.description : null,
      url: typeof article?.url === "string" && article.url.startsWith("https://")
        ? article.url
        : null,
      authorId: article?.source?.id ?? article?.source?.name ?? null,
      occurredAt,
      observedAt,
      upstreamSources: [String(article?.source?.name ?? `newsapi_${country}`)],
      metrics: {},
    }, { now });
  }).filter(Boolean));
}
