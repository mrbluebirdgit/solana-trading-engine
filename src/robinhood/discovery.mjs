import { decodeAddressTopic, decodeAddressWord, decodeUintWord, normalizeAddress } from "./abi.mjs";
import { PONS, TOPICS, ZERO_ADDRESS } from "./constants.mjs";

export function parsePonsLaunchLog(log, timestampMs) {
  const emitter = normalizeAddress(log?.address);
  const topic0 = String(log?.topics?.[0] ?? "").toLowerCase();
  if (!emitter || !Number.isFinite(timestampMs)) return null;

  if (emitter === PONS.v2Factory && topic0 === TOPICS.ponsV2TokenLaunched) {
    const token = decodeAddressTopic(log.topics[1]);
    const curve = decodeAddressTopic(log.topics[2]);
    const deployer = decodeAddressTopic(log.topics[3]);
    const quoteToken = decodeAddressWord(log.data, 0) ?? ZERO_ADDRESS;
    const graduationThreshold = decodeUintWord(log.data, 2);
    if (!token || !curve || !deployer) return null;
    return {
      token,
      curve,
      deployer,
      quoteToken,
      graduationThreshold: graduationThreshold?.toString() ?? null,
      launchedAtMs: timestampMs,
      launchBlock: Number(BigInt(log.blockNumber)),
      launchTx: log.transactionHash,
      protocol: "pons_v2",
      factoryProven: true,
    };
  }

  if (
    emitter === PONS.v1Factory &&
    (topic0 === TOPICS.ponsV1TokenLaunched || topic0 === TOPICS.ponsV1TokenDeployed)
  ) {
    const token = decodeAddressTopic(log.topics[1]) ?? decodeAddressWord(log.data, 0);
    if (!token) return null;
    return {
      token,
      curve: null,
      deployer: decodeAddressTopic(log.topics[2]) ?? decodeAddressWord(log.data, 1),
      quoteToken: ZERO_ADDRESS,
      graduationThreshold: null,
      launchedAtMs: timestampMs,
      launchBlock: Number(BigInt(log.blockNumber)),
      launchTx: log.transactionHash,
      protocol: "pons_v1",
      factoryProven: true,
    };
  }

  return null;
}

export function launchLogFilter(fromBlock, toBlock) {
  return {
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    address: [PONS.v2Factory, PONS.v1Factory],
    topics: [[
      TOPICS.ponsV2TokenLaunched,
      TOPICS.ponsV1TokenLaunched,
      TOPICS.ponsV1TokenDeployed,
    ]],
  };
}

