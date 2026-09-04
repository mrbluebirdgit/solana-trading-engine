import { extractCandidateMints } from "./stream-events.mjs";
import { heliusRpcRequest } from "./rpc.mjs";

export async function getConfirmedTransaction(
  apiKey,
  signature,
  { fetchImpl = fetch, timeoutMs = 10_000 } = {},
) {
  if (typeof signature !== "string" || signature.trim() === "") {
    throw new TypeError("signature is required");
  }

  return heliusRpcRequest(
    apiKey,
    "getTransaction",
    [
      signature.trim(),
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      },
    ],
    { fetchImpl, timeoutMs },
  );
}

export async function resolveEventMints(
  apiKey,
  event,
  { fetchImpl = fetch, timeoutMs = 10_000 } = {},
) {
  const fromEvent = event?.candidateMints ?? [];
  if (fromEvent.length > 0) {
    return Object.freeze({
      mints: fromEvent,
      source: "event",
      signature: event.signature ?? null,
    });
  }

  if (!event?.signature) {
    return Object.freeze({ mints: [], source: "missing_signature", signature: null });
  }

  const tx = await getConfirmedTransaction(apiKey, event.signature, {
    fetchImpl,
    timeoutMs,
  });
  return Object.freeze({
    mints: extractCandidateMints(tx),
    source: "getTransaction",
    signature: event.signature,
  });
}
