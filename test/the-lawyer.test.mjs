import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DESK_FILTER_LAW } from "../src/config/desk-filter-law.mjs";
import { evaluateDeskFilter } from "../src/core/decision/desk-filter.mjs";
import { createTheLawyer, theLawyerConstants } from "../src/core/intelligence/the-lawyer.mjs";

function metrics(kind) {
  const strong = kind === "strong";
  return {
    developerPercent: strong ? 0.2 : 4.9,
    insiderPercent: strong ? 0.5 : 9.8,
    bundledPercent: strong ? 1 : 14.8,
    freshPercent: strong ? 4 : 29,
    snipersPercent: strong ? 2 : 19.8,
    rugPercent: strong ? 0 : 0.95,
    phishingPercent: 0,
    botTradingPercent: strong ? 80 : 2,
    smartMoneyCount: strong ? 8 : 1,
    holderCount: strong ? 200 : 20,
    top10Percent: strong ? 8 : 24.9,
    marketCapUsd: strong ? 50_000 : 8_100,
    volume5mUsd: strong ? 25_000 : 5_050,
    netInflow5mUsd: strong ? 10_000 : 1,
    transactions5m: strong ? 200 : 40,
    curveFillPercent: strong ? 10 : 2.1,
  };
}

function pass(input) {
  return evaluateDeskFilter({
    stage: "curve",
    mintAuthority: "renounced",
    freezeAuthority: "renounced",
    metrics: input,
  });
}

test("learns candidate ordering while preserving every desk-law number", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "the-lawyer-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "state.json");
  const lawBefore = JSON.stringify(DESK_FILTER_LAW);
  const lawyer = createTheLawyer({ statePath, clock: () => new Date("2026-09-07T20:00:00Z") });
  await lawyer.start();

  await assert.rejects(
    lawyer.rank({
      candidateId: "killed",
      decision: { ...pass(metrics("strong")), decision: "RISK_KILL", scoutEligible: false },
      metrics: metrics("strong"),
    }),
    /only a SCOUT_PASS/,
  );

  for (let index = 0; index < 24; index += 1) {
    const kind = index % 2 === 0 ? "strong" : "weak";
    const candidateId = `training-${index}`;
    await lawyer.rank({
      candidateId,
      decision: pass(metrics(kind)),
      metrics: metrics(kind),
    });
    await lawyer.recordOutcome({
      candidateId,
      horizonMs: theLawyerConstants.learningHorizonMs,
      returnPercent: kind === "strong" ? 25 : -10,
    });
  }

  const strong = await lawyer.rank({
    candidateId: "comparison-strong",
    decision: pass(metrics("strong")),
    metrics: metrics("strong"),
  });
  const weak = await lawyer.rank({
    candidateId: "comparison-weak",
    decision: pass(metrics("weak")),
    metrics: metrics("weak"),
  });
  assert.equal(strong.rankScore > weak.rankScore, true);
  assert.equal(strong.hardThresholdsChanged, false);
  assert.equal(JSON.stringify(DESK_FILTER_LAW), lawBefore);
  assert.equal(lawyer.snapshot().recommendations[0].type, "RANKING_PERFORMANCE_REVIEW");
  await lawyer.stop();

  const restarted = createTheLawyer({ statePath });
  const restored = await restarted.start();
  assert.equal(restored.models.curve.updates, 24);
  await restarted.stop();
});

test("routes fill and escaped-rug recommendations to the Chiefs without applying them", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "the-lawyer-recs-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const lawyer = createTheLawyer({ statePath: path.join(directory, "state.json") });
  await lawyer.start();
  await lawyer.recordOperationalResult({ fillStatus: "failed", stage: "curve" });
  await lawyer.recordOperationalResult({ fillStatus: "failed", stage: "curve" });
  const third = await lawyer.recordOperationalResult({ fillStatus: "failed", stage: "curve" });
  assert.equal(third.recommendations[0].type, "REVIEW_TERMINAL_SLIPPAGE");
  const rug = await lawyer.recordOperationalResult({
    candidateId: "escaped-rug",
    stage: "curve",
    rugDetected: true,
    metrics: metrics("weak"),
  });
  assert.equal(rug.recommendations[0].type, "REVIEW_BUNDLE_AND_DEVELOPER_CAPS");
  assert.equal(rug.recommendations[0].automaticChangeApplied, false);
  assert.deepEqual(rug.recommendations[0].recipients, ["CHIEF OF STAFF", "CHIEF"]);
  const decided = await lawyer.decideRecommendation({
    recommendationId: rug.recommendations[0].recommendationId,
    decision: "APPROVED",
    decidedBy: "CHIEF",
  });
  assert.equal(decided.status, "APPROVED");
  assert.equal(decided.automaticChangeApplied, false);
  await lawyer.stop();
});
