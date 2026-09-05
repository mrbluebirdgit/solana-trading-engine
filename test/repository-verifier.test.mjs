import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("repository verifier passes the committed source tree", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const result = spawnSync(process.execPath, ["scripts/verify-repository.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /\[PASS\]/);
});
