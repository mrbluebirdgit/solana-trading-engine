import assert from "node:assert/strict";
import test from "node:test";

import { resolveEventMints } from "../src/integrations/helius/resolve-event-mints.mjs";
import { NATIVE_SOL_MINT } from "../src/integrations/pump/program-ids.mjs";

const MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

test("keeps mints already present on the log event", async () => {
  const resolved = await resolveEventMints("key", {
    signature: "sig",
    candidateMints: [MINT],
  });
  assert.deepEqual(resolved.mints, [MINT]);
  assert.equal(resolved.source, "event");
});

test("loads mints from getTransaction when the log payload is empty", async () => {
  const resolved = await resolveEventMints(
    "key",
    { signature: "sig", candidateMints: [], eventType: "create" },
    {
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body);
        assert.equal(body.method, "getTransaction");
        assert.equal(body.params[0], "sig");
        return {
          ok: true,
          json: async () => ({
            result: {
              meta: {
                postTokenBalances: [
                  { mint: MINT },
                  { mint: NATIVE_SOL_MINT },
                ],
              },
            },
          }),
        };
      },
    },
  );
  assert.deepEqual(resolved.mints, [MINT]);
  assert.equal(resolved.source, "getTransaction");
});
