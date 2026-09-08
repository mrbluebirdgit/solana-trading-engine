const AUTHORITY_VALUES = new Set(["active", "renounced", "unknown"]);

function authorityState(value, field) {
  if (!AUTHORITY_VALUES.has(value)) {
    throw new TypeError(`${field} must be active, renounced, or unknown`);
  }
  return value;
}

export function authorityCheck({ mintAuthority, freezeAuthority } = {}) {
  const mint = authorityState(mintAuthority, "mintAuthority");
  const freeze = authorityState(freezeAuthority, "freezeAuthority");
  const reasons = [];

  if (mint === "active") reasons.push("mint_authority_exists");
  if (freeze === "active") reasons.push("freeze_authority_exists");
  const killSignal = reasons.length > 0;

  if (!killSignal) {
    if (mint === "unknown") reasons.push("mint_authority_unknown");
    if (freeze === "unknown") reasons.push("freeze_authority_unknown");
  }

  return Object.freeze({
    schemaVersion: 1,
    killSignal,
    scoutSkip: !killSignal && reasons.length > 0,
    mintAuthority: mint,
    freezeAuthority: freeze,
    reasons: Object.freeze(reasons),
    runtimeAuthority: false,
  });
}
