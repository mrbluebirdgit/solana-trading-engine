import { formatNarrativeAlert } from "../alerts/narrative-alert.mjs";
import { enrichPumpMint } from "../narrative/mint-enrichment.mjs";
import { NarrativeIndex } from "../narrative/index.mjs";
import { runNarrativePipeline } from "../narrative/pipeline.mjs";
import { searchGdeltNews } from "../../integrations/attention/gdelt.mjs";
import { readLunarCrushTopics } from "../../integrations/attention/lunarcrush-topics.mjs";
import { readNewsApiHeadlines } from "../../integrations/attention/newsapi.mjs";
import { readRssFeeds } from "../../integrations/attention/rss.mjs";
import { searchXRecent } from "../../integrations/attention/x-recent-search.mjs";
import { readXTrends } from "../../integrations/attention/x-trends.mjs";

function buildAdapters(config, fetchImpl) {
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
} = {}) {
  if (!config?.narrativeRadarEnabled) {
    throw new TypeError("enabled narrative radar configuration is required");
  }
  if (typeof append !== "function" || typeof deliver !== "function") {
    throw new TypeError("narrative radar append and deliver functions are required");
  }
  const adapters = buildAdapters(config, fetchImpl);
  if (adapters.discovery.length === 0) {
    throw new Error("narrative radar requires at least one configured discovery source");
  }
  const index = new NarrativeIndex({ now: clock });
  let timer = null;
  let stopped = false;
  let running = null;
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
    const alert = formatNarrativeAlert(match);
    if (config.notify) {
      await deliver(alert);
      state.alertsSent += 1;
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
  }

  return Object.freeze({
    start,
    stop,
    tick,
    observePumpMint,
    state: () => Object.freeze({ ...state, runtimeAuthority: false }),
    runtimeAuthority: false,
  });
}
