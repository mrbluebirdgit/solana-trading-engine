#!/usr/bin/env node

import { validateProvider } from "../src/config/credential-specs.mjs";
import { collectPumpStageFromHelius } from "../src/integrations/helius/pump-stage-collector.mjs";

const mint = process.argv[2];
if (!mint) {
  console.error("usage: node scripts/observe-pump-stage.mjs <mint>");
  process.exitCode = 1;
} else {
  const validation = validateProvider("helius");
  if (!validation.ok) {
    console.error("[FAIL] Helius credential formatting");
    process.exitCode = 1;
  } else {
    try {
      const observation = await collectPumpStageFromHelius(
        process.env.HELIUS_API_KEY.trim(),
        mint,
      );
      console.log(
        JSON.stringify(
          {
            mint: observation.mint,
            venueStage: observation.venueStage,
            cutoffSlot: observation.cutoffSlot,
            curveComplete: observation.curveComplete,
            canonicalPoolPresent: observation.canonicalPoolPresent,
            mintAuthority: observation.mintAuthority,
            freezeAuthority: observation.freezeAuthority,
            abstentionReason: observation.abstentionReason,
            runtimeAuthority: observation.runtimeAuthority,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(`[FAIL] ${error.message}`);
      process.exitCode = 1;
    }
  }
}
