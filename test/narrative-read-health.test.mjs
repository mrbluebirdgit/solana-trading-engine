import assert from "node:assert/strict";
import test from "node:test";

import {
  checkLunarCrushAttentionAccess,
  checkNewsApiAttentionAccess,
  checkXAttentionAccess,
} from "../src/integrations/attention/read-health.mjs";

const NOW = new Date("2026-09-05T12:00:00.000Z");

test("read-only attention health checks validate provider payloads", async () => {
  const x = await checkXAttentionAccess("x-key", {
    now: NOW,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [{ trend_name: "Keyboard Cat" }] }),
    }),
  });
  const lunar = await checkLunarCrushAttentionAccess("lunar-key", {
    now: NOW,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [{ topic: "Keyboard Cat" }] }),
    }),
  });
  const news = await checkNewsApiAttentionAccess("news-key", {
    now: NOW,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ articles: [{
        title: "Keyboard Cat Returns",
        url: "https://example.com/cat",
        publishedAt: NOW.toISOString(),
      }] }),
    }),
  });
  assert.deepEqual(
    [x.provider, lunar.provider, news.provider],
    ["x", "lunarcrush", "newsapi"],
  );
  assert.equal([x, lunar, news].every((result) => result.runtimeAuthority === false), true);
});

test("attention health errors never include credentials", async () => {
  const secret = "attention-secret-that-must-not-leak";
  await assert.rejects(
    checkXAttentionAccess(secret, {
      now: NOW,
      fetchImpl: async () => ({ ok: false, status: 401 }),
    }),
    (error) => {
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});
