import { createAttentionSample } from "../../core/narrative/contracts.mjs";
import { canonicalNarrativeKey } from "../../core/narrative/normalize.mjs";
import { requestText } from "./request.mjs";

function decode(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, names) {
  for (const name of names) {
    const found = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (found) return decode(found[1]);
  }
  return null;
}

function linkFrom(block) {
  const textLink = tag(block, ["link"]);
  if (textLink?.startsWith("https://")) return textLink;
  const attribute = block.match(/<link\b[^>]*\bhref=["'](https:\/\/[^"']+)["'][^>]*>/i);
  return attribute?.[1] ?? null;
}

export function parseRssItems(xml, { feedUrl, observedAt, now } = {}) {
  if (typeof xml !== "string") throw new TypeError("RSS body must be text");
  const blocks = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ].slice(0, 100);
  return Object.freeze(blocks.map((match, index) => {
    const block = match[1];
    const title = tag(block, ["title"]);
    if (!title || !canonicalNarrativeKey(title)) return null;
    const url = linkFrom(block);
    const published = tag(block, ["pubDate", "published", "updated"]);
    const occurredAt = Number.isFinite(new Date(published).valueOf())
      ? new Date(published).toISOString()
      : observedAt;
    return createAttentionSample({
      sourceMethodVersion: "rss-atom-read.v1",
      provider: "rss",
      sourceFamily: "news",
      sourceItemId: tag(block, ["guid", "id"]) ?? url ?? `${feedUrl}:${index}:${title}`,
      label: title,
      text: tag(block, ["description", "summary", "content"]),
      url,
      authorId: new URL(feedUrl).hostname,
      occurredAt,
      observedAt,
      upstreamSources: [new URL(feedUrl).hostname],
      metrics: {},
    }, { now });
  }).filter(Boolean));
}

export async function readRssFeeds({
  feedUrls,
  fetchImpl = fetch,
  now = new Date(),
  signal,
} = {}) {
  if (!Array.isArray(feedUrls) || feedUrls.length === 0 || feedUrls.length > 20) {
    throw new TypeError("feedUrls must contain between one and twenty HTTPS feeds");
  }
  const observedAt = new Date(now).toISOString();
  const outputs = await Promise.all(feedUrls.map(async (feedUrl) => {
    const body = await requestText(feedUrl, {
      fetchImpl,
      signal,
      provider: "RSS",
    });
    return parseRssItems(body, { feedUrl, observedAt, now });
  }));
  return Object.freeze(outputs.flat());
}
