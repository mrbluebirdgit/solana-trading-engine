import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CHILD_ENVIRONMENT_ALLOWLIST = Object.freeze([
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "ComSpec",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
]);

function createChildEnvironment(environment, credential) {
  const childEnvironment = { GMGN_API_KEY: credential };

  for (const key of CHILD_ENVIRONMENT_ALLOWLIST) {
    if (typeof environment?.[key] === "string" && environment[key] !== "") {
      childEnvironment[key] = environment[key];
    }
  }

  return childEnvironment;
}

function classifyFailure(error, credential) {
  const diagnostic = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`.replaceAll(
    credential,
    "[REDACTED]",
  );

  if (/\b401\b|unauthorized|invalid api.?key/i.test(diagnostic)) {
    return "GMGN rejected the API key (authorization failed)";
  }

  if (/\b403\b|forbidden|ip.?whitelist/i.test(diagnostic)) {
    return "GMGN denied the API key or verifier IP (permission failed)";
  }

  if (/\b429\b|rate.?limit/i.test(diagnostic)) {
    return "GMGN rate-limited the verification request";
  }

  if (/private.?key|signing.?key/i.test(diagnostic)) {
    return "GMGN unexpectedly required a signing key for this read-only request";
  }

  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network/i.test(diagnostic)) {
    return "GMGN could not be reached from the local verifier";
  }

  const status = Number.isInteger(error?.code)
    ? ` (exit code ${error.code})`
    : "";
  return `GMGN read-only verification failed${status}`;
}

export async function checkGmgnReadAccess(
  apiKey,
  {
    execFileImpl = execFileAsync,
    environment = process.env,
    platform = process.platform,
    timeoutMs = 45_000,
  } = {},
) {
  const credential = apiKey?.trim() ?? "";

  if (!credential) {
    throw new Error("GMGN_API_KEY is required");
  }

  const executable = platform === "win32" ? "gmgn-cli.cmd" : "gmgn-cli";
  const args = [
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
      env: createChildEnvironment(environment, credential),
      maxBuffer: 2_000_000,
      timeout: timeoutMs,
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(classifyFailure(error, credential));
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
