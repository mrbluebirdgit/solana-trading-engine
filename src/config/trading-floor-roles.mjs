import { readFileSync } from "node:fs";

const ROLES_URL = new URL("../../config/trading-floor-roles.v1.json", import.meta.url);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function loadRoles() {
  const parsed = JSON.parse(readFileSync(ROLES_URL, "utf8"));
  if (
    parsed?.schemaVersion !== 1 ||
    parsed?.contractVersion !== "trading-floor-roles.v1" ||
    !Array.isArray(parsed.roles) ||
    parsed.roles.length !== 8
  ) {
    throw new Error("trading floor role contract is invalid");
  }
  const names = new Set(parsed.roles.map((role) => role?.name));
  for (const required of [
    "SCOUT",
    "RISK",
    "WHALE",
    "SHILL",
    "SNIPER",
    "RUG",
    "EXIT",
    "THE LAWYER",
  ]) {
    if (!names.has(required)) throw new Error(`trading floor role missing: ${required}`);
  }
  if (parsed.lawyer?.runtimeAuthority !== false) {
    throw new Error("THE LAWYER must have no runtime trading authority");
  }
  return deepFreeze(parsed);
}

export const TRADING_FLOOR_ROLES = loadRoles();

export function tradingFloorOneLiners() {
  return TRADING_FLOOR_ROLES.roles.map((role) => role.oneLine);
}
