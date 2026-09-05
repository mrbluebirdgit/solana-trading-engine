import http from "node:http";

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

export function createHealthHandler({ getState, now = () => new Date() } = {}) {
  if (typeof getState !== "function") {
    throw new TypeError("getState is required");
  }

  return (request, response) => {
    if (request.method !== "GET") {
      json(response, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    const state = getState() ?? {};
    const base = {
      mode: "observe",
      runtimeAuthority: false,
      checkedAt: now().toISOString(),
    };
    if (request.url === "/livez") {
      json(response, 200, { ...base, ok: true });
      return;
    }
    if (request.url === "/readyz") {
      const ready =
        state.observerState === "subscribed" &&
        state.stopping === false &&
        state.storageHealthy === true &&
        state.notificationHealthy === true &&
        state.providerHealthy === true &&
        state.ingestionHealthy === true &&
        state.enrichmentHealthy === true &&
        state.narrativeHealthy !== false &&
        state.narrativeMintHealthy !== false &&
        state.queueSaturated === false;
      json(response, ready ? 200 : 503, {
        ...base,
        ok: ready,
        observerState: state.observerState ?? "starting",
        queuedEvents: state.queuedEvents ?? 0,
        activeEvents: state.activeEvents ?? 0,
        lastEventAt: state.lastEventAt ?? null,
        storageHealthy: state.storageHealthy ?? null,
        notificationHealthy: state.notificationHealthy ?? null,
        providerHealthy: state.providerHealthy ?? null,
        lastSuccessfulEnrichmentAt: state.lastSuccessfulEnrichmentAt ?? null,
        ingestionHealthy: state.ingestionHealthy ?? null,
        enrichmentHealthy: state.enrichmentHealthy ?? null,
        narrativeHealthy: state.narrativeHealthy ?? null,
        narrativeMintHealthy: state.narrativeMintHealthy ?? null,
        narrativeLastSuccessfulTickAt: state.narrativeLastSuccessfulTickAt ?? null,
        narrativeCount: state.narrativeCount ?? 0,
        narrativeSampleCount: state.narrativeSampleCount ?? 0,
        narrativeMatchesObserved: state.narrativeMatchesObserved ?? 0,
        narrativeAlertsSent: state.narrativeAlertsSent ?? 0,
        narrativeFailedMints: state.narrativeFailedMints ?? 0,
        queueSaturated: state.queueSaturated ?? null,
        overloadedEvents: state.overloadedEvents ?? 0,
        enrichmentSkippedEvents: state.enrichmentSkippedEvents ?? 0,
        abstainedEvents: state.abstainedEvents ?? 0,
        invalidEvents: state.invalidEvents ?? 0,
      });
      return;
    }
    json(response, 404, { ...base, ok: false, error: "not_found" });
  };
}

export async function startHealthServer({
  port = 3000,
  host = "0.0.0.0",
  getState,
  createServerImpl = http.createServer,
} = {}) {
  const server = createServerImpl(createHealthHandler({ getState }));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return Object.freeze({
    server,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        // Health traffic carries no durable work. Destroy partial/keep-alive
        // requests after stopping acceptance so shutdown cannot wait on an
        // untrusted client until Node's headers timeout.
        server.closeAllConnections();
      }),
  });
}
