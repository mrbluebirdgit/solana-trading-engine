import assert from "node:assert/strict";
import test from "node:test";

import {
  createHealthHandler,
  startHealthServer,
} from "../src/core/runtime/health-server.mjs";

function invoke(path, state, method = "GET") {
  let statusCode;
  let body = "";
  const handler = createHealthHandler({
    getState: () => state,
    now: () => new Date("2026-09-04T12:00:00.000Z"),
  });
  handler(
    { method, url: path },
    {
      writeHead: (status) => { statusCode = status; },
      end: (chunk) => { body += chunk; },
    },
  );
  return { statusCode, body: JSON.parse(body) };
}

test("liveness never implies trading authority", () => {
  const response = invoke("/livez", { observerState: "closed" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.runtimeAuthority, false);
  assert.equal(response.body.mode, "observe");
});

test("readiness requires an acknowledged subscription", () => {
  assert.equal(invoke("/readyz", { observerState: "connecting" }).statusCode, 503);
  const ready = invoke("/readyz", {
    observerState: "subscribed",
    stopping: false,
    storageHealthy: true,
    notificationHealthy: true,
    providerHealthy: true,
    ingestionHealthy: true,
    enrichmentHealthy: true,
    queuedEvents: 2,
    queueSaturated: false,
  });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.body.queuedEvents, 2);
});

test("readiness exposes and fails closed on saturated or lossy ingestion", () => {
  const base = {
    observerState: "subscribed",
    stopping: false,
    storageHealthy: true,
    notificationHealthy: true,
    providerHealthy: true,
    ingestionHealthy: true,
    enrichmentHealthy: true,
    queueSaturated: false,
  };
  assert.equal(
    invoke("/readyz", { ...base, queueSaturated: true }).statusCode,
    503,
  );
  const lossy = invoke("/readyz", {
    ...base,
    ingestionHealthy: false,
    overloadedEvents: 1,
  });
  assert.equal(lossy.statusCode, 503);
  assert.equal(lossy.body.overloadedEvents, 1);
  assert.equal(
    invoke("/readyz", { ...base, enrichmentHealthy: false }).statusCode,
    503,
  );
});

test("readiness exposes and fails closed when an enabled narrative radar is unhealthy", () => {
  const base = {
    observerState: "subscribed",
    stopping: false,
    storageHealthy: true,
    notificationHealthy: true,
    providerHealthy: true,
    ingestionHealthy: true,
    enrichmentHealthy: true,
    queueSaturated: false,
  };
  const unhealthy = invoke("/readyz", { ...base, narrativeHealthy: false });
  assert.equal(unhealthy.statusCode, 503);
  assert.equal(unhealthy.body.narrativeHealthy, false);
  assert.equal(invoke("/readyz", { ...base, narrativeHealthy: true }).statusCode, 200);
});

test("readiness latches closed after a Pump mint misses narrative enrichment", () => {
  const base = {
    observerState: "subscribed",
    stopping: false,
    storageHealthy: true,
    notificationHealthy: true,
    providerHealthy: true,
    ingestionHealthy: true,
    enrichmentHealthy: true,
    narrativeHealthy: true,
    queueSaturated: false,
  };
  const unhealthy = invoke("/readyz", {
    ...base,
    narrativeMintHealthy: false,
    narrativeFailedMints: 1,
  });
  assert.equal(unhealthy.statusCode, 503);
  assert.equal(unhealthy.body.narrativeMintHealthy, false);
  assert.equal(unhealthy.body.narrativeFailedMints, 1);
  assert.equal(
    invoke("/readyz", { ...base, narrativeMintHealthy: true }).statusCode,
    200,
  );
});

test("readiness fails closed when shutdown or saturation state is absent", () => {
  const otherwiseHealthy = {
    observerState: "subscribed",
    storageHealthy: true,
    notificationHealthy: true,
    providerHealthy: true,
    ingestionHealthy: true,
    enrichmentHealthy: true,
  };
  assert.equal(invoke("/readyz", otherwiseHealthy).statusCode, 503);
  assert.equal(
    invoke("/readyz", { ...otherwiseHealthy, stopping: false }).statusCode,
    503,
  );
});

test("health shutdown force-closes partial client connections", async () => {
  let closeAllCalls = 0;
  const fakeServer = {
    once: () => {},
    off: () => {},
    listen(_port, _host, callback) { callback(); },
    close(callback) { callback(); },
    closeAllConnections() { closeAllCalls += 1; },
  };
  const health = await startHealthServer({
    getState: () => ({}),
    createServerImpl: () => fakeServer,
  });
  await health.close();
  assert.equal(closeAllCalls, 1);
});

test("readiness fails closed after a provider-health failure", () => {
  const response = invoke("/readyz", {
    observerState: "subscribed",
    storageHealthy: true,
    notificationHealthy: true,
    providerHealthy: false,
    ingestionHealthy: true,
    enrichmentHealthy: true,
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.providerHealthy, false);
});

test("readiness fails closed until dependency probes have succeeded", () => {
  assert.equal(
    invoke("/readyz", {
      observerState: "subscribed",
      storageHealthy: true,
      notificationHealthy: null,
    }).statusCode,
    503,
  );
  assert.equal(
    invoke("/readyz", {
      observerState: "subscribed",
      storageHealthy: null,
      notificationHealthy: true,
    }).statusCode,
    503,
  );
});

test("readiness fails closed when the observation ledger is unhealthy", () => {
  const response = invoke("/readyz", {
    observerState: "subscribed",
    storageHealthy: false,
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
});

test("readiness fails after a configured notification channel fails", () => {
  const response = invoke("/readyz", {
    observerState: "subscribed",
    storageHealthy: true,
    notificationHealthy: false,
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.notificationHealthy, false);
});
