import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { DESK_FILTER_LAW } from "../src/config/desk-filter-law.mjs";
import { TRADING_FLOOR_ROLES, tradingFloorOneLiners } from "../src/config/trading-floor-roles.mjs";
import { authorityCheck } from "../src/core/decision/authority-check.mjs";

test("loads the exact immutable desk law and terminal settings", () => {
  assert.equal(DESK_FILTER_LAW.runtimeMutable, false);
  assert.deepEqual(DESK_FILTER_LAW.riskCapsPercent, {
    developer: 5,
    insider: 10,
    bundled: 15,
    fresh: 30,
    snipers: 20,
    rug: 1,
    phishing: 0,
  });
  assert.equal(DESK_FILTER_LAW.stages.curve.curveFillPercentMinimum, 2);
  assert.equal(DESK_FILTER_LAW.stages.curve.curveFillPercentMaximum, 18);
  assert.equal(DESK_FILTER_LAW.stages.migrated.migrationAgeMinutesMaximum, 12);
  assert.deepEqual(DESK_FILTER_LAW.ignoredFilters, ["botTradingPercent", "telegramCalls"]);
  assert.equal(DESK_FILTER_LAW.terminalEntry.slippagePercent, 15);
  assert.equal(DESK_FILTER_LAW.terminalEntry.priorityFeeSol, 0.006);
  assert.equal(DESK_FILTER_LAW.terminalEntry.jitoTipSol, 0.007);
  assert.equal(DESK_FILTER_LAW.terminalEntry.antiMev, true);
  assert.equal(Object.isFrozen(DESK_FILTER_LAW.stages.curve), true);
  assert.throws(() => { DESK_FILTER_LAW.riskCapsPercent.developer = 6; }, TypeError);
});

test("publishes all eight bounded trading-floor role instructions", () => {
  const lines = tradingFloorOneLiners();
  assert.equal(lines.length, 8);
  assert.equal(lines[0], "SCOUT — launch leads (mint + source + UTC); no risk/size/buy");
  assert.match(lines.at(-1), /^THE LAWYER — audits performance/);
  assert.equal(TRADING_FLOOR_ROLES.lawyer.runtimeAuthority, false);
  assert.deepEqual(TRADING_FLOOR_ROLES.lawyer.recommendationRecipients, [
    "CHIEF OF STAFF",
    "CHIEF",
  ]);
});

test("mint or freeze authority produces the exact kill signal", async () => {
  assert.equal(authorityCheck({
    mintAuthority: "active",
    freezeAuthority: "renounced",
  }).killSignal, true);
  assert.equal(authorityCheck({
    mintAuthority: "renounced",
    freezeAuthority: "unknown",
  }).scoutSkip, true);

  const process = spawnSync(
    "python3",
    [new URL("../authority_check.py", import.meta.url).pathname],
    { input: JSON.stringify({ mintAuthority: "renounced", freezeAuthority: "active" }) },
  );
  assert.equal(process.status, 0, process.stderr.toString());
  const result = JSON.parse(process.stdout.toString());
  assert.equal(result.killSignal, true);
  assert.deepEqual(result.reasons, ["freeze_authority_exists"]);
});
