import {
  NATIVE_SOL_MINT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
} from "../pump/program-ids.mjs";

const STREAM_VERSION = "helius-stream-events.v1";

const CREATE_LOG = /Instruction:\s*(CreateEvent|CreateV2|Create|InitializeMint2|InitializeMint)/i;
const MIGRATE_LOG = /Instruction:\s*(MigrateV2|Migrate)/i;
const SWAP_LOG = /Instruction:\s*(Buy|Sell|Swap)/i;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function collectMints(node, into = []) {
  if (!node || typeof node !== "object") return into;
  if (Array.isArray(node)) {
    for (const item of node) collectMints(item, into);
    return into;
  }
  if (typeof node.mint === "string") into.push(node.mint);
  if (typeof node.tokenMint === "string") into.push(node.tokenMint);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectMints(value, into);
  }
  return into;
}

export function verifyWebhookAuth(provided, expected) {
  const got = typeof provided === "string" ? provided.trim() : "";
  const want = typeof expected === "string" ? expected.trim() : "";
  if (!want) {
    throw new Error("webhook auth token is not configured");
  }
  if (!got || got !== want) {
    throw new Error("webhook auth token rejected");
  }
  return true;
}

export function classifyPumpLogs(logs = []) {
  const text = Array.isArray(logs) ? logs.join("\n") : String(logs ?? "");
  if (CREATE_LOG.test(text)) return "create";
  if (MIGRATE_LOG.test(text)) return "migrate";
  if (SWAP_LOG.test(text)) return "swap";
  return "unknown";
}

export function extractCandidateMints(payload) {
  const mints = collectMints(payload).filter(
    (mint) => mint !== NATIVE_SOL_MINT,
  );
  return unique(mints);
}

export function parseLogsNotification(message) {
  const result = message?.params?.result ?? message?.result ?? message;
  const value = result?.value ?? result;
  const logs = value?.logs ?? value?.logMessages ?? [];
  return Object.freeze({
    streamVersion: STREAM_VERSION,
    source: "helius",
    kind: "logs",
    signature: value?.signature ?? result?.signature ?? null,
    slot: result?.context?.slot ?? result?.slot ?? null,
    err: value?.err ?? null,
    logs: Array.isArray(logs) ? logs : [],
    eventType: classifyPumpLogs(logs),
    candidateMints: extractCandidateMints(value),
    mentionsPump:
      JSON.stringify(value ?? {}).includes(PUMP_PROGRAM_ID) ||
      JSON.stringify(value ?? {}).includes(PUMPSWAP_PROGRAM_ID) ||
      classifyPumpLogs(logs) !== "unknown",
    runtimeAuthority: false,
  });
}

export function parseEnhancedTransaction(tx) {
  const logs = tx?.logs ?? tx?.logMessages ?? tx?.meta?.logMessages ?? [];
  return Object.freeze({
    streamVersion: STREAM_VERSION,
    source: "helius",
    kind: "enhanced_transaction",
    signature: tx?.signature ?? null,
    slot: tx?.slot ?? null,
    timestamp: tx?.timestamp ?? null,
    type: tx?.type ?? null,
    description: tx?.description ?? null,
    eventType: classifyPumpLogs(logs),
    candidateMints: extractCandidateMints(tx),
    runtimeAuthority: false,
  });
}

export function parseHeliusWebhookPayload(body) {
  const items = Array.isArray(body) ? body : body ? [body] : [];
  return items.map(parseEnhancedTransaction);
}

export const heliusStreamConstants = Object.freeze({
  streamVersion: STREAM_VERSION,
  pumpProgramId: PUMP_PROGRAM_ID,
  pumpSwapProgramId: PUMPSWAP_PROGRAM_ID,
  logsSubscribeRequest: Object.freeze({
    jsonrpc: "2.0",
    id: 1,
    method: "logsSubscribe",
    params: [{ mentions: [PUMP_PROGRAM_ID] }, { commitment: "confirmed" }],
  }),
});
