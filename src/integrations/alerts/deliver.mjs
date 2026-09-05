export async function deliverTelegramBotAlert(
  { botToken, chatId, body },
  { fetchImpl = fetch, timeoutMs = 8_000 } = {},
) {
  if (!botToken?.trim() || !chatId?.trim()) {
    throw new TypeError("Telegram bot token and chat id are required");
  }
  if (typeof body !== "string" || body.trim() === "") {
    throw new TypeError("Telegram alert body is required");
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

  const payload = typeof response.json === "function" ? await response.json() : { ok: true };
  if (payload?.ok !== true) {
    throw new Error("Telegram bot delivery was not acknowledged");
  }

  return {
    ok: true,
    channel: "telegram_bot",
    messageId: payload?.result?.message_id ?? null,
  };
}
