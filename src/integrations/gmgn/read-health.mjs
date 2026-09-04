import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PINNED_CLI = "gmgn-cli@1.6.0";

export async function checkGmgnReadAccess(
  apiKey,
  {
    execFileImpl = execFileAsync,
    environment = process.env,
    platform = process.platform,
    timeoutMs = 30_000,
  } = {},
) {
  const credential = apiKey?.trim() ?? "";

  if (!credential) {
    throw new Error("GMGN_API_KEY is required");
  }

  const executable = platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "--yes",
    PINNED_CLI,
    "market",
    "trending",
    "--chain",
    "sol",
    "--interval",
    "1h",
    "--limit",
    "1",
    "--raw",
  ];

  let result;

  try {
    result = await execFileImpl(executable, args, {
      encoding: "utf8",
      env: { ...process.env, ...environment, GMGN_API_KEY: credential },
      maxBuffer: 2_000_000,
      timeout: timeoutMs,
      windowsHide: true,
    });
  } catch (error) {
    const status = Number.isInteger(error?.code)
      ? ` (exit code ${error.code})`
      : "";
    throw new Error(`GMGN read-only verification failed${status}`);
  }

  let payload;

  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error("GMGN read-only verification returned invalid JSON");
  }

  if (payload?.code !== 0 || !Array.isArray(payload?.data?.rank)) {
    throw new Error("GMGN rejected the read-only verification request");
  }

  return Object.freeze({
    ok: true,
    source: "gmgn",
    capability: "read-only",
    records: payload.data.rank.length,
  });
}
