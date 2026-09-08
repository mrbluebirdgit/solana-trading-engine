import { BoundedTaskQueue } from "./bounded-task-queue.mjs";
import { startHealthServer } from "./health-server.mjs";
import { createObservationLedger } from "./observation-ledger.mjs";
import { createNarrativeRadar } from "./narrative-radar.mjs";
import { TtlDeduper } from "./ttl-deduper.mjs";
import { observeOpportunity } from "../intelligence/observe-opportunity.mjs";
import { createObservationNotification } from "../alerts/notification-gate.mjs";
import { deliverTelegramBotAlert } from "../../integrations/alerts/deliver.mjs";
import { runPumpLogsObserver } from "../../integrations/helius/logs-observer.mjs";
import { resolveEventMints } from "../../integrations/helius/resolve-event-mints.mjs";
import { checkHeliusHealth } from "../../integrations/helius/health.mjs";
import { checkJupiterReadAccess } from "../../integrations/jupiter/read-health.mjs";

const RETRY_DELAYS_MS = Object.freeze([1_000, 3_000, 7_000]);
const RETRYABLE_MINT_RESOLUTION_SOURCES = new Set([
  "pump_instruction_mint_unresolved",
  "transaction_block_time_unresolved",
  "transaction_slot_unresolved",
]);

function timestamp(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new TypeError("observer clock returned an invalid timestamp");
  }
  return date.toISOString();
}

function ageMilliseconds(observedAt, clock) {
  const observed = new Date(observedAt).valueOf();
  const currentValue = clock();
  const current = new Date(currentValue instanceof Date ? currentValue : currentValue).valueOf();
  if (!Number.isFinite(observed) || !Number.isFinite(current) || current < observed) {
    return Number.POSITIVE_INFINITY;
  }
  return current - observed;
}

function safeError(error, secrets = []) {
  let message = error instanceof Error ? error.message : "operation failed";
  for (const secret of secrets) {
    if (typeof secret === "string" && secret !== "") {
      message = message.replaceAll(secret, "[REDACTED]");
    }
  }
  return message.slice(0, 500);
}

function abortedError() {
  const error = new Error("observer operation aborted");
  error.name = "AbortError";
  return error;
}

