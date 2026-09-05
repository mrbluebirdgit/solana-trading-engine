import { formatNarrativeAlert } from "../alerts/narrative-alert.mjs";
import { enrichPumpMint } from "../narrative/mint-enrichment.mjs";
import { NarrativeIndex } from "../narrative/index.mjs";
import { createNarrativeOutcomeTracker } from "../narrative/outcome-tracker.mjs";
import { runNarrativePipeline } from "../narrative/pipeline.mjs";
import { createCandidateProviderEnricher } from "../narrative/provider-enrichment.mjs";
import { createDailyRequestBudget } from "./daily-request-budget.mjs";
import { searchGdeltNews } from "../../integrations/attention/gdelt.mjs";
import { readLunarCrushTopics } from "../../integrations/attention/lunarcrush-topics.mjs";
import { readNewsApiHeadlines } from "../../integrations/attention/newsapi.mjs";
import { readRssFeeds } from "../../integrations/attention/rss.mjs";
import { searchXRecent } from "../../integrations/attention/x-recent-search.mjs";
import { readXTrends } from "../../integrations/attention/x-trends.mjs";

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 300) : "provider enrichment failed";
}

function buildAdapters(config, fetchImpl, attentionBudgets) {
  const discovery = [];
  const confirmation = [];
  if (config.xBearerToken) {
    discovery.push(Object.freeze({
      name: "x_trends",
      read: ({ now, signal }) => readXTrends({
        bearerToken: config.xBearerToken,
        woeids: config.narrativeXWoeids,
        fetchImpl,
        now,
        signal,
      }),
    }));
    if (config.narrativeXRecentSearchEnabled) {
      confirmation.push(Object.freeze({
        name: "x_recent_search",
        read: ({ labels, now, signal }) => searchXRecent({
          bearerToken: config.xBearerToken,
          labels,
          maximumQueries: config.narrativeMaximumConfirmationTerms,
          fetchImpl,
          now,
          signal,
        }),
      }));
    }
  }
  if (config.lunarCrushApiKey) {
    discovery.push(Object.freeze({
      name: "lunarcrush_topics",
      read: ({ now, signal }) => readLunarCrushTopics({
        apiKey: config.lunarCrushApiKey,
        fetchImpl,
        now,
        signal,
        budget: attentionBudgets.lunarcrush,
      }),
    }));
  }
  if (config.newsApiKey) {
    discovery.push(Object.freeze({
      name: "newsapi_headlines",
      read: ({ now, signal }) => readNewsApiHeadlines({
        apiKey: config.newsApiKey,
        countries: config.narrativeNewsCountries,
        fetchImpl,
        now,
        signal,
        budget: attentionBudgets.newsapi,
      }),
    }));
  }
  if (config.narrativeRssFeeds.length > 0) {
    discovery.push(Object.freeze({
      name: "rss",
      read: ({ now, signal }) => readRssFeeds({
        feedUrls: config.narrativeRssFeeds,
        fetchImpl,
        now,
        signal,
      }),
    }));
  }
  if (config.narrativeGdeltEnabled) {
    confirmation.push(Object.freeze({
      name: "gdelt",
      read: ({ labels, now, signal }) => searchGdeltNews({
        labels,
        maximumQueries: config.narrativeMaximumConfirmationTerms,
        fetchImpl,
        now,
        signal,
      }),
    }));
  }
  return Object.freeze({
    discovery: Object.freeze(discovery),
    confirmation: Object.freeze(confirmation),
  });
}

