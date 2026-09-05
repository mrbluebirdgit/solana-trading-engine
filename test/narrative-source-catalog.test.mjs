import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseNarrativeSourceCatalog,
  validateNarrativeSourceCatalog,
} from "../src/config/narrative-source-catalog.mjs";

const catalogUrl = new URL("../config/narrative-source-catalog.v1.json", import.meta.url);

async function fixture() {
  return JSON.parse(await readFile(catalogUrl, "utf8"));
}

test("audits the supplied narrative sources without granting authority", async () => {
  const catalog = parseNarrativeSourceCatalog(await readFile(catalogUrl, "utf8"));
  const result = validateNarrativeSourceCatalog(catalog);
  assert.ok(result.sourceCount >= 20);
  assert.equal(catalog.runtimeAuthority, false);
  assert.equal(Object.isFrozen(catalog.sources), true);
  assert.equal(
    catalog.sources.find((source) => source.id === "pump_frontend_api_v3").status,
    "rejected_unofficial",
  );
  assert.equal(
    catalog.sources.find((source) => source.id === "tiktok_research_api").status,
    "research_only",
  );
});

test("rejects source authority, duplicate IDs, and unsupported statuses", async () => {
  const authoritative = await fixture();
  authoritative.sources[0].runtimeAuthority = true;
  assert.throws(() => validateNarrativeSourceCatalog(authoritative), /runtime authority/);

  const duplicate = await fixture();
  duplicate.sources[1].id = duplicate.sources[0].id;
  assert.throws(() => validateNarrativeSourceCatalog(duplicate), /Duplicate/);

  const unknown = await fixture();
  unknown.sources[0].status = "trust_me";
  assert.throws(() => validateNarrativeSourceCatalog(unknown), /invalid status/);
});

test("repository ships no implicit seed keyword or wallet list", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.doesNotMatch(envExample, /SEED_KEYWORDS|SEED_WALLETS/);
  await assert.rejects(readFile(new URL("../config/seed-wallets.v1.json", import.meta.url)));
  await assert.rejects(readFile(new URL("../config/seed-keywords.v1.json", import.meta.url)));
});
