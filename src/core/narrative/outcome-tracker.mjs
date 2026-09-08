import { createAtomicJsonStore } from "../runtime/atomic-json-store.mjs";

function iso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new TypeError("outcome timestamp is invalid");
  return date.toISOString();
}

function round(value, places = 4) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function labelFor(milliseconds) {
  if (milliseconds % 3_600_000 === 0) return `${milliseconds / 3_600_000}h`;
  if (milliseconds % 60_000 === 0) return `${milliseconds / 60_000}m`;
  return `${milliseconds / 1_000}s`;
}

function validateLoaded(value, maximumEntries) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    throw new Error("narrative outcome state is invalid");
  }
  if (value.entries.length > maximumEntries) {
    throw new Error("narrative outcome state exceeds its configured bound");
  }
  for (const entry of value.entries) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.mint !== "string" ||
      !Number.isFinite(entry.initialPriceUsd) ||
      entry.initialPriceUsd <= 0 ||
      !Array.isArray(entry.pendingCheckpointsMs) ||
      entry.pendingCheckpointsMs.some((item) => !Number.isSafeInteger(item) || item < 1) ||
      (entry.learningCandidateId !== null &&
        entry.learningCandidateId !== undefined &&
        (typeof entry.learningCandidateId !== "string" || entry.learningCandidateId === ""))
    ) {
      throw new Error("narrative outcome entry is invalid");
    }
    iso(entry.alertedAt);
  }
  return value.entries.map((entry) => ({
    ...entry,
    initialPriceObservedAt: iso(entry.initialPriceObservedAt ?? entry.alertedAt),
  }));
}

function outcomeAlert(entry, checkpointMs, snapshot, returnPercent) {
  const encoded = encodeURIComponent(entry.mint);
  const direction = returnPercent > 0 ? "UP" : returnPercent < 0 ? "DOWN" : "FLAT";
  return Object.freeze({
    title: `RESULT ${labelFor(checkpointMs)} · ${direction} ${returnPercent >= 0 ? "+" : ""}${returnPercent.toFixed(2)}%`,
    body: [
      `narrative: ${entry.narrativeLabel}`,
      `token: ${entry.tokenName ?? "unknown"} (${entry.tokenSymbol ?? "unknown"})`,
      `mint: ${entry.mint}`,
      `alert price: $${entry.initialPriceUsd}`,
      `current price: $${snapshot.priceUsd}`,
      `price source: ${snapshot.provider}`,
      "measurement: point-to-point price change; no fees or slippage included",
      "authority: observe only",
      `Pump: https://pump.fun/coin/${encoded}`,
      `DexScreener: https://dexscreener.com/solana/${encoded}`,
    ].join("\n"),
    priority: "default",
    runtimeAuthority: false,
  });
}

