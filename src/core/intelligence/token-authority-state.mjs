export const AUTHORITY_STATES = Object.freeze([
  "active",
  "renounced",
  "unknown",
]);

const VALID = new Set(AUTHORITY_STATES);

function normalizeAuthority(value, field) {
  if (value === null || value === undefined || value === "") {
    return "unknown";
  }
  if (value === "n/a" || value === "NA" || value === "not_applicable") {
    throw new TypeError(
      `${field} cannot be marked not applicable; use unknown when unread`,
    );
  }
  if (!VALID.has(value)) {
    throw new TypeError(`${field} must be active, renounced, or unknown`);
  }
  return value;
}

export function resolveTokenAuthorityState({
  venueStage,
  mintAuthority,
  freezeAuthority,
} = {}) {
  const mint = normalizeAuthority(mintAuthority, "mintAuthority");
  const freeze = normalizeAuthority(freezeAuthority, "freezeAuthority");

  return Object.freeze({
    mintAuthority: mint,
    freezeAuthority: freeze,
    applicableOnCurve: true,
    venueStage: venueStage ?? null,
  });
}
