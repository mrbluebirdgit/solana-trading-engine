export function createObservationNotification(observation) {
  if (
    observation?.runtimeAuthority !== false ||
    observation?.decision?.runtimeAuthority !== false ||
    observation?.decision?.decision !== "ALERT_ONLY" ||
    observation?.decision?.notificationEligible !== true ||
    observation?.alert?.runtimeAuthority !== false
  ) {
    return null;
  }

  if (
    typeof observation.alert.title !== "string" ||
    typeof observation.alert.body !== "string"
  ) {
    return null;
  }

  return Object.freeze({
    title: `ALERT_ONLY ${observation.alert.title}`,
    body: `${observation.alert.body}\ndecision: ALERT_ONLY`,
    priority: observation.alert.priority ?? "default",
    runtimeAuthority: false,
  });
}
