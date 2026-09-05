const EXPECTED_VERSION = "1.0.0";
const VALID_STATUSES = new Set([
  "implemented_discovery",
  "implemented_confirmation",
  "implemented_chain",
  "implemented_enrichment",
  "implemented_delivery",
  "deferred_access",
  "research_only",
  "deferred_replay",
  "rejected_unofficial",
]);

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function validateNarrativeSourceCatalog(catalog) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("Narrative source catalog must be an object");
  }
  if (catalog.catalogVersion !== EXPECTED_VERSION) {
    throw new Error(`Narrative source catalog version must be ${EXPECTED_VERSION}`);
  }
  if (catalog.projectStatus !== "LIVE_LOCKED" || catalog.runtimeAuthority !== false) {
    throw new Error("Narrative source catalog must remain live-locked and non-authoritative");
  }
  if (!Array.isArray(catalog.sources) || catalog.sources.length < 10) {
    throw new Error("Narrative source catalog requires assessed sources");
  }
  const ids = new Set();
  for (const source of catalog.sources) {
    requireText(source?.id, "source id");
    requireText(source?.layer, `Source ${source.id} layer`);
    requireText(source?.reason, `Source ${source.id} reason`);
    requireText(source?.limitations, `Source ${source.id} limitations`);
    if (ids.has(source.id)) throw new Error(`Duplicate narrative source ${source.id}`);
    ids.add(source.id);
    if (!VALID_STATUSES.has(source.status)) {
      throw new Error(`Source ${source.id} has invalid status`);
    }
    if (source.runtimeAuthority !== false) {
      throw new Error(`Source ${source.id} cannot have runtime authority`);
    }
    if (
      source.officialDocumentation !== null &&
      (!URL.canParse(source.officialDocumentation) ||
        new URL(source.officialDocumentation).protocol !== "https:")
    ) {
      throw new Error(`Source ${source.id} has invalid official documentation`);
    }
    if (
      source.status === "rejected_unofficial" &&
      source.officialDocumentation !== null
    ) {
      throw new Error(`Rejected source ${source.id} cannot claim official documentation`);
    }
  }
  return Object.freeze({ sourceCount: ids.size });
}

export function parseNarrativeSourceCatalog(text) {
  let catalog;
  try { catalog = JSON.parse(text); } catch (error) {
    throw new Error(`Narrative source catalog must be valid JSON: ${error.message}`);
  }
  validateNarrativeSourceCatalog(catalog);
  return deepFreeze(catalog);
}
