import { inspectRobinhoodToken } from "./blockscout.mjs";
import { curveLogFilter, parseCurveTradeLog, summarizeCurveTrades } from "./curve-activity.mjs";
import { evaluateEarlyMomentum } from "./decision.mjs";
import { fetchBestRobinhoodPair } from "./dexscreener.mjs";
import { launchLogFilter, parsePonsLaunchLog } from "./discovery.mjs";
import { formatMomentumAlert } from "./format-alert.mjs";
import { startHealthServer } from "./health-server.mjs";
import { JsonRpcClient } from "./rpc-client.mjs";
import { loadWatcherState, saveWatcherState } from "./state-store.mjs";
import { sendTelegramAlert } from "./telegram.mjs";
import { readTokenMetadata } from "./token-metadata.mjs";

async function timestampsForLogs(rpc, logs) {
  const blocks = [...new Set(logs.map((log) => Number(BigInt(log.blockNumber))))];
  const entries = await Promise.all(blocks.map(async (number) => {
    const block = await rpc.getBlock(number);
    return [number, Number(BigInt(block.timestamp)) * 1000];
  }));
  return new Map(entries);
}

function compactCandidate(candidate) {
  return {
    ...candidate,
    trades: candidate.trades.slice(-5_000),
    metadata: candidate.metadata ?? null,
    previousPair: candidate.previousPair ?? null,
    alertStage: candidate.alertStage ?? null,
    lastEnrichedAtMs: candidate.lastEnrichedAtMs ?? 0,
  };
}

export async function startRobinhoodWatcher({ config, fetchImpl = fetch, now = Date.now } = {}) {
  const rpc = new JsonRpcClient({ url: config.rpcUrl, fetchImpl });
  const persisted = await loadWatcherState(config.statePath);
  const state = { lastBlock: persisted.lastBlock, candidates: {} };
  for (const [token, candidate] of Object.entries(persisted.candidates)) {
    state.candidates[token] = compactCandidate({ trades: [], ...candidate });
  }
  const runtime = { ready: false, lastPollAt: null, lastError: null, candidates: 0 };
  const health = startHealthServer({ port: config.healthPort, status: () => ({ ...runtime }) });
  let stopped = false;
  let timer = null;
  let polling = false;

  async function poll() {
    if (stopped || polling) return;
    polling = true;
    try {
      const latest = await rpc.blockNumber();
      if (!state.lastBlock) state.lastBlock = Math.max(0, latest - config.startLookbackBlocks);
      const fromBlock = state.lastBlock + 1;
      const toBlock = Math.min(latest, fromBlock + 999);
      if (fromBlock <= toBlock) {
        const launches = await rpc.getLogs(launchLogFilter(fromBlock, toBlock));
        const launchTimes = await timestampsForLogs(rpc, launches);
        for (const log of launches) {
          const parsed = parsePonsLaunchLog(log, launchTimes.get(Number(BigInt(log.blockNumber))));
          if (!parsed || state.candidates[parsed.token]) continue;
          const metadata = await readTokenMetadata(rpc, parsed.token);
          state.candidates[parsed.token] = compactCandidate({ ...parsed, metadata, trades: [] });
          console.error(`[robinhood] launch ${metadata.symbol} ${parsed.token}`);
        }

        const curves = Object.values(state.candidates).map((candidate) => candidate.curve).filter(Boolean);
        if (curves.length > 0) {
          const logs = await rpc.getLogs(curveLogFilter(curves, fromBlock, toBlock));
          const tradeTimes = await timestampsForLogs(rpc, logs);
          for (const log of logs) {
            const trade = parseCurveTradeLog(log, tradeTimes.get(Number(BigInt(log.blockNumber))));
            if (!trade) continue;
            const candidate = Object.values(state.candidates).find((item) => item.curve === trade.curve);
            if (candidate && !candidate.trades.some((item) => item.txHash === trade.txHash && item.side === trade.side)) {
              candidate.trades.push(trade);
            }
          }
        }
        state.lastBlock = toBlock;
      }

      const currentTime = now();
      for (const [token, candidate] of Object.entries(state.candidates)) {
        if (currentTime - candidate.launchedAtMs > config.maxAgeMs) {
          delete state.candidates[token];
          continue;
        }
        if (currentTime - candidate.lastEnrichedAtMs < config.enrichmentMs) continue;
        candidate.lastEnrichedAtMs = currentTime;
        const pair = await fetchBestRobinhoodPair(token, { fetchImpl }).catch(() => null);
        if (!pair || pair.liquidityUsd < config.minScoutLiquidityUsd * 0.6) {
          candidate.previousPair = pair;
          continue;
        }
        const curve = summarizeCurveTrades(candidate.trades, currentTime);
        const security = await inspectRobinhoodToken(token, { fetchImpl });
        const decision = evaluateEarlyMomentum({
          candidate,
          pair,
          curve,
          security,
          previousPair: candidate.previousPair,
          nowMs: currentTime,
          config,
        });
        const isUpgrade = decision.verdict === "STRONG_MOMENTUM" && candidate.alertStage === "EARLY_WATCH";
        const isFirst = ["EARLY_WATCH", "STRONG_MOMENTUM"].includes(decision.verdict) && !candidate.alertStage;
        if (isFirst || isUpgrade) {
          const message = formatMomentumAlert({ candidate, pair, curve, security, decision, metadata: candidate.metadata, nowMs: currentTime });
          await sendTelegramAlert({ token: config.telegramToken, chatId: config.telegramChatId, text: message, fetchImpl });
          candidate.alertStage = decision.verdict;
        }
        candidate.previousPair = pair;
      }

      runtime.ready = true;
      runtime.lastPollAt = new Date().toISOString();
      runtime.lastError = null;
      runtime.candidates = Object.keys(state.candidates).length;
      await saveWatcherState(config.statePath, state);
    } catch (error) {
      runtime.lastError = error instanceof Error ? error.message : "poll failed";
      console.error(`[robinhood] poll failed: ${runtime.lastError}`);
    } finally {
      polling = false;
      if (!stopped) timer = setTimeout(poll, config.pollMs);
    }
  }

  void poll();
  return {
    status: () => ({ ...runtime }),
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      while (polling) await new Promise((resolve) => setTimeout(resolve, 25));
      await saveWatcherState(config.statePath, state);
      await health.close();
    },
  };
}

