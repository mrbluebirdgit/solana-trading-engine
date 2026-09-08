#!/usr/bin/env node

import { TRADING_FLOOR_ROLES } from "../src/config/trading-floor-roles.mjs";

process.stdout.write(`${JSON.stringify({
  contractVersion: TRADING_FLOOR_ROLES.contractVersion,
  instructions: TRADING_FLOOR_ROLES.roles.map((role) => role.oneLine),
  lawyer: TRADING_FLOOR_ROLES.lawyer,
}, null, 2)}\n`);
