import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectToken2022MintExtensions,
  splMintConstants,
} from "../src/integrations/solana/spl-mint.mjs";

function extensionMint(entries, { accountType = 1 } = {}) {
  const entryLength = entries.reduce((total, entry) => total + 4 + entry.value.length, 0);
  const bytes = new Uint8Array(splMintConstants.token2022TlvStart + entryLength);
  bytes[44] = 6;
  bytes[45] = 1;
  bytes[165] = accountType;
  let offset = splMintConstants.token2022TlvStart;
  for (const { type, value } of entries) {
    new DataView(bytes.buffer).setUint16(offset, type, true);
    new DataView(bytes.buffer).setUint16(offset + 2, value.length, true);
    bytes.set(value, offset + 4);
    offset += 4 + value.length;
  }
  return bytes;
}

test("allows transfer-neutral Token-2022 metadata extensions", () => {
  const mint = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const pointer = new Uint8Array(64);
  pointer.set(mint, 32);
  const metadata = new Uint8Array(80);
  metadata.set(mint, 32);
  const result = inspectToken2022MintExtensions(extensionMint([
    { type: 18, value: pointer },
    { type: 19, value: metadata },
  ]), { expectedMintBytes: mint });

  assert.equal(result.safe, true);
  assert.equal(result.reason, null);
  assert.deepEqual(result.extensions, ["metadata_pointer", "token_metadata"]);
});

test("fails closed on transfer-affecting and unknown Token-2022 extensions", () => {
  const transferHook = inspectToken2022MintExtensions(extensionMint([
    { type: 14, value: new Uint8Array(64) },
  ]));
  assert.equal(transferHook.safe, false);
  assert.equal(transferHook.reason, "token_2022_transfer_hook");

  const unknown = inspectToken2022MintExtensions(extensionMint([
    { type: 29, value: new Uint8Array() },
  ]));
  assert.equal(unknown.safe, false);
  assert.equal(unknown.reason, "token_2022_unknown_extension");
});

test("rejects malformed Token-2022 mint layouts and spoofed embedded metadata mints", () => {
  const malformed = extensionMint([{ type: 18, value: new Uint8Array(64) }]);
  malformed[165] = 2;
  assert.equal(
    inspectToken2022MintExtensions(malformed).reason,
    "token_2022_extension_data_invalid",
  );

  const metadata = new Uint8Array(80);
  const expectedMint = new Uint8Array(32).fill(7);
  assert.equal(
    inspectToken2022MintExtensions(
      extensionMint([{ type: 19, value: metadata }]),
      { expectedMintBytes: expectedMint },
    ).reason,
    "token_2022_extension_data_invalid",
  );
});