export function createNarrativeRadar({
  config,
  append,
  deliver,
  logger = console,
  fetchImpl = fetch,
  clock = () => new Date(),
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  enrichPumpMintImpl = enrichPumpMint,
  runPipelineImpl = runNarrativePipeline,
  createProviderEnricherImpl = createCandidateProviderEnricher,
  createOutcomeTrackerImpl = createNarrativeOutcomeTracker,
  createBudgetImpl = createDailyRequestBudget,
} = {}) {
  if (!config?.narrativeRadarEnabled) {
    throw new TypeError("enabled narrative radar configuration is required");
  }
  if (typeof append !== "function" || typeof deliver !== "function") {
    throw new TypeError("narrative radar append and deliver functions are required");
  }
  const attentionBudgets = {};
  if (config.lunarCrushApiKey) {
    attentionBudgets.lunarcrush = createBudgetImpl({
      provider: "lunarcrush",
      dailyLimit: config.lunarCrushDailyRequestLimit,
      reserve: config.lunarCrushDailyRequestReserve,
      statePath: config.lunarCrushBudgetStatePath,
      clock,
    });
  }
  if (config.newsApiKey) {
    attentionBudgets.newsapi = createBudgetImpl({
      provider: "newsapi",
      dailyLimit: config.newsApiDailyRequestLimit,
      reserve: config.newsApiDailyRequestReserve,
      statePath: config.newsApiBudgetStatePath,
      clock,
    });
  }
  const adapters = buildAdapters(config, fetchImpl, attentionBudgets);
  if (adapters.discovery.length === 0) {
    throw new Error("narrative radar requires at least one configured discovery source");
  }
  const index = new NarrativeIndex({ now: clock });
  let timer = null;
  let stopped = false;
  let running = null;
  const hasCandidateProviders = Boolean(config.birdeyeApiKey || config.gmgnApiKey);
  const providerEnricher = hasCandidateProviders
    ? createProviderEnricherImpl({ config, fetchImpl, clock })
    : null;
  const outcomeTracker = hasCandidateProviders && config.narrativeOutcomeTrackingEnabled
    ? createOutcomeTrackerImpl({
      statePath: config.narrativeOutcomeStatePath,
      checkpointsMs: config.narrativeOutcomeCheckpointsMs,
      readPrice: (request) => providerEnricher.readPrice(request),
      append,
      deliver,
      notify: config.notify && config.narrativeOutcomeNotificationsEnabled,
      clock,
      setTimeoutImpl,
      clearTimeoutImpl,
    })
    : null;
  const controller = new AbortController();
  const state = {
    enabled: true,
    healthy: false,
    configuredSources: adapters.discovery.map((adapter) => adapter.name),
    configuredConfirmations: adapters.confirmation.map((adapter) => adapter.name),
    lastTickAt: null,
    lastSuccessfulTickAt: null,
    lastError: null,
    narrativeCount: 0,
    sampleCount: 0,
    mintCount: 0,
    matchesObserved: 0,
    alertsSent: 0,
    providerEvidenceAttempts: 0,
    providerEvidenceSuccesses: 0,
  };

  async function handleMatch(match, observedAt) {
    state.matchesObserved += 1;
    await append({
      schemaVersion: 1,
      recordType: "narrative_mint_match",
      observedAt,
      narrative: {
        id: match.narrative.id,
        key: match.narrative.key,
        label: match.narrative.label,
        providers: match.narrative.providers,
        evidenceChannels: match.narrative.evidenceChannels,
        uniqueAuthorCount: match.narrative.uniqueAuthorCount,
        velocity: match.narrative.velocity,
        latestObservedAt: match.narrative.latestObservedAt,
      },
      mint: match.mintCandidate,
      match: match.match,
      competingMintCount: match.competingMintCount,
      score: match.score,
      runtimeAuthority: false,
    });
    if (
      match.score.priorityScore < config.narrativeAlertMinimumPriority ||
      !index.alertOnce(match)
    ) return;
    let evidence = null;
    if (providerEnricher) {
      state.providerEvidenceAttempts += 1;
      try {
        evidence = await providerEnricher.enrich({
          mint: match.mintCandidate.mint,
          signal: controller.signal,
        });
        if (evidence.providers.some((provider) => provider.ok)) {
          state.providerEvidenceSuccesses += 1;
        }
        await append({
          schemaVersion: 1,
          recordType: "narrative_candidate_provider_evidence",
          observedAt: evidence.observedAt,
          narrativeId: match.narrative.id,
          narrativeLabel: match.narrative.label,
          mint: match.mintCandidate.mint,
          providers: evidence.providers,
          market: evidence.market,
          runtimeAuthority: false,
        });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        await append({
          schemaVersion: 1,
          recordType: "narrative_candidate_provider_evidence_failed",
          observedAt: new Date(clock()).toISOString(),
          narrativeId: match.narrative.id,
          narrativeLabel: match.narrative.label,
          mint: match.mintCandidate.mint,
          reason: safeError(error),
          runtimeAuthority: false,
        });
        logger.error(`[narrative] supplemental provider enrichment failed: ${safeError(error)}`);
      }
    }
    const preparedAt = new Date(clock()).toISOString();
    const alert = formatNarrativeAlert(match, evidence);
    if (config.notify) {
      const delivery = await deliver(alert);
      const deliveredAt = new Date(clock()).toISOString();
      state.alertsSent += 1;
      const signalObservedMs = new Date(match.mintCandidate.observedAt).valueOf();
      const deliveredMs = new Date(deliveredAt).valueOf();
      await append({
        schemaVersion: 1,
        recordType: "narrative_alert_delivered",
        observedAt: deliveredAt,
        narrativeId: match.narrative.id,
        narrativeLabel: match.narrative.label,
        mint: match.mintCandidate.mint,
        signalObservedAt: match.mintCandidate.observedAt,
        alertPreparedAt: preparedAt,
        detectionToDeliveryMs:
          Number.isFinite(signalObservedMs) && deliveredMs >= signalObservedMs
            ? deliveredMs - signalObservedMs
            : null,
        telegramMessageId: delivery?.messageId ?? null,
        runtimeAuthority: false,
      });
      if (outcomeTracker) {
        try {
          await outcomeTracker.track({
            mint: match.mintCandidate.mint,
            narrativeLabel: match.narrative.label,
            tokenName: match.mintCandidate.name,
            tokenSymbol: match.mintCandidate.symbol,
            alertedAt: deliveredAt,
            initialPriceUsd: evidence?.market?.priceUsd,
            initialPriceProvider: evidence?.market?.priceProvider,
            initialPriceObservedAt: evidence?.observedAt ?? deliveredAt,
          });
        } catch (error) {
          await append({
            schemaVersion: 1,
            recordType: "narrative_outcome_tracking_failed",
            observedAt: new Date(clock()).toISOString(),
            narrativeId: match.narrative.id,
            narrativeLabel: match.narrative.label,
            mint: match.mintCandidate.mint,
            reason: safeError(error),
            runtimeAuthority: false,
          });
          logger.error(`[narrative] outcome tracking failed: ${safeError(error)}`);
        }
      }
    }
  }

  async function performTick() {
    const now = clock();
    const observedAt = new Date(now).toISOString();
    state.lastTickAt = observedAt;
    const result = await runPipelineImpl({
      index,
      discoveryAdapters: adapters.discovery,
      confirmationAdapters: adapters.confirmation,
      maximumConfirmationTerms: config.narrativeMaximumConfirmationTerms,
      now,
      signal: controller.signal,
    });
    state.healthy = result.successfulDiscoveryAdapterCount > 0;
    state.lastError = state.healthy
      ? null
      : result.adapterResults.map((item) => item.error).filter(Boolean).join("; ").slice(0, 500);
    if (state.healthy) state.lastSuccessfulTickAt = observedAt;
    state.narrativeCount = result.narrativeCount;
    state.sampleCount = index.sampleCount;
    state.mintCount = index.mintCount;
    await append({
      schemaVersion: 1,
      recordType: "narrative_tick",
      observedAt,
      configuredAdapterCount: result.configuredAdapterCount,
      successfulAdapterCount: result.successfulAdapterCount,
      configuredDiscoveryAdapterCount: result.configuredDiscoveryAdapterCount,
      successfulDiscoveryAdapterCount: result.successfulDiscoveryAdapterCount,
      configuredConfirmationAdapterCount: result.configuredConfirmationAdapterCount,
      successfulConfirmationAdapterCount: result.successfulConfirmationAdapterCount,
      acceptedSampleCount: result.acceptedSampleCount,
      narrativeCount: result.narrativeCount,
      adapterStatus: result.adapterResults.map((adapter) => ({
        name: adapter.name,
        ok: adapter.ok,
        sampleCount: adapter.samples.length,
        error: adapter.error,
      })),
      runtimeAuthority: false,
    });
    for (const match of result.matches) await handleMatch(match, observedAt);
    return result;
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeoutImpl(() => {
      timer = null;
      void tick().catch((error) => {
        state.healthy = false;
        state.lastError = error instanceof Error ? error.message.slice(0, 500) : "tick failed";
        logger.error(`[narrative] ${state.lastError}`);
      }).finally(schedule);
    }, config.narrativePollIntervalMs);
  }

  function tick() {
    if (stopped) return Promise.reject(new Error("narrative radar is stopped"));
    if (!running) {
      running = performTick().finally(() => { running = null; });
    }
    return running;
  }

  async function observePumpMint({ mint, eventSlot, venueStage, observedAt } = {}) {
    const now = clock();
    const candidate = await enrichPumpMintImpl({
      heliusApiKey: config.heliusApiKey,
      mint,
      eventSlot,
      venueStage,
      observedAt,
      fetchImpl,
      signal: controller.signal,
      now,
    });
    const matches = index.matchesForMint(candidate);
    state.mintCount = index.mintCount;
    for (const match of matches) await handleMatch(match, new Date(now).toISOString());
    return matches;
  }

  async function start() {
    if (Object.keys(attentionBudgets).length > 0) {
      await Promise.all(Object.values(attentionBudgets).map((budget) => budget.ready()));
      await append({
        schemaVersion: 1,
        recordType: "narrative_attention_budgets_started",
        observedAt: new Date(clock()).toISOString(),
        budgets: Object.freeze(Object.fromEntries(
          Object.entries(attentionBudgets).map(([provider, budget]) => [
            provider,
            budget.snapshot(),
          ]),
        )),
        runtimeAuthority: false,
      });
    }
    if (providerEnricher) {
      const providerState = await providerEnricher.start();
      await append({
        schemaVersion: 1,
        recordType: "narrative_provider_enrichment_started",
        observedAt: new Date(clock()).toISOString(),
        configuredProviders: providerState.configuredProviders,
        providerReadiness: providerState.providerReadiness,
        budgets: providerState.budgets,
        runtimeAuthority: false,
      });
    }
    await outcomeTracker?.start();
    const result = await tick();
    schedule();
    return result;
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearTimeoutImpl(timer);
    controller.abort();
    try { await running; } catch {}
    await outcomeTracker?.stop();
    await providerEnricher?.stop();
    await Promise.all(Object.values(attentionBudgets).map((budget) => budget.flush()));
  }

  return Object.freeze({
    start,
    stop,
    tick,
    observePumpMint,
    state: () => Object.freeze({
      ...state,
      providerEnrichment: providerEnricher?.snapshot() ?? null,
      outcomeTracking: outcomeTracker?.snapshot() ?? null,
      attentionBudgets: Object.freeze(Object.fromEntries(
        Object.entries(attentionBudgets).map(([provider, budget]) => [
          provider,
          budget.snapshot(),
        ]),
      )),
      runtimeAuthority: false,
    }),
    runtimeAuthority: false,
  });
}
