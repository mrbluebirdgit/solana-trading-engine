import { readLunarCrushTopics } from "./lunarcrush-topics.mjs";
import { readNewsApiHeadlines } from "./newsapi.mjs";
import { readXTrends } from "./x-trends.mjs";

async function check(reader, options, provider) {
  const samples = await reader(options);
  if (!Array.isArray(samples)) throw new Error(`${provider} health response is invalid`);
  return Object.freeze({
    ok: true,
    provider,
    sampleCount: samples.length,
    runtimeAuthority: false,
  });
}

export function checkXAttentionAccess(bearerToken, options = {}) {
  return check(readXTrends, {
    bearerToken,
    woeids: [1],
    ...options,
  }, "x");
}

export function checkLunarCrushAttentionAccess(apiKey, options = {}) {
  return check(readLunarCrushTopics, { apiKey, ...options }, "lunarcrush");
}

export function checkNewsApiAttentionAccess(apiKey, options = {}) {
  return check(readNewsApiHeadlines, { apiKey, ...options }, "newsapi");
}
