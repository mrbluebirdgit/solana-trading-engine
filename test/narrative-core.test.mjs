import assert from "node:assert/strict";
import test from "node:test";

import {
  createAttentionSample,
  createMintCandidate,
} from "../src/core/narrative/contracts.mjs";
import { clusterAttentionSamples } from "../src/core/narrative/cluster.mjs";
import {
  extractNarrativeEntitySamples,
  extractNarrativeLabels,
} from "../src/core/narrative/entities.mjs";
import { NarrativeIndex } from "../src/core/narrative/index.mjs";
import { matchNarrativeToMint } from "../src/core/narrative/matcher.mjs";
import {
  canonicalNarrativeKey,
  narrativeSimilarity,
} from "../src/core/narrative/normalize.mjs";
import { scoreNarrativeMatch } from "../src/core/narrative/scorer.mjs";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function sample(overrides = {}) {
  return createAttentionSample({
    sourceMethodVersion: "test.v1",
    provider: "x",
    sourceFamily: "social_direct",
    sourceItemId: "item-1",
    label: "Keyboard Cat",
    occurredAt: "2026-09-05T11:55:00.000Z",
    observedAt: "2026-09-05T11:55:00.000Z",
    upstreamSources: ["x"],
    metrics: {},
    ...overrides,
  }, { now: NOW });
}

function mint(overrides = {}) {
  return createMintCandidate({
    sourceMethodVersion: "test.v1",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    name: "Keyboard Cat",
    symbol: "KCAT",
    description: "the keyboard cat returns",
    imageUrl: "https://example.com/cat.png",
    socialLinks: ["https://x.com/keyboardcat"],
    observedAt: "2026-09-05T11:59:00.000Z",
    eventSlot: 42,
    venueStage: "pump_curve_active",
    canonicalPumpEvent: true,
    ...overrides,
  }, { now: NOW });
}

test("validates observation-only attention and mint contracts", () => {
  assert.equal(sample().runtimeAuthority, false);
  assert.equal(mint().runtimeAuthority, false);
  assert.throws(
    () => sample({ observedAt: "2026-09-05T12:01:00.000Z" }),
    /future/,
  );
  assert.throws(
    () => sample({ metrics: { volume: -1 } }),
    /non-negative/,
  );
  assert.throws(
    () => mint({ socialLinks: ["http://insecure.example"] }),
    /HTTPS/,
  );
});

test("normalizes meme labels without promoting generic crypto words", () => {
  assert.equal(canonicalNarrativeKey("  $Keyboard-Cat token! "), "keyboard cat");
  assert.ok(narrativeSimilarity("keyboard cat", "KeyboardCat") > 0.7);
});

test("shared entity extraction turns a headline into bounded narrative candidates", () => {
  const headline = sample({
    provider: "newsapi",
    sourceFamily: "news",
    sourceItemId: "headline-1",
    label: "OpenAI launches Sora 3 after the Keyboard Cat revival",
    text: "Creators call it \"Keyboard Cat\" across social feeds.",
  });
  const labels = extractNarrativeLabels(headline).map(({ label }) => label);
  assert.ok(labels.includes("OpenAI"));
  assert.ok(labels.includes("Sora 3"));
  assert.ok(labels.includes("Keyboard Cat"));
  assert.equal(labels.includes(headline.label), false);

  const derived = extractNarrativeEntitySamples([headline], { now: NOW });
  assert.ok(derived.length >= 3);
  assert.equal(derived.every((item) => item.runtimeAuthority === false), true);
  assert.equal(new Set(derived.map((item) => item.sourceItemId)).size, derived.length);
});

test("clusters related observations and measures velocity only with a baseline", () => {
  const samples = [
    sample({
      sourceItemId: "old",
      observedAt: "2026-09-05T11:30:00.000Z",
      occurredAt: "2026-09-05T11:30:00.000Z",
      metrics: { volume: 30 },
    }),
    sample({
      sourceItemId: "recent",
      observedAt: "2026-09-05T11:55:00.000Z",
      occurredAt: "2026-09-05T11:55:00.000Z",
      metrics: { volume: 40 },
    }),
    sample({
      provider: "newsapi",
      sourceFamily: "news",
      sourceItemId: "news",
      label: "Keyboard-cat goes viral",
      upstreamSources: ["example-news"],
    }),
  ];
  const [cluster] = clusterAttentionSamples(samples, { now: NOW });
  assert.equal(cluster.evidenceChannelCount, 2);
  assert.deepEqual(cluster.evidenceChannels, ["news", "social"]);
  assert.equal(Number(cluster.velocity.toFixed(3)), 0.333);
  assert.equal(
    clusterAttentionSamples([sample()], { now: NOW })[0].velocity,
    null,
  );
});

test("matches exact names and symbols but rejects unrelated wrappers", () => {
  const narrative = { key: "keyboard cat", label: "Keyboard Cat" };
  assert.equal(matchNarrativeToMint(narrative, mint()).method, "exact_name");
  assert.equal(
    matchNarrativeToMint({ key: "kcat" }, mint()).method,
    "exact_symbol",
  );
  assert.equal(matchNarrativeToMint({ key: "firmware update" }, mint()), null);
});

test("priority score is explicit research routing, not success probability", () => {
  const narrative = clusterAttentionSamples([
    sample({
      sourceItemId: "old",
      observedAt: "2026-09-05T11:30:00.000Z",
      occurredAt: "2026-09-05T11:30:00.000Z",
      metrics: { volume: 30 },
    }),
    sample({ sourceItemId: "recent", metrics: { volume: 40 } }),
  ], { now: NOW })[0];
  const candidate = mint();
  const match = matchNarrativeToMint(narrative, candidate);
  const score = scoreNarrativeMatch({
    narrative,
    match,
    mintCandidate: candidate,
    competingMintCount: 6,
    now: NOW,
  });
  assert.equal(score.runtimeAuthority, false);
  assert.match(score.interpretation, /not_success_probability/);
  assert.equal(score.components.overcrowdingPenalty, 20);
  assert.ok(score.priorityScore >= 0 && score.priorityScore <= 100);
});

test("index records observed competition and deduplicates alerts", () => {
  const index = new NarrativeIndex({ now: () => NOW });
  index.ingestAttention([sample()]);
  index.matchesForMint(mint({ mint: "mint-one" }));
  const [match] = index.matchesForMint(mint({ mint: "mint-two" }));
  assert.equal(match.competingMintCount, 2);
  assert.equal(index.alertOnce(match), true);
  assert.equal(index.alertOnce(match), false);
});
