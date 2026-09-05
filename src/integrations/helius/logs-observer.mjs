import { heliusStreamConstants, parseLogsNotification } from "./stream-events.mjs";

const DEFAULT_INACTIVITY_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 15_000;
const DEFAULT_SUBSCRIPTION_TIMEOUT_MS = 15_000;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const HELIUS_INACTIVITY_LIMIT_MS = 10 * 60 * 1_000;

function positiveDelay(value, field) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive finite number`);
  }
  return value;
}

function subscriptionError(message) {
  if (message?.id !== heliusStreamConstants.logsSubscribeRequestId) return null;
  if (!message?.error || typeof message.error !== "object") return null;
  return Object.freeze({
    subscriptionError: Object.freeze({
      code: Number.isFinite(message.error.code) ? message.error.code : null,
      message:
        typeof message.error.message === "string" && message.error.message.trim()
          ? message.error.message.trim()
          : "Helius rejected the subscription request",
    }),
  });
}

function validNotificationIdentity(event) {
  return Boolean(
    event &&
    typeof event.signature === "string" &&
    event.signature.trim() !== "" &&
    Number.isSafeInteger(event.slot) &&
    event.slot >= 0 &&
    event.logsValid === true &&
    Array.isArray(event.logs),
  );
}

export function heliusWebsocketUrl(apiKey) {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("Helius API key is required");
  }
  const url = new URL("wss://mainnet.helius-rpc.com/");
  url.searchParams.set("api-key", apiKey.trim());
  return url;
}

export function handleObserverMessage(raw, { onEvent } = {}) {
  let message;
  try {
    message = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }

  const rejected = subscriptionError(message);
  if (rejected) return rejected;

  if (
    message?.id === heliusStreamConstants.logsSubscribeRequestId &&
    typeof message?.result === "number"
  ) {
    return Object.freeze({ subscribed: message.result });
  }
  if (!message?.params?.result) return null;
  const event = parseLogsNotification(message);
  if (typeof onEvent === "function") onEvent(event);
  return event;
}

export async function runPumpLogsObserver({
  apiKey,
  WebSocketImpl = globalThis.WebSocket,
  onEvent,
  onStatus,
  inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS,
  connectionTimeoutMs = DEFAULT_CONNECTION_TIMEOUT_MS,
  subscriptionTimeoutMs = DEFAULT_SUBSCRIPTION_TIMEOUT_MS,
  reconnectBaseDelayMs = DEFAULT_RECONNECT_BASE_DELAY_MS,
  reconnectMaxDelayMs = DEFAULT_RECONNECT_MAX_DELAY_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  if (typeof WebSocketImpl !== "function") {
    throw new Error("WebSocket is not available in this runtime");
  }
  if (
    typeof setTimeoutImpl !== "function" ||
    typeof clearTimeoutImpl !== "function"
  ) {
    throw new TypeError("timer functions are required");
  }

  const silenceMs = positiveDelay(inactivityTimeoutMs, "inactivityTimeoutMs");
  const connectMs = positiveDelay(connectionTimeoutMs, "connectionTimeoutMs");
  const subscribeMs = positiveDelay(
    subscriptionTimeoutMs,
    "subscriptionTimeoutMs",
  );
  if (silenceMs >= HELIUS_INACTIVITY_LIMIT_MS) {
    throw new TypeError(
      `inactivityTimeoutMs must remain below ${HELIUS_INACTIVITY_LIMIT_MS}`,
    );
  }
  const baseDelayMs = positiveDelay(
    reconnectBaseDelayMs,
    "reconnectBaseDelayMs",
  );
  const maximumDelayMs = positiveDelay(
    reconnectMaxDelayMs,
    "reconnectMaxDelayMs",
  );
  if (baseDelayMs > maximumDelayMs) {
    throw new TypeError(
      "reconnectBaseDelayMs must not exceed reconnectMaxDelayMs",
    );
  }

  const url = heliusWebsocketUrl(apiKey);
  let activeSocket = null;
  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let reconnectScheduled = false;
  let watchdogTimer = null;
  let watchdogScheduled = false;
  let connectionTimer = null;
  let connectionTimerScheduled = false;
  let subscriptionTimer = null;
  let subscriptionTimerScheduled = false;
  let subscriptionId = null;

  function emitStatus(status) {
    onStatus?.(Object.freeze(status));
  }

  function clearReconnectTimer() {
    if (!reconnectScheduled) return;
    clearTimeoutImpl(reconnectTimer);
    reconnectTimer = null;
    reconnectScheduled = false;
  }

  function clearWatchdog() {
    if (!watchdogScheduled) return;
    clearTimeoutImpl(watchdogTimer);
    watchdogTimer = null;
    watchdogScheduled = false;
  }

  function clearConnectionTimer() {
    if (!connectionTimerScheduled) return;
    clearTimeoutImpl(connectionTimer);
    connectionTimer = null;
    connectionTimerScheduled = false;
  }

  function clearSubscriptionTimer() {
    if (!subscriptionTimerScheduled) return;
    clearTimeoutImpl(subscriptionTimer);
    subscriptionTimer = null;
    subscriptionTimerScheduled = false;
  }

  function closeSocket(socket, reason) {
    if (!socket || typeof socket.close !== "function") return;
    const closing = WebSocketImpl.CLOSING ?? 2;
    const closed = WebSocketImpl.CLOSED ?? 3;
    if (socket.readyState === closing || socket.readyState === closed) return;
    try {
      socket.close(1000, reason);
    } catch {
      // A socket may reject close() while its connection is still being created.
    }
  }

  function scheduleReconnect(reason) {
    if (stopped || reconnectScheduled) return;
    const attempt = reconnectAttempt + 1;
    const delayMs = Math.min(
      maximumDelayMs,
      baseDelayMs * 2 ** reconnectAttempt,
    );
    reconnectAttempt = attempt;
    reconnectScheduled = true;
    reconnectTimer = setTimeoutImpl(() => {
      reconnectTimer = null;
      reconnectScheduled = false;
      connect();
    }, delayMs);
    emitStatus({
      ok: false,
      state: "reconnecting",
      reason,
      attempt,
      delayMs,
    });
  }

  function retire(socket, reason) {
    if (socket !== activeSocket) return false;
    activeSocket = null;
    subscriptionId = null;
    clearConnectionTimer();
    clearSubscriptionTimer();
    clearWatchdog();
    closeSocket(socket, reason);
    return true;
  }

  function armWatchdog(socket) {
    if (stopped || socket !== activeSocket) return;
    clearWatchdog();
    watchdogScheduled = true;
    watchdogTimer = setTimeoutImpl(() => {
      watchdogTimer = null;
      watchdogScheduled = false;
      if (stopped || socket !== activeSocket) return;
      emitStatus({
        ok: false,
        state: "silence_timeout",
        timeoutMs: silenceMs,
      });
      retire(socket, "observer silence timeout");
      scheduleReconnect("silence_timeout");
    }, silenceMs);
  }

  function reportEventHandlerError(error) {
    emitStatus({
      ok: false,
      state: "event_handler_error",
      message: error instanceof Error ? error.message : "event handler failed",
    });
  }

  function dispatchEvent(event) {
    if (typeof onEvent !== "function") return;
    try {
      const pending = onEvent(event);
      if (pending && typeof pending.then === "function") {
        void pending.catch(reportEventHandlerError);
      }
    } catch (error) {
      reportEventHandlerError(error);
    }
  }

  function connect() {
    if (stopped) return;
    let socket;
    try {
      socket = new WebSocketImpl(url);
    } catch (error) {
      emitStatus({
        ok: false,
        state: "connection_error",
        message:
          error instanceof Error ? error.message : "WebSocket construction failed",
      });
      scheduleReconnect("connection_error");
      return;
    }

    activeSocket = socket;
    subscriptionId = null;
    emitStatus({ ok: true, state: "connecting" });
    connectionTimerScheduled = true;
    connectionTimer = setTimeoutImpl(() => {
      connectionTimer = null;
      connectionTimerScheduled = false;
      if (stopped || socket !== activeSocket) return;
      emitStatus({ ok: false, state: "connection_timeout", timeoutMs: connectMs });
      retire(socket, "observer connection timeout");
      scheduleReconnect("connection_timeout");
    }, connectMs);

    socket.addEventListener("open", () => {
      if (stopped || socket !== activeSocket) {
        closeSocket(socket, "observer stopped");
        return;
      }
      clearConnectionTimer();
      try {
        socket.send(JSON.stringify(heliusStreamConstants.logsSubscribeRequest));
        emitStatus({ ok: true, state: "subscribing" });
        subscriptionTimerScheduled = true;
        subscriptionTimer = setTimeoutImpl(() => {
          subscriptionTimer = null;
          subscriptionTimerScheduled = false;
          if (stopped || socket !== activeSocket || subscriptionId !== null) return;
          emitStatus({
            ok: false,
            state: "subscription_timeout",
            timeoutMs: subscribeMs,
          });
          retire(socket, "observer subscription timeout");
          scheduleReconnect("subscription_timeout");
        }, subscribeMs);
      } catch (error) {
        emitStatus({
          ok: false,
          state: "subscription_error",
          code: null,
          message:
            error instanceof Error
              ? error.message
              : "Helius subscription request could not be sent",
        });
        retire(socket, "subscription send failed");
        scheduleReconnect("subscription_error");
      }
    });

    socket.addEventListener("message", (event) => {
      if (stopped || socket !== activeSocket) return;
      const parsed = handleObserverMessage(event.data);
      if (!parsed) return;

      if (parsed.subscriptionError) {
        emitStatus({
          ok: false,
          state: "subscription_error",
          code: parsed.subscriptionError.code,
          message: parsed.subscriptionError.message,
        });
        retire(socket, "subscription rejected");
        scheduleReconnect("subscription_error");
        return;
      }

      if (typeof parsed.subscribed === "number") {
        clearSubscriptionTimer();
        subscriptionId = parsed.subscribed;
        reconnectAttempt = 0;
        armWatchdog(socket);
        emitStatus({
          ok: true,
          state: "subscribed",
          subscriptionId,
        });
        return;
      }

      if (
        subscriptionId === null ||
        parsed.subscriptionId !== subscriptionId
      ) {
        emitStatus({
          ok: false,
          state: "event_subscription_mismatch",
          expectedSubscriptionId: subscriptionId,
        });
        retire(socket, "observer subscription mismatch");
        scheduleReconnect("event_subscription_mismatch");
        return;
      }

      if (!validNotificationIdentity(parsed)) {
        emitStatus({ ok: false, state: "event_payload_invalid" });
        retire(socket, "observer event payload invalid");
        scheduleReconnect("event_payload_invalid");
        return;
      }
      if (parsed.classificationError) {
        emitStatus({
          ok: false,
          state: "event_payload_invalid",
          reason: parsed.classificationError,
        });
        retire(socket, "observer event classification invalid");
        scheduleReconnect("event_payload_invalid");
        return;
      }

      armWatchdog(socket);
      dispatchEvent(parsed);
    });

    socket.addEventListener("error", () => {
      if (!retire(socket, "WebSocket error")) return;
      emitStatus({ ok: false, state: "error" });
      scheduleReconnect("error");
    });

    socket.addEventListener("close", (event = {}) => {
      if (!retire(socket, "WebSocket closed")) return;
      emitStatus({
        ok: false,
        state: "closed",
        code: Number.isFinite(event.code) ? event.code : null,
        reason: typeof event.reason === "string" ? event.reason : "",
      });
      scheduleReconnect("closed");
    });
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearReconnectTimer();
    clearConnectionTimer();
    clearSubscriptionTimer();
    clearWatchdog();
    const socket = activeSocket;
    activeSocket = null;
    subscriptionId = null;
    closeSocket(socket, "observer stopped");
    emitStatus({ ok: true, state: "stopped" });
  }

  const controller = Object.freeze({
    get socket() {
      return activeSocket;
    },
    get stopped() {
      return stopped;
    },
    get subscriptionId() {
      return subscriptionId;
    },
    stop,
    close: stop,
  });

  connect();
  return controller;
}

export const heliusObserverDefaults = Object.freeze({
  inactivityTimeoutMs: DEFAULT_INACTIVITY_TIMEOUT_MS,
  connectionTimeoutMs: DEFAULT_CONNECTION_TIMEOUT_MS,
  subscriptionTimeoutMs: DEFAULT_SUBSCRIPTION_TIMEOUT_MS,
  heliusInactivityLimitMs: HELIUS_INACTIVITY_LIMIT_MS,
  reconnectBaseDelayMs: DEFAULT_RECONNECT_BASE_DELAY_MS,
  reconnectMaxDelayMs: DEFAULT_RECONNECT_MAX_DELAY_MS,
});