export function createNarrativeOutcomeTracker({
  statePath,
  checkpointsMs,
  readPrice,
  append,
  deliver,
  notify = true,
  clock = () => new Date(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  createStoreImpl = createAtomicJsonStore,
  maximumEntries = 1_000,
  logger = console,
  onOutcome = null,
} = {}) {
  if (!Array.isArray(checkpointsMs) || checkpointsMs.length === 0) {
    throw new TypeError("outcome checkpoints are required");
  }
  if (typeof readPrice !== "function" || typeof append !== "function") {
    throw new TypeError("outcome readPrice and append functions are required");
  }
  if (notify && typeof deliver !== "function") {
    throw new TypeError("outcome delivery is required when notifications are enabled");
  }
  if (onOutcome !== null && typeof onOutcome !== "function") {
    throw new TypeError("onOutcome must be a function or null");
  }

  const checkpoints = Object.freeze([...new Set(checkpointsMs)].sort((a, b) => a - b));
  const store = createStoreImpl({
    filePath: statePath,
    defaultValue: { schemaVersion: 1, entries: [] },
  });
  const controller = new AbortController();
  let entries = [];
  let timer = null;
  let running = null;
  let tail = Promise.resolve();
  let started = false;
  let stopped = false;
  const state = {
    trackedAlerts: 0,
    completedCheckpoints: 0,
    failedCheckpoints: 0,
    learnedOutcomes: 0,
    failedLearningUpdates: 0,
    lastCheckpointAt: null,
    healthy: false,
    lastError: null,
  };

  function serialize(operation) {
    const pending = tail.catch(() => {}).then(operation);
    tail = pending.catch(() => {});
    return pending;
  }

  async function save() {
    await store.save({ schemaVersion: 1, entries });
  }

  function nextDueAt() {
    let earliest = null;
    for (const entry of entries) {
      const alertedAtMs = new Date(entry.alertedAt).valueOf();
      for (const checkpointMs of entry.pendingCheckpointsMs) {
        const due = alertedAtMs + checkpointMs;
        if (earliest === null || due < earliest) earliest = due;
      }
    }
    return earliest;
  }

  function schedule() {
    if (!started || stopped || timer !== null) return;
    const dueAt = nextDueAt();
    if (dueAt === null) return;
    const nowMs = new Date(clock()).valueOf();
    const delay = Math.max(0, Math.min(2_147_483_647, dueAt - nowMs));
    timer = setTimeoutImpl(() => {
      timer = null;
      void tick().catch((error) => {
        state.healthy = false;
        state.lastError = error instanceof Error ? error.message.slice(0, 300) : "outcome tick failed";
        logger.error(`[narrative-outcome] ${state.lastError}`);
      });
    }, delay);
    timer?.unref?.();
  }

  async function processCheckpoint(entry, checkpointMs) {
    const observedAt = iso(clock());
    try {
      const snapshot = await readPrice({
        mint: entry.mint,
        signal: controller.signal,
      });
      const returnPercent = round(
        ((snapshot.priceUsd / entry.initialPriceUsd) - 1) * 100,
      );
      await append({
        schemaVersion: 1,
        recordType: "narrative_alert_outcome",
        observedAt,
        alertId: entry.id,
        mint: entry.mint,
        narrativeLabel: entry.narrativeLabel,
        checkpointMs,
        checkpointLabel: labelFor(checkpointMs),
        alertedAt: entry.alertedAt,
        initialPriceUsd: entry.initialPriceUsd,
        initialPriceProvider: entry.initialPriceProvider,
        initialPriceObservedAt: entry.initialPriceObservedAt,
        priceUsd: snapshot.priceUsd,
        priceProvider: snapshot.provider,
        priceObservedAt: snapshot.observedAt,
        returnPercent,
        measurement: "point_to_point_price_change_excluding_fees_and_slippage",
        runtimeAuthority: false,
      });
      state.completedCheckpoints += 1;
      state.lastCheckpointAt = observedAt;
      if (onOutcome && entry.learningCandidateId) {
        try {
          const learning = await onOutcome({
            candidateId: entry.learningCandidateId,
            horizonMs: checkpointMs,
            returnPercent,
            adverseOutcome: false,
            observedAt,
          });
          if (learning?.learned === true) state.learnedOutcomes += 1;
          if (learning?.recommendation) {
            await append({
              schemaVersion: 1,
              recordType: "the_lawyer_recommendation",
              observedAt: iso(clock()),
              alertId: entry.id,
              candidateId: entry.learningCandidateId,
              mint: entry.mint,
              recommendation: learning.recommendation,
              runtimeAuthority: false,
            });
          }
        } catch (error) {
          state.failedLearningUpdates += 1;
          try {
            await append({
              schemaVersion: 1,
              recordType: "the_lawyer_learning_failed",
              observedAt: iso(clock()),
              alertId: entry.id,
              candidateId: entry.learningCandidateId,
              mint: entry.mint,
              checkpointMs,
              reason: error instanceof Error ? error.message.slice(0, 300) : "learning failed",
              runtimeAuthority: false,
            });
          } catch {
            logger.error("[narrative-outcome] THE LAWYER learning failure could not be recorded");
          }
        }
      }
      if (notify) {
        try {
          await deliver(outcomeAlert(entry, checkpointMs, snapshot, returnPercent));
        } catch (error) {
          await append({
            schemaVersion: 1,
            recordType: "narrative_outcome_notification_failed",
            observedAt: iso(clock()),
            alertId: entry.id,
            mint: entry.mint,
            checkpointMs,
            reason: error instanceof Error ? error.message.slice(0, 300) : "delivery failed",
            runtimeAuthority: false,
          });
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      state.failedCheckpoints += 1;
      await append({
        schemaVersion: 1,
        recordType: "narrative_alert_outcome_failed",
        observedAt,
        alertId: entry.id,
        mint: entry.mint,
        narrativeLabel: entry.narrativeLabel,
        checkpointMs,
        checkpointLabel: labelFor(checkpointMs),
        reason: error instanceof Error ? error.message.slice(0, 300) : "price check failed",
        runtimeAuthority: false,
      });
    }
  }

  async function performTick() {
    const nowMs = new Date(clock()).valueOf();
    for (const entry of entries) {
      const alertedAtMs = new Date(entry.alertedAt).valueOf();
      const due = entry.pendingCheckpointsMs.filter(
        (checkpointMs) => alertedAtMs + checkpointMs <= nowMs,
      );
      for (const checkpointMs of due) {
        if (controller.signal.aborted) return;
        await processCheckpoint(entry, checkpointMs);
        entry.pendingCheckpointsMs = entry.pendingCheckpointsMs.filter(
          (item) => item !== checkpointMs,
        );
        await save();
      }
    }
    entries = entries.filter((entry) => entry.pendingCheckpointsMs.length > 0);
    await save();
    state.healthy = true;
    state.lastError = null;
  }

  function tick() {
    if (stopped) return Promise.resolve();
    if (!running) {
      running = serialize(performTick).finally(() => {
        running = null;
        schedule();
      });
    }
    return running;
  }

  async function start() {
    return serialize(async () => {
      entries = validateLoaded(await store.load(), maximumEntries);
      state.trackedAlerts = entries.length;
      state.healthy = true;
      state.lastError = null;
      started = true;
      schedule();
      return snapshot();
    });
  }

  async function trackNow({
    mint,
    narrativeLabel,
    tokenName = null,
    tokenSymbol = null,
    alertedAt,
    initialPriceUsd,
    initialPriceProvider,
    initialPriceObservedAt = alertedAt,
    learningCandidateId = null,
  } = {}) {
    if (!started || stopped) throw new Error("outcome tracker is not running");
    if (typeof mint !== "string" || mint.trim() === "") {
      throw new TypeError("tracked mint is required");
    }
    const alertTimestamp = iso(alertedAt);
    if (!Number.isFinite(initialPriceUsd) || initialPriceUsd <= 0) {
      await append({
        schemaVersion: 1,
        recordType: "narrative_alert_outcome_unavailable",
        observedAt: iso(clock()),
        mint: mint.trim(),
        narrativeLabel,
        alertedAt: alertTimestamp,
        reason: "price_at_alert_unavailable",
        runtimeAuthority: false,
      });
      return false;
    }
    if (
      learningCandidateId !== null &&
      (typeof learningCandidateId !== "string" || learningCandidateId.trim() === "")
    ) {
      throw new TypeError("learningCandidateId must be a non-empty string or null");
    }
    const id = `${mint.trim()}:${alertTimestamp}`;
    if (entries.some((entry) => entry.id === id)) return false;
    if (entries.length >= maximumEntries) {
      throw new Error("narrative outcome tracker capacity reached");
    }
    entries.push({
      id,
      mint: mint.trim(),
      narrativeLabel: typeof narrativeLabel === "string" ? narrativeLabel : "unknown",
      tokenName: typeof tokenName === "string" ? tokenName : null,
      tokenSymbol: typeof tokenSymbol === "string" ? tokenSymbol : null,
      alertedAt: alertTimestamp,
      initialPriceUsd,
      initialPriceProvider:
        typeof initialPriceProvider === "string" ? initialPriceProvider : "unknown",
      initialPriceObservedAt: iso(initialPriceObservedAt),
      learningCandidateId:
        typeof learningCandidateId === "string" && learningCandidateId.trim() !== ""
          ? learningCandidateId.trim()
          : null,
      pendingCheckpointsMs: [...checkpoints],
    });
    state.trackedAlerts += 1;
    await save();
    if (timer !== null) {
      clearTimeoutImpl(timer);
      timer = null;
    }
    schedule();
    return true;
  }

  function track(input) {
    return serialize(() => trackNow(input));
  }

  function snapshot() {
    return Object.freeze({
      ...state,
      activeAlerts: entries.length,
      pendingCheckpoints: entries.reduce(
        (total, entry) => total + entry.pendingCheckpointsMs.length,
        0,
      ),
      nextCheckpointAt: nextDueAt() === null ? null : new Date(nextDueAt()).toISOString(),
      runtimeAuthority: false,
    });
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    controller.abort();
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
    try { await running; } catch {}
    await tail;
    await save();
    await store.flush();
  }

  return Object.freeze({ start, track, tick, snapshot, stop });
}

export const narrativeOutcomeConstants = Object.freeze({ labelFor });
