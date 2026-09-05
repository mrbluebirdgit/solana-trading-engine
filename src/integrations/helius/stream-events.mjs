import {
  NATIVE_SOL_MINT,
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
} from "../pump/program-ids.mjs";

const STREAM_VERSION = "helius-stream-events.v1";
const LOGS_SUBSCRIBE_REQUEST_ID = 1;

const INSTRUCTION_LOG = /^Program log: Instruction:\s*([A-Za-z0-9_]+)\s*$/;
const PROGRAM_INVOKE_LOG = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]$/;
const PROGRAM_RETURN_LOG = /^Program ([1-9A-HJ-NP-Za-km-z]+) (?:success|failed:)/;

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

function classifyPumpLogDetails(logs = []) {
  const lines = Array.isArray(logs) ? logs : [String(logs ?? "")];
  const stack = [];
  const names = [];
  for (const line of lines) {
    const invoked = String(line).match(PROGRAM_INVOKE_LOG);
    if (invoked) {
      const depth = Number(invoked[2]);
      stack.length = Math.max(0, depth - 1);
      stack.push(invoked[1]);
      continue;
    }
    const returned = String(line).match(PROGRAM_RETURN_LOG);
    if (returned) {
      if (stack.at(-1) === returned[1]) stack.pop();
      continue;
    }
    const instruction = String(line).match(INSTRUCTION_LOG);
    if (instruction && stack.at(-1) === PUMP_PROGRAM_ID) {
      names.push(instruction[1]);
    }
  }

  const hasCreate = names.some((name) => name === "Create" || name === "CreateV2");
  const hasMigrate = names.some((name) => name === "Migrate" || name === "MigrateV2");
  if (hasCreate && hasMigrate) {
    return Object.freeze({
      eventType: "lifecycle",
      classificationError: null,
    });
  }
  if (hasMigrate) return Object.freeze({ eventType: "migrate", classificationError: null });
  if (hasCreate) return Object.freeze({ eventType: "create", classificationError: null });
  if (names.some((name) => ["Buy", "Sell", "Swap"].includes(name))) {
    return Object.freeze({ eventType: "swap", classificationError: null });
  }
  return Object.freeze({ eventType: "unknown", classificationError: null });
}

export function classifyPumpLogs(logs = []) {
  return classifyPumpLogDetails(logs).eventType;
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
  const rawLogs = value?.logs ?? value?.logMessages;
  const logsValid = Array.isArray(rawLogs) &&
    rawLogs.length > 0 &&
    rawLogs.every((line) => typeof line === "string" && line.trim() !== "");
  const logs = logsValid ? rawLogs : [];
  const classification = classifyPumpLogDetails(logs);
  return Object.freeze({
    streamVersion: STREAM_VERSION,
    source: "helius",
    kind: "logs",
    signature: value?.signature ?? result?.signature ?? null,
    slot: result?.context?.slot ?? result?.slot ?? null,
    subscriptionId: message?.params?.subscription ?? null,
    err: value?.err ?? null,
    logs: Array.isArray(logs) ? logs : [],
    logsValid,
    eventType: classification.eventType,
    classificationError: classification.classificationError,
    candidateMints: extractCandidateMints(value),
    mentionsPump:
      JSON.stringify(value ?? {}).includes(PUMP_PROGRAM_ID) ||
      JSON.stringify(value ?? {}).includes(PUMPSWAP_PROGRAM_ID) ||
      classification.eventType !== "unknown",
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
    id: LOGS_SUBSCRIBE_REQUEST_ID,
    method: "logsSubscribe",
    params: [{ mentions: [PUMP_PROGRAM_ID] }, { commitment: "confirmed" }],
  }),
  logsSubscribeRequestId: LOGS_SUBSCRIBE_REQUEST_ID,
});
