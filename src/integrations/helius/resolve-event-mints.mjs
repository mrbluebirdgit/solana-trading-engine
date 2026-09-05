import { heliusRpcRequest } from "./rpc.mjs";
import { PUMP_PROGRAM_ID } from "../pump/program-ids.mjs";
import { decodeBase58 } from "../solana/base58.mjs";

const TARGET_INSTRUCTIONS = Object.freeze([
  Object.freeze({
    eventType: "create",
    discriminator: Object.freeze([24, 30, 200, 40, 5, 28, 7, 119]),
    mintAccountIndex: 0,
  }),
  Object.freeze({
    eventType: "create",
    discriminator: Object.freeze([214, 144, 76, 236, 95, 139, 49, 180]),
    mintAccountIndex: 0,
  }),
  Object.freeze({
    eventType: "migrate",
    discriminator: Object.freeze([155, 234, 231, 146, 236, 158, 162, 30]),
    mintAccountIndex: 2,
  }),
  Object.freeze({
    eventType: "migrate",
    discriminator: Object.freeze([187, 203, 18, 31, 206, 237, 254, 41]),
    mintAccountIndex: 2,
  }),
]);

function publicKey(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.pubkey === "string") return value.pubkey;
  return null;
}

function transactionInstructions(tx) {
  const outer = tx?.transaction?.message?.instructions ?? [];
  const inner = (tx?.meta?.innerInstructions ?? []).flatMap(
    (entry) => entry?.instructions ?? [],
  );
  return [...outer, ...inner];
}

function matchesDiscriminator(data, discriminator) {
  if (typeof data !== "string" || data === "") return false;
  try {
    const decoded = decodeBase58(data, "instruction data");
    return (
      decoded.length >= discriminator.length &&
      discriminator.every((byte, index) => decoded[index] === byte)
    );
  } catch {
    return false;
  }
}

function extractPumpInstructionTargets(tx) {
  const accountKeys = (tx?.transaction?.message?.accountKeys ?? []).map(publicKey);
  const targets = [];

  for (const instruction of transactionInstructions(tx)) {
    const programId =
      publicKey(instruction?.programId) ??
      (Number.isSafeInteger(instruction?.programIdIndex)
        ? accountKeys[instruction.programIdIndex]
        : null);
    if (programId !== PUMP_PROGRAM_ID) continue;

    const layout = TARGET_INSTRUCTIONS.find(
      (candidate) => matchesDiscriminator(instruction?.data, candidate.discriminator),
    );
    if (!layout || !Array.isArray(instruction.accounts)) continue;

    const account = instruction.accounts[layout.mintAccountIndex];
    const mint = Number.isSafeInteger(account) ? accountKeys[account] : publicKey(account);
    if (mint) targets.push({ eventType: layout.eventType, mint });
  }

  return targets.filter(
    (target, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.eventType === target.eventType && candidate.mint === target.mint,
      ) === index,
  );
}

export function extractPumpInstructionMints(tx, eventType) {
  return [
    ...new Set(
      extractPumpInstructionTargets(tx)
        .filter((target) => target.eventType === eventType)
        .map((target) => target.mint),
    ),
  ];
}

export async function getConfirmedTransaction(
  apiKey,
  signature,
  { fetchImpl = fetch, timeoutMs = 10_000, signal } = {},
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
    { fetchImpl, timeoutMs, signal },
  );
}

export async function resolveEventMints(
  apiKey,
  event,
  { fetchImpl = fetch, timeoutMs = 10_000, signal } = {},
) {
  const fromEvent = event?.candidateMints ?? [];
  if (event?.candidateMintScope === "pump_instruction" && fromEvent.length === 1) {
    return Object.freeze({
      mints: [...fromEvent],
      source: "event_pump_instruction",
      signature: event.signature ?? null,
      resolvedEventType: event.eventType ?? null,
    });
  }

  if (!event?.signature) {
    return Object.freeze({ mints: [], source: "missing_signature", signature: null });
  }

  const tx = await getConfirmedTransaction(apiKey, event.signature, {
    fetchImpl,
    timeoutMs,
    signal,
  });
  if (!Number.isSafeInteger(tx?.slot) || tx.slot < 0) {
    return Object.freeze({
      mints: [],
      source: "transaction_slot_unresolved",
      signature: event.signature,
    });
  }
  if (Number.isSafeInteger(event.slot) && tx.slot !== event.slot) {
    return Object.freeze({
      mints: [],
      source: "transaction_slot_mismatch",
      signature: event.signature,
      transactionSlot: tx.slot,
    });
  }
  if (tx?.meta?.err !== null) {
    return Object.freeze({
      mints: [],
      source: "transaction_failed",
      signature: event.signature,
      transactionSlot: tx.slot,
    });
  }
  if (!Number.isSafeInteger(tx?.blockTime) || tx.blockTime < 0) {
    return Object.freeze({
      mints: [],
      source: "transaction_block_time_unresolved",
      signature: event.signature,
      transactionSlot: tx.slot,
    });
  }
  const decodedTargets = extractPumpInstructionTargets(tx);
  const targets = [...new Set(decodedTargets.map(({ mint }) => mint))].map(
    (mint) => Object.freeze({
      mint,
      eventTypes: Object.freeze(
        [...new Set(
          decodedTargets
            .filter((target) => target.mint === mint)
            .map(({ eventType }) => eventType),
        )],
      ),
    }),
  );
  const singleTarget =
    targets.length === 1 && targets[0].eventTypes.length === 1
      ? targets[0]
      : null;
  return Object.freeze({
    mints: targets.map(({ mint }) => mint),
    targets: Object.freeze(targets),
    source:
      targets.length === 1
        ? "getTransaction_pump_instruction"
        : targets.length > 1
          ? "getTransaction_pump_instructions"
          : "pump_instruction_mint_unresolved",
    signature: event.signature,
    transactionSlot: tx.slot,
    blockTime: tx.blockTime,
    resolvedEventType: singleTarget?.eventTypes[0] ?? null,
  });
}

export const pumpInstructionMintLayouts = TARGET_INSTRUCTIONS;
