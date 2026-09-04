import { heliusStreamConstants, parseLogsNotification } from "./stream-events.mjs";

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
  if (message?.result && typeof message.result === "number") {
    return { subscribed: message.result };
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
} = {}) {
  if (typeof WebSocketImpl !== "function") {
    throw new Error("WebSocket is not available in this runtime");
  }
  const url = heliusWebsocketUrl(apiKey);
  const socket = new WebSocketImpl(url);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify(heliusStreamConstants.logsSubscribeRequest));
    onStatus?.({ ok: true, state: "subscribed" });
  });
  socket.addEventListener("message", (event) => {
    handleObserverMessage(event.data, { onEvent });
  });
  socket.addEventListener("error", () => {
    onStatus?.({ ok: false, state: "error" });
  });
  socket.addEventListener("close", () => {
    onStatus?.({ ok: false, state: "closed" });
  });

  return socket;
}
