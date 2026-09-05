import assert from "node:assert/strict";
import test from "node:test";

import { createObservationNotification } from "../src/core/alerts/notification-gate.mjs";

function observation(decision = "ALERT_ONLY") {
  return {
    runtimeAuthority: false,
    decision: { decision, notificationEligible: true, runtimeAuthority: false },
    alert: {
      title: "candidate",
      body: "observe only",
      priority: "high",
      runtimeAuthority: false,
    },
  };
}

test("labels only an exact no-authority ALERT_ONLY decision", () => {
  const notification = createObservationNotification(observation());
  assert.equal(notification.title, "ALERT_ONLY candidate");
  assert.match(notification.body, /decision: ALERT_ONLY/);
  assert.equal(notification.runtimeAuthority, false);
});

test("rejects REJECT decisions and missing no-authority markers", () => {
  assert.equal(createObservationNotification(observation("REJECT")), null);
  const unsafe = observation();
  delete unsafe.decision.runtimeAuthority;
  assert.equal(createObservationNotification(unsafe), null);
});

test("fails closed when an observation has not earned notification eligibility", () => {
  const ineligible = observation();
  ineligible.decision.notificationEligible = false;
  assert.equal(createObservationNotification(ineligible), null);

  const unspecified = observation();
  delete unspecified.decision.notificationEligible;
  assert.equal(createObservationNotification(unspecified), null);
});