function sleep(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortedError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    function onAbort() {
      clearTimeout(timer);
      reject(abortedError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function withRetries(
  operation,
  {
    accept = () => true,
    delays = RETRY_DELAYS_MS,
    deadlineAtMs = null,
    nowMilliseconds = Date.now,
    retry = () => true,
    sleepImpl = sleep,
    signal,
  } = {},
) {
  let lastValue;
  let lastError = null;
  let attempts = 0;
  let deadlineExceeded = false;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (signal?.aborted) throw abortedError();
    const beforeAttempt = nowMilliseconds();
    if (
      deadlineAtMs !== null &&
      (!Number.isFinite(beforeAttempt) || beforeAttempt >= deadlineAtMs)
    ) {
      deadlineExceeded = true;
      break;
    }

    let deadlineSignal = null;
    let attemptSignal = signal;
    if (deadlineAtMs !== null) {
      deadlineSignal = AbortSignal.timeout(
        Math.max(1, Math.ceil(deadlineAtMs - beforeAttempt)),
      );
      attemptSignal = signal
        ? AbortSignal.any([signal, deadlineSignal])
        : deadlineSignal;
    }
    attempts += 1;
    try {
      lastValue = await operation(attempts, attemptSignal);
      lastError = null;
      if (accept(lastValue)) {
        return Object.freeze({
          ok: true,
          value: lastValue,
          attempts,
          deadlineExceeded: false,
        });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      if (deadlineSignal?.aborted) {
        lastError = new Error("event processing deadline exceeded");
        deadlineExceeded = true;
        break;
      }
      if (error?.name === "AbortError") throw error;
      lastError = error;
    }
    if (!retry({ value: lastValue, error: lastError })) break;
    if (attempt < delays.length) {
      if (deadlineAtMs !== null) {
        const remainingMs = deadlineAtMs - nowMilliseconds();
        if (!Number.isFinite(remainingMs) || remainingMs <= delays[attempt]) {
          deadlineExceeded = remainingMs <= 0;
          break;
        }
      }
      await sleepImpl(delays[attempt], signal);
    }
  }
  return Object.freeze({
    ok: false,
    value: lastValue,
    error: lastError,
    attempts,
    deadlineExceeded,
  });
}

function eventRecord(event, ingestedAt) {
  return Object.freeze({
    schemaVersion: 1,
    recordType: "pump_log_event",
    ingestedAt,
    source: event.source ?? "helius",
    streamVersion: event.streamVersion ?? null,
    signature: event.signature ?? null,
    slot: event.slot ?? null,
    eventType: event.eventType ?? "unknown",
    classifiedEventType: event.eventType ?? "unknown",
    candidateMints: Array.isArray(event.candidateMints)
      ? [...event.candidateMints]
      : [],
    logs: Array.isArray(event.logs) ? [...event.logs] : [],
    runtimeAuthority: false,
  });
}

function targetEvent(event) {
  return ["create", "migrate", "lifecycle"].includes(event?.eventType);
}

function validTargetIdentity(event) {
  return Boolean(
    typeof event?.signature === "string" &&
    event.signature.trim() !== "" &&
    Number.isSafeInteger(event?.slot) &&
    event.slot >= 0,
  );
}

function outcomeOf(observation) {
  if (
    ["complete", "candidate_rejection", "provider_failure"].includes(
      observation?.observationOutcome,
    )
  ) {
    return observation.observationOutcome;
  }
  if (
    observation?.stageErrorScope === "candidate" ||
    observation?.quoteErrorScope === "candidate"
  ) {
    return "candidate_rejection";
  }
  if (
    observation?.decision?.decision === "ALERT_ONLY" &&
    observation?.quotes &&
    !observation?.quoteError
  ) {
    return "complete";
  }
  return "provider_failure";
}

export async function startObserverWorker({
  config,
  clock = () => new Date(),
  logger = console,
  sleepImpl = sleep,
  createLedgerImpl = createObservationLedger,
  startHealthServerImpl = startHealthServer,
  runObserverImpl = runPumpLogsObserver,
  resolveMintsImpl = resolveEventMints,
  observeOpportunityImpl = observeOpportunity,
  checkHeliusHealthImpl = checkHeliusHealth,
  checkJupiterReadAccessImpl = checkJupiterReadAccess,
  deliverTelegramImpl = deliverTelegramBotAlert,
  createNarrativeRadarImpl = createNarrativeRadar,
} = {}) {
  if (!config || config.mode !== "observe") {
    throw new TypeError("an observe-only runtime configuration is required");
  }
  if (config.includeSwaps === true) {
    throw new Error("swap observation is not implemented for the full Pump and PumpSwap lifecycle");
  }

  const ingressQueue = new BoundedTaskQueue({
    concurrency: 1,
    maxQueued: config.maximumQueuedEvents,
  });
  const enrichmentQueue = new BoundedTaskQueue({
    concurrency: config.eventConcurrency,
    maxQueued: config.maximumQueuedEvents,
  });
  const deduper = new TtlDeduper({
    ttlMs: config.dedupeTtlMs,
    maxEntries: config.maximumDedupeEntries,
  });
  const ledger = createLedgerImpl({ filePath: config.observationLogPath });
  const shutdownController = new AbortController();
  const secrets = [
    config.heliusApiKey,
    config.jupiterApiKey,
    config.telegramBotToken,
    config.xBearerToken,
    config.lunarCrushApiKey,
    config.newsApiKey,
    config.birdeyeApiKey,
    config.gmgnApiKey,
    config.solscanApiKey,
  ].filter(Boolean);
  const state = {
    observerState: "starting",
    stopping: false,
    storageHealthy: false,
    notificationHealthy: config.notify ? false : true,
    ingestionHealthy: true,
    enrichmentHealthy: true,
    providerHealthy: false,
    narrativeHealthy: config.narrativeRadarEnabled ? false : true,
    narrativeMintHealthy: true,
    lastSuccessfulEnrichmentAt: null,
    lastSeenAt: null,
    lastEventAt: null,
    acceptedEvents: 0,
    overloadedEvents: 0,
    enrichmentSkippedEvents: 0,
    failedEvents: 0,
    abstainedEvents: 0,
    invalidEvents: 0,
    narrativeFailedMints: 0,
  };
  let controller = null;
  let health = null;
  let narrativeRadar = null;
  let stopPromise = null;
  let hasSubscribed = false;
  let streamGapOpen = false;
  let notificationFailureLatched = false;
  let fatalReason = null;
  let resolveFatal;
  const fatal = new Promise((resolve) => { resolveFatal = resolve; });

  function signalFatal(reason) {
    if (fatalReason !== null) return;
    fatalReason = reason;
    resolveFatal(reason);
  }

  function snapshot() {
    const ingressState = ingressQueue.snapshot();
    const enrichmentState = enrichmentQueue.snapshot();
    const narrativeState = narrativeRadar?.state() ?? null;
    return Object.freeze({
      ...state,
      narrativeHealthy: narrativeState?.healthy ?? state.narrativeHealthy,
      narrativeLastTickAt: narrativeState?.lastTickAt ?? null,
      narrativeLastSuccessfulTickAt: narrativeState?.lastSuccessfulTickAt ?? null,
      narrativeCount: narrativeState?.narrativeCount ?? 0,
      narrativeSampleCount: narrativeState?.sampleCount ?? 0,
      narrativeMintCount: narrativeState?.mintCount ?? 0,
      narrativeMatchesObserved: narrativeState?.matchesObserved ?? 0,
      narrativeAlertsSent: narrativeState?.alertsSent ?? 0,
      narrativeProviderEvidenceAttempts:
        narrativeState?.providerEvidenceAttempts ?? 0,
      narrativeProviderEvidenceSuccesses:
        narrativeState?.providerEvidenceSuccesses ?? 0,
      narrativeProviderEnrichment:
        narrativeState?.providerEnrichment ?? null,
      narrativeOutcomeTracking:
        narrativeState?.outcomeTracking ?? null,
      deskPasses: narrativeState?.deskPasses ?? 0,
      deskSkips: narrativeState?.deskSkips ?? 0,
      riskKills: narrativeState?.riskKills ?? 0,
      theLawyer: narrativeState?.lawyer ?? null,
      deskHealthy: narrativeState?.deskHealthy ?? true,
      lawyerHealthy: narrativeState?.lawyerHealthy ?? true,
      narrativeAttentionBudgets:
        narrativeState?.attentionBudgets ?? null,
      queuedEvents: ingressState.queued + enrichmentState.queued,
      activeEvents: ingressState.running + enrichmentState.running,
      ingressQueuedEvents: ingressState.queued,
      enrichmentQueuedEvents: enrichmentState.queued,
      queueSaturated:
        ingressState.queued >= ingressState.maxQueued ||
        enrichmentState.queued >= enrichmentState.maxQueued,
      dedupeEntries: deduper.size,
      runtimeAuthority: false,
    });
  }

  async function append(record) {
    try {
      await ledger.append(record);
      state.storageHealthy = true;
    } catch {
      state.storageHealthy = false;
      logger.error("[observer] observation ledger write failed");
      throw new Error("observation ledger write failed");
    }
  }

  async function deliver(alert) {
    if (!config.notify) return null;
    if (config.notificationChannel === "telegram_bot") {
      return deliverTelegramImpl({
        botToken: config.telegramBotToken,
        chatId: config.telegramChatId,
        body: `${alert.title}\n${alert.body}`,
      });
    }
    throw new Error("notification channel is unavailable");
  }

  async function probeNotification() {
    if (!config.notify) return;
    try {
      await deliver({
        title: "Solana observer starting",
        body: "Mode: observe only; trading authority: false.",
        priority: "default",
      });
      state.notificationHealthy = true;
    } catch (error) {
      notificationFailureLatched = true;
      state.notificationHealthy = false;
      await append({
        schemaVersion: 1,
        recordType: "notification_probe_failed",
        observedAt: timestamp(clock),
        reason: safeError(error, secrets),
        runtimeAuthority: false,
      });
      logger.error(`[observer] notification probe failed: ${safeError(error, secrets)}`);
    }
  }

  async function deliverNarrative(alert) {
    try {
      const result = await deliver(alert);
      if (!notificationFailureLatched) state.notificationHealthy = true;
      return result;
    } catch (error) {
      notificationFailureLatched = true;
      state.notificationHealthy = false;
      state.failedEvents += 1;
      await append({
        schemaVersion: 1,
        recordType: "notification_failed",
        observedAt: timestamp(clock),
        notificationType: "narrative_radar",
        reason: safeError(error, secrets),
        runtimeAuthority: false,
      });
      throw error;
    }
  }

  async function processEvent(event, ingestedAt) {
    const deadlineAtMs =
      new Date(ingestedAt).valueOf() + config.maximumEventAgeMs;
    if (ageMilliseconds(ingestedAt, clock) > config.maximumEventAgeMs) {
      state.enrichmentHealthy = false;
      state.enrichmentSkippedEvents += 1;
      await append({
        schemaVersion: 1,
        recordType: "enrichment_skipped",
        observedAt: timestamp(clock),
        signature: event.signature,
        slot: event.slot,
        reason: "stale_trigger_before_enrichment",
        runtimeAuthority: false,
      });
      return;
    }

    const resolvedResult = await withRetries(
      (_attempt, attemptSignal) => resolveMintsImpl(config.heliusApiKey, event, {
        signal: attemptSignal,
      }),
      {
        accept: (resolved) => Array.isArray(resolved?.mints) && resolved.mints.length > 0,
        deadlineAtMs,
        nowMilliseconds: () => new Date(clock()).valueOf(),
        retry: ({ value, error }) => Boolean(error) ||
          RETRYABLE_MINT_RESOLUTION_SOURCES.has(value?.source),
        sleepImpl,
        signal: shutdownController.signal,
      },
    );

    if (!resolvedResult.ok) {
      state.enrichmentHealthy = false;
      if (resolvedResult.error) {
        state.providerHealthy = false;
      }
      state.failedEvents += 1;
      await append({
        schemaVersion: 1,
        recordType: "mint_resolution_failed",
        observedAt: timestamp(clock),
        signature: event.signature,
        slot: event.slot,
        eventType: event.eventType,
        attempts: resolvedResult.attempts,
        deadlineExceeded: resolvedResult.deadlineExceeded,
        resolutionSource: resolvedResult.value?.source ?? null,
        transactionSlot: resolvedResult.value?.transactionSlot ?? null,
        transactionBlockTime: resolvedResult.value?.blockTime ?? null,
        reason: resolvedResult.error
          ? safeError(resolvedResult.error, secrets)
          : resolvedResult.value?.source ?? "no candidate mint resolved",
        runtimeAuthority: false,
      });
      return;
    }

    if (
      Number.isSafeInteger(resolvedResult.value.blockTime) &&
      ageMilliseconds(
        new Date(resolvedResult.value.blockTime * 1_000).toISOString(),
        clock,
      ) > config.maximumEventAgeMs
    ) {
      state.enrichmentHealthy = false;
      state.enrichmentSkippedEvents += 1;
      await append({
        schemaVersion: 1,
        recordType: "enrichment_skipped",
        observedAt: timestamp(clock),
        signature: event.signature,
        slot: event.slot,
        transactionBlockTime: resolvedResult.value.blockTime,
        reason: "stale_transaction_block_time",
        runtimeAuthority: false,
      });
      return;
    }

    for (const mint of resolvedResult.value.mints) {
      const target = resolvedResult.value.targets?.find(
        (candidate) => candidate.mint === mint,
      );
      const resolvedEventTypes = target?.eventTypes ?? (
        resolvedResult.value.resolvedEventType
          ? [resolvedResult.value.resolvedEventType]
          : [event.eventType]
      );
      const resolvedEventType =
        resolvedEventTypes.length === 1 ? resolvedEventTypes[0] : event.eventType;
      const key = `${event.signature}:${mint}`;
      if (!deduper.remember(key)) continue;

      // The narrative-only lane needs the resolved mint immediately, but it
      // does not need a Jupiter round trip for every raw Pump event. Route the
      // mint directly to the narrative index and reserve paid/metered market
      // enrichment for matches that already cleared the alert threshold.
      if (narrativeRadar && config.genericOpportunityAlertsEnabled === false) {
        const routedAt = timestamp(clock);
        await append({
          schemaVersion: 1,
          recordType: "narrative_mint_routed",
          observedAt: routedAt,
          signature: event.signature,
          eventSlot: event.slot,
          eventType: resolvedEventType,
          classifiedEventType: event.eventType,
          resolvedEventTypes,
          mint,
          mintSource: resolvedResult.value.source,
          triggerIngestedAt: ingestedAt,
          runtimeAuthority: false,
        });
        try {
          await narrativeRadar.observePumpMint({
            mint,
            eventSlot: event.slot,
            venueStage: null,
            observedAt: ingestedAt,
          });
          state.providerHealthy = true;
          state.lastSuccessfulEnrichmentAt = routedAt;
        } catch (error) {
          state.narrativeMintHealthy = false;
          state.narrativeFailedMints += 1;
          state.enrichmentHealthy = false;
          state.failedEvents += 1;
          await append({
            schemaVersion: 1,
            recordType: "narrative_mint_enrichment_failed",
            observedAt: timestamp(clock),
            signature: event.signature,
            mint,
            reason: safeError(error, secrets),
            runtimeAuthority: false,
          });
          logger.error(`[narrative] mint enrichment failed: ${safeError(error, secrets)}`);
        }
        continue;
      }

      const observationResult = await withRetries(
        (_attempt, attemptSignal) =>
          observeOpportunityImpl({
            heliusApiKey: config.heliusApiKey,
            jupiterApiKey: config.jupiterApiKey,
            mint,
            minContextSlot: event.slot,
            now: clock,
            signal: attemptSignal,
          }),
        {
          accept: (observation) =>
            Boolean(observation) && outcomeOf(observation) !== "provider_failure",
          deadlineAtMs,
          nowMilliseconds: () => new Date(clock()).valueOf(),
          retry: ({ value, error }) => Boolean(error) || Boolean(
            value?.stageErrorRetryable || value?.quoteErrorRetryable,
          ),
          sleepImpl,
          signal: shutdownController.signal,
        },
      );

      const observation = observationResult.value;
      if (!observation) {
        state.providerHealthy = false;
        state.enrichmentHealthy = false;
        state.failedEvents += 1;
        await append({
          schemaVersion: 1,
          recordType: "opportunity_observation_failed",
          observedAt: timestamp(clock),
          signature: event.signature,
          slot: event.slot,
          eventType: resolvedEventType,
          classifiedEventType: event.eventType,
          resolvedEventTypes,
          mint,
          attempts: observationResult.attempts,
          deadlineExceeded: observationResult.deadlineExceeded,
          reason: observation?.quoteError
            ? safeError(new Error(observation.quoteError), secrets)
            : safeError(observationResult.error, secrets),
          runtimeAuthority: false,
        });
        continue;
      }

      const observationOutcome = outcomeOf(observation);
      const enrichmentComplete = Boolean(
        observationOutcome !== "provider_failure" &&
        !observation.stage?.abstentionReason &&
        observation.quotes &&
        !observation.quoteError,
      );
      const providerFailure = observationOutcome === "provider_failure";
      if (!enrichmentComplete && providerFailure) {
        state.providerHealthy = false;
        state.enrichmentHealthy = false;
        state.failedEvents += 1;
      } else if (!enrichmentComplete) {
        state.abstainedEvents += 1;
      }

      const triggerAgeMs = ageMilliseconds(ingestedAt, clock);
      const output = Object.freeze({
        schemaVersion: 1,
        recordType: "opportunity_observation",
        observedAt: timestamp(clock),
        signature: event.signature,
        eventSlot: event.slot,
        eventType: resolvedEventType,
        classifiedEventType: event.eventType,
        resolvedEventTypes,
        triggerIngestedAt: ingestedAt,
        triggerAgeMs: Number.isFinite(triggerAgeMs) ? triggerAgeMs : null,
        mintSource: resolvedResult.value.source,
        transactionSlot: resolvedResult.value.transactionSlot ?? null,
        transactionBlockTime: resolvedResult.value.blockTime ?? null,
        enrichmentAttempts: observationResult.attempts,
        enrichmentDeadlineExceeded: observationResult.deadlineExceeded,
        enrichmentComplete,
        enrichmentFailureReason: enrichmentComplete
          ? null
          : observation.stage?.abstentionReason
            ? observation.stage.abstentionReason
            : observation.quoteError
            ? safeError(new Error(observation.quoteError), secrets)
            : safeError(observationResult.error, secrets),
        decision: observation.decision,
        stage: observation.stage,
        stageErrorScope: observation.stageErrorScope ?? null,
        stageErrorRetryable: observation.stageErrorRetryable ?? false,
        observationOutcome,
        quotes: observation.quotes,
        quoteError: observation.quoteError,
        quoteErrorCode: observation.quoteErrorCode ?? null,
        quoteErrorScope: observation.quoteErrorScope ?? null,
        quoteErrorRetryable: observation.quoteErrorRetryable ?? false,
        alert: observation.alert,
        runtimeAuthority: false,
      });
      await append(output);
      if (enrichmentComplete) {
        state.providerHealthy = true;
        state.lastSuccessfulEnrichmentAt = output.observedAt;
      }
      logger.log(JSON.stringify(output));

      if (narrativeRadar) {
        try {
          await narrativeRadar.observePumpMint({
            mint,
            eventSlot: event.slot,
            venueStage: observation.stage?.venueStage ?? null,
            stageEvidence: observation.stage ?? null,
            observedAt: ingestedAt,
          });
        } catch (error) {
          // A missed mint cannot be reconstructed from the in-memory narrative
          // index with certainty. Latch readiness closed until restart so an
          // operator can see the evidence gap instead of mistaking a later
          // successful attention poll for complete coverage.
          state.narrativeMintHealthy = false;
          state.narrativeFailedMints += 1;
          await append({
            schemaVersion: 1,
            recordType: "narrative_mint_enrichment_failed",
            observedAt: timestamp(clock),
            signature: event.signature,
            mint,
            reason: safeError(error, secrets),
            runtimeAuthority: false,
          });
          logger.error(`[narrative] mint enrichment failed: ${safeError(error, secrets)}`);
        }
      }

      // Narrative mode is intended to be a selective alerting lane. Keep the
      // broader stage/quote notification available for operators who opt in,
      // but do not duplicate every narrative candidate into a generic alert.
      const notification = config.genericOpportunityAlertsEnabled === false
        ? null
        : createObservationNotification(observation);
      const notificationTriggerAgeMs = ageMilliseconds(ingestedAt, clock);
      if (
        notification &&
        notificationTriggerAgeMs > config.maximumEventAgeMs
      ) {
        state.enrichmentHealthy = false;
        state.enrichmentSkippedEvents += 1;
        await append({
          schemaVersion: 1,
          recordType: "alert_suppressed",
          observedAt: timestamp(clock),
          signature: event.signature,
          mint,
          reason: "stale_trigger_after_enrichment",
          triggerAgeMs: Number.isFinite(notificationTriggerAgeMs)
            ? notificationTriggerAgeMs
            : null,
          runtimeAuthority: false,
        });
      } else if (notification) {
        try {
          await deliver(notification);
          if (!notificationFailureLatched) state.notificationHealthy = true;
        } catch (error) {
          notificationFailureLatched = true;
          state.notificationHealthy = false;
          state.failedEvents += 1;
          await append({
            schemaVersion: 1,
            recordType: "notification_failed",
            observedAt: timestamp(clock),
            signature: event.signature,
            mint,
            reason: safeError(error, secrets),
            runtimeAuthority: false,
          });
          logger.error(`[observer] notification failed: ${safeError(error, secrets)}`);
        }
      }
    }
  }

  function acceptEvent(event) {
    if (state.stopping || !targetEvent(event) || event.err) {
      return Object.freeze({ accepted: false, disposition: "filtered" });
    }
    if (!validTargetIdentity(event)) {
      state.ingestionHealthy = false;
      state.invalidEvents += 1;
      state.failedEvents += 1;
      const diagnostic = ingressQueue.submit(() => append({
          schemaVersion: 1,
          recordType: "invalid_stream_event",
          observedAt: timestamp(clock),
          eventType: event.eventType,
          signature: typeof event.signature === "string" ? event.signature : null,
          slot: Number.isSafeInteger(event.slot) ? event.slot : null,
          reason: "target_event_identity_invalid",
          runtimeAuthority: false,
        }));
      if (!diagnostic.accepted) {
        state.overloadedEvents += 1;
        logger.error("[observer] invalid-event diagnostic dropped: ingress queue full");
      } else {
        void diagnostic.promise.catch((error) => {
          state.ingestionHealthy = false;
          state.failedEvents += 1;
          logger.error(`[observer] invalid-event persistence failed: ${safeError(error, secrets)}`);
        });
      }
      return Object.freeze({
        accepted: false,
        disposition: "invalid",
        promise: diagnostic.promise,
      });
    }

    const ingestedAt = timestamp(clock);
    state.lastSeenAt = ingestedAt;
    const submission = ingressQueue.submit(async () => {
      await append(eventRecord(event, ingestedAt));
      state.lastEventAt = ingestedAt;

      const enrichment = enrichmentQueue.submit(() => processEvent(event, ingestedAt));
      if (!enrichment.accepted) {
        state.enrichmentHealthy = false;
        state.enrichmentSkippedEvents += 1;
        await append({
          schemaVersion: 1,
          recordType: "enrichment_skipped",
          observedAt: timestamp(clock),
          signature: event.signature,
          slot: event.slot,
          reason: enrichment.disposition,
          runtimeAuthority: false,
        });
        logger.error("[observer] enrichment queue is full; raw event retained");
        return;
      }

      void enrichment.promise.catch((error) => {
        state.enrichmentHealthy = false;
        state.providerHealthy = false;
        state.failedEvents += 1;
        logger.error(`[observer] event processing failed: ${safeError(error, secrets)}`);
      });
    });

    if (!submission.accepted) {
      state.ingestionHealthy = false;
      state.overloadedEvents += 1;
      logger.error("[observer] ingress queue is full; event dropped before persistence");
      return submission;
    }

    state.acceptedEvents += 1;
    void submission.promise.catch((error) => {
      state.ingestionHealthy = false;
      state.failedEvents += 1;
      logger.error(`[observer] event persistence failed: ${safeError(error, secrets)}`);
    });
    return submission;
  }

  try {
    await ledger.ready();
    state.storageHealthy = true;
  } catch {
    logger.error("[observer] observation ledger readiness probe failed");
    throw new Error("observation ledger readiness probe failed");
  }

  try {
    await Promise.all([
      checkHeliusHealthImpl(config.heliusApiKey),
      checkJupiterReadAccessImpl(config.jupiterApiKey),
    ]);
    state.providerHealthy = true;
  } catch {
    logger.error("[observer] provider readiness probe failed");
    throw new Error("provider readiness probe failed");
  }

  await probeNotification();
  if (config.narrativeRadarEnabled) {
    narrativeRadar = createNarrativeRadarImpl({
      config,
      append,
      deliver: deliverNarrative,
      logger,
      clock,
    });
    await narrativeRadar.start();
    state.narrativeHealthy = narrativeRadar.state().healthy;
  }
  health = await startHealthServerImpl({ port: config.port, getState: snapshot });

  try {
    controller = await runObserverImpl({
      apiKey: config.heliusApiKey,
      onEvent: acceptEvent,
      onStatus: (status) => {
        state.observerState = status.state;
        if (status.state === "subscribed") {
          hasSubscribed = true;
          streamGapOpen = false;
        } else if (
          hasSubscribed &&
          !state.stopping &&
          [
            "closed",
            "error",
            "silence_timeout",
            "connection_timeout",
            "subscription_error",
            "event_subscription_mismatch",
            "event_payload_invalid",
            "reconnecting",
          ].includes(status.state)
        ) {
          state.ingestionHealthy = false;
          signalFatal(status.state);
          if (!streamGapOpen) {
            streamGapOpen = true;
            void append({
              schemaVersion: 1,
              recordType: "stream_gap",
              observedAt: timestamp(clock),
              lastPersistedEventAt: state.lastEventAt,
              reason: status.state,
              runtimeAuthority: false,
            }).catch(() => {});
          }
        }
        logger.error(`[observer] ${status.state}`);
      },
    });
  } catch (error) {
    await health.close();
    throw error;
  }

  async function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      state.stopping = true;
      state.observerState = "stopping";
      controller?.stop();
      try {
        await narrativeRadar?.stop();
        await ingressQueue.drain();
        enrichmentQueue.close();
        enrichmentQueue.discardQueued("observer shutdown");
        shutdownController.abort();
        await enrichmentQueue.waitForIdle();
        await ledger.flush();
      } finally {
        await health.close();
        state.observerState = "stopped";
      }
    })();
    return stopPromise;
  }

  return Object.freeze({
    acceptEvent,
    state: snapshot,
    waitForIdle: async () => {
      await ingressQueue.waitForIdle();
      return enrichmentQueue.waitForIdle();
    },
    fatal,
    stop,
  });
}

export const observerWorkerConstants = Object.freeze({
  retryDelaysMs: RETRY_DELAYS_MS,
});
