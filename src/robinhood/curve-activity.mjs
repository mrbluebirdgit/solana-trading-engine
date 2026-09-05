import { decodeAddressTopic, decodeUintWord, normalizeAddress } from "./abi.mjs";
import { TOPICS } from "./constants.mjs";

export function curveLogFilter(curves, fromBlock, toBlock) {
  return {
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    address: curves,
    topics: [[TOPICS.curveBuy, TOPICS.curveSell]],
  };
}

export function parseCurveTradeLog(log, timestampMs) {
  const curve = normalizeAddress(log?.address);
  const topic0 = String(log?.topics?.[0] ?? "").toLowerCase();
  const side = topic0 === TOPICS.curveBuy ? "buy" : topic0 === TOPICS.curveSell ? "sell" : null;
  const trader = decodeAddressTopic(log?.topics?.[1]);
  if (!curve || !side || !trader) return null;
  const quoteAmount = side === "buy" ? decodeUintWord(log.data, 0) : decodeUintWord(log.data, 1);
  const tokenAmount = side === "buy" ? decodeUintWord(log.data, 1) : decodeUintWord(log.data, 0);
  return {
    curve,
    side,
    trader,
    recipient: decodeAddressTopic(log?.topics?.[2]),
    quoteAmount: (quoteAmount ?? 0n).toString(),
    tokenAmount: (tokenAmount ?? 0n).toString(),
    timestampMs,
    txHash: log.transactionHash,
  };
}

export function summarizeCurveTrades(trades, nowMs, windowMs = 300_000) {
  const active = trades.filter((trade) => nowMs - trade.timestampMs <= windowMs);
  const buyers = new Set();
  const sellers = new Set();
  let buyQuote = 0n;
  let sellQuote = 0n;
  let buys = 0;
  let sells = 0;
  for (const trade of active) {
    const amount = BigInt(trade.quoteAmount);
    if (trade.side === "buy") {
      buys += 1;
      buyQuote += amount;
      buyers.add(trade.trader);
    } else {
      sells += 1;
      sellQuote += amount;
      sellers.add(trade.trader);
    }
  }
  return {
    buys,
    sells,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size,
    buyQuote: buyQuote.toString(),
    sellQuote: sellQuote.toString(),
  };
}

