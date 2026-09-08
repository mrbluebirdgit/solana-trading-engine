import { evaluateDeskFilter } from "../decision/desk-filter.mjs";

function immutableCopy(value) {
  if (!value || typeof value !== "object") return value;
  const copy = Array.isArray(value)
    ? value.map(immutableCopy)
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, immutableCopy(child)]));
  return Object.freeze(copy);
}

function instant(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid instant`);
  return date;
}

export function composeDeskCandidate({ stageEvidence, deskMetrics, observedAt } = {}) {
  const at = instant(observedAt ?? new Date(), "observedAt");
  const venueStage = stageEvidence?.venueStage ?? "unknown";
  const metrics = { ...(deskMetrics?.metrics ?? {}) };

  if (venueStage === "pumpswap_amm") {
    const migrationAtUnix = metrics.migrationAtUnix;
    metrics.migrationAgeMinutes = Number.isFinite(migrationAtUnix)
      ? (at.getTime() - migrationAtUnix * 1_000) / 60_000
      : null;
  }

  const decision = evaluateDeskFilter({
    venueStage,
    mintAuthority: stageEvidence?.mintAuthority ?? "unknown",
    freezeAuthority: stageEvidence?.freezeAuthority ?? "unknown",
    metrics,
  });

  return Object.freeze({
    schemaVersion: 1,
    observedAt: at.toISOString(),
    mint: stageEvidence?.mint ?? null,
    venueStage,
    metrics: immutableCopy(metrics),
    decision,
    evidence: Object.freeze({
      stageSource: stageEvidence?.source ?? null,
      stageMethodVersion:
        stageEvidence?.sourceMethodVersion ?? stageEvidence?.resolverVersion ?? null,
      stageObservedAt: stageEvidence?.observedAt ?? null,
      stageCutoffSlot: stageEvidence?.cutoffSlot ?? null,
      metricsSource: deskMetrics?.source ?? null,
      metricsMethodVersion: deskMetrics?.sourceMethodVersion ?? null,
      missingFields: immutableCopy(deskMetrics?.missingFields ?? []),
      invalidFields: immutableCopy(deskMetrics?.invalidFields ?? []),
      sourceQuality: immutableCopy(deskMetrics?.sourceQuality ?? null),
    }),
    runtimeAuthority: false,
  });
}
