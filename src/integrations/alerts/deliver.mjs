const NTFY_ENDPOINT = "https://ntfy.sh/";

export async function deliverNtfyAlert(
  { topic, title, body, priority = "default" },
  { fetchImpl = fetch, timeoutMs = 8_000 } = {},
) {
  if (typeof topic !== "string" || topic.trim() === "") {
    throw new TypeError("ntfy topic is required");
  }

  const response = await fetchImpl(`${NTFY_ENDPOINT}${encodeURIComponent(topic.trim())}`, {
    method: "POST",
    headers: {
      title,
      priority: String(priority),
      "content-type": "text/plain; charset=utf-8",
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`ntfy delivery failed with HTTP ${response.status}`);
  }

  return { ok: true, channel: "ntfy" };
}

export async function deliverTelegramBotAlert(
  { botToken, chatId, body },
  { fetchImpl = fetch, timeoutMs = 8_000 } = {},
) {
  if (!botToken?.trim() || !chatId?.trim()) {
    throw new TypeError("Telegram bot token and chat id are required");
  }

  const url = new URL(
    `https://api.telegram.org/bot${botToken.trim()}/sendMessage`,
  );

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId.trim(),
      text: body,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Telegram bot delivery failed with HTTP ${response.status}`);
  }

  return { ok: true, channel: "telegram_bot" };
}
