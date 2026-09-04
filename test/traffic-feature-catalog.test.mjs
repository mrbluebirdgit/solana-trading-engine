import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseTrafficFeatureCatalog,
  validateTrafficFeatureCatalog,
} from "../src/config/traffic-feature-catalog.mjs";

const catalogUrl = new URL(
  "../config/traffic-feature-catalog.v1.json",
  import.meta.url,
);

async function readCatalogFixture() {
  return JSON.parse(await readFile(catalogUrl, "utf8"));
}

test("catalogs the traffic stack without granting runtime authority", async () => {
  const catalog = parseTrafficFeatureCatalog(await readFile(catalogUrl, "utf8"));
  const result = validateTrafficFeatureCatalog(catalog);

  assert.equal(catalog.projectStatus, "LIVE_LOCKED");
  assert.equal(catalog.runtimeAuthority, false);
  assert.ok(result.featureCount >= 25);
  assert.ok(catalog.features.some((feature) => feature.id === "breadth.entity_adjusted_makers"));
  assert.ok(catalog.features.some((feature) => feature.id === "market.executable_sell_impact_bps"));
  assert.ok(catalog.features.some((feature) => feature.id === "social.onchain_conversion_lag"));
  assert.ok(catalog.features.some((feature) => feature.id === "ownership.provider_bundler_rate"));
  assert.ok(catalog.features.some((feature) => feature.id === "flow.provider_bundled_trading_volume_share"));
  assert.equal(Object.isFrozen(catalog.features), true);
  assert.equal(Object.isFrozen(catalog.features[0]), true);
  assert.throws(() => {
    catalog.features[0].threshold = 0.5;
  }, TypeError);
});

test("does not hide supplied numeric presets inside feature definitions", async () => {
  const catalog = parseTrafficFeatureCatalog(await readFile(catalogUrl, "utf8"));

  for (const feature of catalog.features) {
    assert.equal(Object.hasOwn(feature, "threshold"), false);
    assert.equal(Object.hasOwn(feature, "hardReject"), false);
    assert.equal(Object.hasOwn(feature, "buyWhen"), false);
    assert.equal(Object.hasOwn(feature, "scoreWeight"), false);
  }
});

test("requires raw-wallet and same-slot shortcuts to remain forbidden", async () => {
  const catalog = parseTrafficFeatureCatalog(await readFile(catalogUrl, "utf8"));

  assert.ok(catalog.forbiddenShortcuts.includes("raw_wallet_count_equals_independent_people"));
  assert.ok(catalog.forbiddenShortcuts.includes("same_slot_equals_common_owner"));
  assert.ok(catalog.forbiddenShortcuts.includes("vendor_threshold_equals_optimal_threshold"));
});

test("rejects a catalog that grants runtime authority", async () => {
  const catalog = await readCatalogFixture();
  catalog.runtimeAuthority = true;

  assert.throws(
    () => validateTrafficFeatureCatalog(catalog),
    /live-locked and non-authoritative/,
  );
});

test("requires the pinned catalog version, windows, and canonical phase source", async () => {
  const wrongVersion = await readCatalogFixture();
  wrongVersion.catalogVersion = "1.0.1";
  assert.throws(
    () => validateTrafficFeatureCatalog(wrongVersion),
    /version must be 1\.0\.0/,
  );

  const reorderedWindows = await readCatalogFixture();
  [reorderedWindows.eventTimeWindows[0], reorderedWindows.eventTimeWindows[1]] = [
    reorderedWindows.eventTimeWindows[1],
    reorderedWindows.eventTimeWindows[0],
  ];
  assert.throws(
    () => validateTrafficFeatureCatalog(reorderedWindows),
    /invalid event-time windows/,
  );

  const providerPhase = await readCatalogFixture();
  providerPhase.phaseSource = "provider_badge";
  assert.throws(
    () => validateTrafficFeatureCatalog(providerPhase),
    /phase source must be canonical_program_state_only/,
  );
});

test("validates phase scopes and source-priority entries", async () => {
  const unknownPhase = await readCatalogFixture();
  unknownPhase.features[0].phaseScope = ["provider_says_migrated"];
  assert.throws(
    () => validateTrafficFeatureCatalog(unknownPhase),
    /invalid phase scope provider_says_migrated/,
  );

  const mixedAll = await readCatalogFixture();
  mixedAll.features[0].phaseScope = ["all", "pumpswap_amm"];
  assert.throws(
    () => validateTrafficFeatureCatalog(mixedAll),
    /cannot mix all with named phases/,
  );

  const blankSource = await readCatalogFixture();
  blankSource.features[0].sourcePriority = ["canonical_chain", " "];
  assert.throws(
    () => validateTrafficFeatureCatalog(blankSource),
    /source priority must be a non-empty string/,
  );
});

test("engineering invariants must abstain on missing inputs", async () => {
  const catalog = await readCatalogFixture();
  const invariant = catalog.features.find(
    (feature) => feature.classification === "ENGINEERING_INVARIANT",
  );
  invariant.missingBehavior = "unknown";

  assert.throws(
    () => validateTrafficFeatureCatalog(catalog),
    /must abstain when missing/,
  );
});

test("forbidden shortcut protections are exact and non-duplicated", async () => {
  const missingShortcut = await readCatalogFixture();
  missingShortcut.forbiddenShortcuts.pop();
  assert.throws(
    () => validateTrafficFeatureCatalog(missingShortcut),
    /invalid forbidden shortcuts/,
  );

  const replacedShortcut = await readCatalogFixture();
  replacedShortcut.forbiddenShortcuts[0] = "price_is_everything";
  assert.throws(
    () => validateTrafficFeatureCatalog(replacedShortcut),
    /invalid forbidden shortcuts/,
  );

  const duplicateShortcut = await readCatalogFixture();
  duplicateShortcut.forbiddenShortcuts[1] =
    duplicateShortcut.forbiddenShortcuts[0];
  assert.throws(
    () => validateTrafficFeatureCatalog(duplicateShortcut),
    /contains duplicate/,
  );
});

test("rejects nested thresholds and execution actions in feature metadata", async () => {
  const nestedThreshold = await readCatalogFixture();
  nestedThreshold.features[0].research = { candidate_threshold: 0.25 };
  assert.throws(
    () => validateTrafficFeatureCatalog(nestedThreshold),
    /cannot embed action field candidate_threshold/,
  );

  const nestedAction = await readCatalogFixture();
  nestedAction.features[0].research = { execution: { autoBuy: true } };
  assert.throws(
    () => validateTrafficFeatureCatalog(nestedAction),
    /cannot embed action field autoBuy/,
  );
});
