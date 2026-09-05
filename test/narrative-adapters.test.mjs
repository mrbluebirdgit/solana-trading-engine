import assert from "node:assert/strict";
import test from "node:test";

import { getHeliusAssetMetadata } from "../src/integrations/helius/asset-metadata.mjs";
import { getDexScreenerTokenEnrichment } from "../src/integrations/dexscreener/token-enrichment.mjs";
import { readLunarCrushTopics } from "../src/integrations/attention/lunarcrush-topics.mjs";
import { readNewsApiHeadlines } from "../src/integrations/attention/newsapi.mjs";
import { parseRssItems } from "../src/integrations/attention/rss.mjs";
import { searchXRecent } from "../src/integrations/attention/x-recent-search.mjs";
import { readXTrends } from "../src/integrations/attention/x-trends.mjs";
import { requestJson, requestText } from "../src/integrations/attention/request.mjs";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

test("X Trends authenticates in a header and emits dynamic topics", async () => {
  let request;
  const samples = await readXTrends({
    bearerToken: "x-secret",
    woeids: [1],
    now: NOW,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return {
        ok: true,
        json: async () => ({ data: [{ trend_name: "Keyboard Cat", tweet_count: 1200 }] }),
      };
    },
  });
  assert.equal(request.url.includes("x-secret"), false);
  assert.equal(request.options.headers.authorization, "Bearer x-secret");
  assert.equal(samples[0].label, "Keyboard Cat");
  assert.equal(samples[0].metrics.volume, 1200);
});

test("X Recent Search limits queries and preserves independent authors", async () => {
  let calls = 0;
  const samples = await searchXRecent({
    bearerToken: "x-secret",
    labels: ["Keyboard Cat", "Second Topic"],
    maximumQueries: 1,
    now: NOW,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({ data: [{
          id: "post-1",
          author_id: "author-1",
          created_at: "2026-09-05T11:59:00.000Z",
          text: "keyboard cat",
          public_metrics: { like_count: 2, reply_count: 3 },
        }] }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(samples[0].authorId, "author-1");
  assert.equal(samples[0].metrics.interactions, 5);
});

test("LunarCrush is retained as an aggregate social source", async () => {
  const [sample] = await readLunarCrushTopics({
    apiKey: "lunar-secret",
    now: NOW,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [{
        topic: "keyboard cat",
        num_posts: 80,
        num_contributors: 20,
        interactions_24h: 900,
        topic_rank: 4,
      }] }),
    }),
  });
  assert.equal(sample.sourceFamily, "social_aggregate");
  assert.ok(sample.upstreamSources.includes("x"));
  assert.equal(sample.metrics.contributors, 20);
});

test("NewsAPI top headlines use explicit country scope, not an unsupported language parameter", async () => {
  let requested;
  const samples = await readNewsApiHeadlines({
    apiKey: "news-secret",
    countries: ["us"],
    now: NOW,
    fetchImpl: async (url) => {
      requested = new URL(url);
      return {
        ok: true,
        json: async () => ({ articles: [{
          title: "Keyboard Cat Returns",
          url: "https://news.example/cat",
          publishedAt: NOW.toISOString(),
        }] }),
      };
    },
  });
  assert.equal(requested.searchParams.get("country"), "us");
  assert.equal(requested.searchParams.has("language"), false);
  assert.equal(samples.length, 1);
});

test("RSS parsing supports RSS and keeps exact publication provenance", () => {
  const samples = parseRssItems(`
    <rss><channel><item><title><![CDATA[Keyboard Cat Returns]]></title>
    <link>https://news.example/cat</link><guid>cat-1</guid>
    <pubDate>Sat, 05 Sep 2026 11:58:00 GMT</pubDate></item></channel></rss>`, {
    feedUrl: "https://news.example/feed.xml",
    observedAt: NOW.toISOString(),
    now: NOW,
  });
  assert.equal(samples.length, 1);
  assert.equal(samples[0].sourceItemId, "cat-1");
  assert.equal(samples[0].occurredAt, "2026-09-05T11:58:00.000Z");
});

test("Helius DAS metadata must match the requested mint", async () => {
  const metadata = await getHeliusAssetMetadata("helius-secret", MINT, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ result: {
        id: MINT,
        content: {
          metadata: { name: "Keyboard Cat", symbol: "KCAT" },
          links: { image: "https://images.example/cat.png" },
        },
      } }),
    }),
  });
  assert.equal(metadata.name, "Keyboard Cat");
  await assert.rejects(
    getHeliusAssetMetadata("helius-secret", MINT, {
      fetchImpl: async () => ({ ok: true, json: async () => ({ result: { id: "wrong" } }) }),
    }),
    /mismatched/,
  );
});

test("DexScreener enrichment chooses the deepest matching Solana pair", async () => {
  const result = await getDexScreenerTokenEnrichment(MINT, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ pairs: [
        {
          chainId: "solana",
          pairAddress: "shallow",
          baseToken: { address: MINT, name: "Wrong", symbol: "LOW" },
          liquidity: { usd: 10 },
        },
        {
          chainId: "solana",
          pairAddress: "deep",
          url: "https://dexscreener.com/solana/deep",
          baseToken: { address: MINT, name: "Keyboard Cat", symbol: "KCAT" },
          liquidity: { usd: 100 },
          info: { socials: [{ url: "https://x.com/keyboardcat" }] },
        },
      ] }),
    }),
  });
  assert.equal(result.pairAddress, "deep");
  assert.deepEqual(result.socialLinks, ["https://x.com/keyboardcat"]);
});

test("generic attention requests reject local and reserved network targets", async () => {
  for (const endpoint of [
    "https://localhost/feed",
    "https://172.20.0.1/feed",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/feed",
  ]) {
    await assert.rejects(
      requestText(endpoint, { fetchImpl: async () => { throw new Error("must not fetch"); } }),
      /local network/,
    );
  }
  await assert.rejects(
    requestJson("http://example.com/data"),
    /HTTPS/,
  );
});
