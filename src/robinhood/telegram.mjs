export async function sendTelegramAlert({ token, chatId, text, fetchImpl = fetch }) {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(`Telegram rejected alert: ${payload.description ?? "unknown error"}`);
}

