import { execFile } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { normalizeGmgnToken } from "./normalize.mjs";

const execFileAsync = promisify(execFile);
const CLI_VERSION = "1.6.1";
const DEFAULT_CLI_ENTRY = fileURLToPath(import.meta.resolve("gmgn-cli"));
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
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
]);

function childEnvironment(environment, apiKey) {
  const result = { GMGN_API_KEY: apiKey };
  for (const name of CHILD_ENVIRONMENT_ALLOWLIST) {
    if (typeof environment?.[name] === "string" && environment[name] !== "") {
      result[name] = environment[name];
    }
  }
  return result;
}

function safeFailure(error, credential) {
  return `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`
    .replaceAll(credential, "[REDACTED]")
    .slice(0, 2_000);
}

function gmgnError(error, credential) {
  const diagnostic = safeFailure(error, credential);
  let code = "request_failed";
  let message = "GMGN read-only request failed";
  if (/\b401\b|unauthorized|invalid api.?key/i.test(diagnostic)) {
    code = "authorization_failed";
    message = "GMGN rejected the API key";
  } else if (/\b403\b|forbidden|ip.?whitelist/i.test(diagnostic)) {
    code = "permission_failed";
    message = "GMGN denied the API key or runner IP";
  } else if (/\b429\b|rate.?limit/i.test(diagnostic)) {
    code = "rate_limited";
    message = "GMGN rate limit reached";
  } else if (/timed out|ETIMEDOUT/i.test(diagnostic)) {
    code = "timeout";
    message = "GMGN request timed out";
  } else if (/private.?key|signing.?key/i.test(diagnostic)) {
    code = "signing_key_requested";
    message = "GMGN unexpectedly requested signing material";
  }
  const wrapped = new Error(message);
  wrapped.code = code;
  return wrapped;
}

async function applyBackoff(budget, options) {
  if (typeof budget?.backoff === "function") {
    await budget.backoff(options);
  } else if (typeof budget?.blockFor === "function") {
    await budget.blockFor(options.retryAfterMs ?? options.baseMs);
  }
}

