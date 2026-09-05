import { deliverTelegramBotAlert } from "../../integrations/alerts/deliver.mjs";
import { runPumpLogsObserver } from "../../integrations/helius/logs-observer.mjs";
import { requestJupiterQuote } from "../../integrations/jupiter/quote.mjs";
import { NATIVE_SOL_MINT } from "../../integrations/pump/program-ids.mjs";

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export async function verifyObserverLive(
  { heliusApiKey, jupiterApiKey, telegramBotToken, telegramChatId } = {},
  {
    runObserverImpl = runPumpLogsObserver,
    requestQuoteImpl = requestJupiterQuote,
    deliverTelegramImpl = deliverTelegramBotAlert,
    timeoutMs = 20_000,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
  } = {},
) {
  for (const [field, value] of Object.entries({
    heliusApiKey,
    jupiterApiKey,
    telegramBotToken,
    telegramChatId,
  })) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${field} is required for observer preflight`);
    }
  }

  let controller = null;
  let timeout = null;
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      function finish(action, value) {
        if (settled) return;
        settled = true;
        action(value);
      }

      timeout = setTimeoutImpl(
        () => finish(reject, new Error("Helius subscription acknowledgement timed out")),
        timeoutMs,
      );

      Promise.resolve(
        runObserverImpl({
          apiKey: heliusApiKey,
          onEvent: () => {},
          onStatus: (status) => {
            if (status.state === "subscribed") finish(resolve);
            if (status.state === "subscription_error") {
              finish(reject, new Error("Helius rejected the observer subscription"));
            }
          },
        }),
      ).then(
        (started) => { controller = started; },
        (error) => finish(reject, error),
      );
    });
  } finally {
    if (timeout !== null) clearTimeoutImpl(timeout);
    controller?.stop();
  }

  const quote = await requestQuoteImpl({
    apiKey: jupiterApiKey,
    inputMint: NATIVE_SOL_MINT,
    outputMint: MAINNET_USDC_MINT,
    amountAtomic: "10000000",
  });

  const delivery = await deliverTelegramImpl({
    botToken: telegramBotToken,
    chatId: telegramChatId,
    body: "Solana observer preflight passed: Helius subscription, Jupiter quote, and Telegram delivery are working. Mode: observe only; trading authority: false.",
  });

  return Object.freeze({
    ok: true,
    heliusSubscription: "acknowledged",
    jupiterQuoteId: quote.providerQuoteId ?? null,
    telegramMessageId: delivery.messageId ?? null,
    runtimeAuthority: false,
  });
}

export const observerPreflightConstants = Object.freeze({
  mainnetUsdcMint: MAINNET_USDC_MINT,
});
