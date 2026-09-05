import { extractNarrativeEntitySamples } from "./entities.mjs";

function safeMessage(error) {
  return error instanceof Error
    ? error.message.slice(0, 300)
    : "adapter failed";
}

async function runAdapter(adapter, context) {
  try {
    const samples = await adapter.read(context);
    if (!Array.isArray(samples)) {
      throw new Error("adapter did not return an array");
    }
    return Object.freeze({
      name: adapter.name,
      ok: true,
      samples,
      error: null,
    });
  } catch (error) {
    if (context.signal?.aborted) throw error;
    return Object.freeze({
      name: adapter.name,
      ok: false,
      samples: Object.freeze([]),
      error: safeMessage(error),
    });
  }
}

function rankNarratives(narratives) {
  return [...narratives].sort((left, right) =>
    right.evidenceChannelCount - left.evidenceChannelCount ||
    right.providerCount - left.providerCount ||
    right.observationCount - left.observationCount ||
    right.latestObservedAt.localeCompare(left.latestObservedAt),
  );
}

export async function runNarrativePipeline({
  index,
  discoveryAdapters = [],
  confirmationAdapters = [],
  maximumConfirmationTerms = 3,
  now = new Date(),
  signal,
} = {}) {
  if (!index || typeof index.ingestAttention !== "function") {
    throw new TypeError("narrative index is required");
  }
  const context = Object.freeze({ now, signal });
  const discovery = await Promise.all(
    discoveryAdapters.map((adapter) => runAdapter(adapter, context)),
  );
  const discoverySamples = extractNarrativeEntitySamples(
    discovery.flatMap((result) => result.samples),
    { now },
  );
  const acceptedDiscoverySamples = index.ingestAttention(discoverySamples);
  const labels = rankNarratives(index.narratives())
    .slice(0, maximumConfirmationTerms)
    .map((narrative) => narrative.label);
  const confirmation = await Promise.all(
    confirmationAdapters.map((adapter) =>
      runAdapter(adapter, Object.freeze({ ...context, labels })),
    ),
  );
  const confirmationSamples = extractNarrativeEntitySamples(
    confirmation.flatMap((result) => result.samples),
    { now },
  );
  const acceptedConfirmationSamples = index.ingestAttention(confirmationSamples);
  const matches = index.recentMints().flatMap((mint) => index.matchesForMint(mint));
  const adapterResults = Object.freeze([...discovery, ...confirmation]);
  return Object.freeze({
    schemaVersion: 1,
    observedAt: new Date(now).toISOString(),
    adapterResults,
    configuredAdapterCount: adapterResults.length,
    successfulAdapterCount: adapterResults.filter((result) => result.ok).length,
    configuredDiscoveryAdapterCount: discovery.length,
    successfulDiscoveryAdapterCount: discovery.filter((result) => result.ok).length,
    configuredConfirmationAdapterCount: confirmation.length,
    successfulConfirmationAdapterCount: confirmation.filter((result) => result.ok).length,
    acceptedSampleCount: acceptedDiscoverySamples + acceptedConfirmationSamples,
    narrativeCount: index.narratives().length,
    matches: Object.freeze(matches),
    runtimeAuthority: false,
  });
}