async function runGmgnJson(args, {
  apiKey,
  budget,
  execFileImpl = execFileAsync,
  environment = process.env,
  cliEntry = DEFAULT_CLI_ENTRY,
  nodeExecutable = process.execPath,
  signal,
  timeoutMs = 6_000,
} = {}) {
  const credential = apiKey?.trim() ?? "";
  if (!credential) throw new TypeError("GMGN API key is required");
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    throw new TypeError("GMGN arguments must be strings");
  }
  if (args.includes("swap") || args.includes("order") || args.includes("wallet")) {
    throw new Error("GMGN runtime permits read-only token commands only");
  }
  const permit = await budget.take();
  if (!permit.ok) {
    const error = new Error(`GMGN ${permit.reason.replaceAll("_", " ")}`);
    error.code = permit.reason;
    throw error;
  }

  let result;
  try {
    result = await execFileImpl(nodeExecutable, [cliEntry, ...args], {
      encoding: "utf8",
      env: childEnvironment(environment, credential),
      maxBuffer: 4_000_000,
      timeout: timeoutMs,
      windowsHide: true,
      signal,
      cwd: os.tmpdir(),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const wrapped = gmgnError(error, credential);
    if (wrapped.code === "rate_limited") {
      await applyBackoff(budget, {
        retryAfterMs: 15 * 60 * 1_000,
        baseMs: 30_000,
        maximumMs: 24 * 60 * 60 * 1_000,
      });
    } else if (["authorization_failed", "permission_failed", "signing_key_requested"].includes(wrapped.code)) {
      await applyBackoff(budget, {
        retryAfterMs: 24 * 60 * 60 * 1_000,
        baseMs: 24 * 60 * 60 * 1_000,
        maximumMs: 24 * 60 * 60 * 1_000,
      });
    } else {
      await applyBackoff(budget, {
        baseMs: 30_000,
        maximumMs: 15 * 60 * 1_000,
      });
    }
    throw wrapped;
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    await applyBackoff(budget, { baseMs: 30_000, maximumMs: 5 * 60 * 1_000 });
    const error = new Error("GMGN returned malformed JSON");
    error.code = "malformed_response";
    throw error;
  }
  await budget.succeed?.();
  return payload;
}

function flattenTokenInfo(payload) {
  const stats = payload?.stat ?? {};
  const tags = payload?.wallet_tags_stat ?? {};
  const price = payload?.price ?? {};
  return {
    chain: "sol",
    address: payload?.address,
    name: payload?.name,
    symbol: payload?.symbol,
    price: price.price,
    liquidity: payload?.liquidity ?? payload?.pool?.liquidity,
    market_cap: payload?.market_cap,
    volume: price.volume_5m,
    holder_count: payload?.holder_count ?? stats.holder_count,
    top_10_holder_rate: stats.top_10_holder_rate ?? payload?.dev?.top_10_holder_rate,
    dev_team_hold_rate: stats.dev_team_hold_rate,
    smart_degen_count: tags.smart_wallets,
    renowned_count: tags.renowned_wallets,
    sniper_count: tags.sniper_wallets,
    bundler_rate: stats.bundler_rate,
    bundler_trader_amount_rate: stats.top_bundler_trader_percentage,
    rat_trader_amount_rate: stats.top_rat_trader_percentage,
    bot_degen_rate: stats.bot_degen_rate,
    is_wash_trading: payload?.is_wash_trading,
    rug_ratio: payload?.rug_ratio,
    launchpad_platform: payload?.launchpad_platform,
    exchange: payload?.pool?.exchange,
    creation_timestamp: payload?.creation_timestamp,
  };
}

export async function readGmgnCandidateEvidence({
  apiKey,
  mint,
  budget,
  signal,
  timeoutMs,
  now = () => new Date(),
  execFileImpl,
  environment,
  cliEntry,
  nodeExecutable,
} = {}) {
  if (typeof mint !== "string" || mint.trim() === "") {
    throw new TypeError("GMGN mint is required");
  }
  const payload = await runGmgnJson(
    ["token", "info", "--chain", "sol", "--address", mint.trim(), "--raw"],
    {
      apiKey,
      budget,
      signal,
      timeoutMs,
      execFileImpl,
      environment,
      cliEntry,
      nodeExecutable,
    },
  );
  if (!payload || typeof payload !== "object" || payload.address !== mint.trim()) {
    const error = new Error("GMGN token response did not match the requested mint");
    error.code = "token_data_unavailable";
    throw error;
  }
  const observation = normalizeGmgnToken(flattenTokenInfo(payload), {
    observedAt: new Date(now()).toISOString(),
    sourceMethodVersion: `gmgn-token.info@cli-${CLI_VERSION}`,
  });
  return Object.freeze({
    provider: "gmgn",
    observation,
    capabilities: Object.freeze(["market", "holders", "wallet_labels", "bundler_labels"]),
    partialErrors: Object.freeze([]),
    runtimeAuthority: false,
  });
}

export async function readGmgnPrice(options = {}) {
  const evidence = await readGmgnCandidateEvidence(options);
  const priceUsd = evidence.observation.market.priceUsd;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    const error = new Error("GMGN price is unavailable");
    error.code = "price_unavailable";
    throw error;
  }
  return Object.freeze({
    provider: "gmgn",
    sourceMethodVersion: evidence.observation.sourceMethodVersion,
    mint: evidence.observation.address,
    priceUsd,
    observedAt: evidence.observation.observedAt,
    runtimeAuthority: false,
  });
}

export const gmgnTokenEvidenceConstants = Object.freeze({
  cliVersion: CLI_VERSION,
  cliEntry: DEFAULT_CLI_ENTRY,
});
