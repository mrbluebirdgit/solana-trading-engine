import { requestJupiterQuote } from "./quote.mjs";
import { NATIVE_SOL_MINT } from "../pump/program-ids.mjs";

export const DEFAULT_INTENDED_BUY_LAMPORTS = "50000000";

function observedAt(clock) {
  const value = clock();
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.valueOf())) {
    throw new TypeError("quote clock returned an invalid timestamp");
  }
  return timestamp.toISOString();
}

function ratio(buyOut, sellOutLamports, buyInLamports) {
  if (!buyOut || !sellOutLamports || !buyInLamports) return null;
  const buyIn = Number(buyInLamports);
  const sellOut = Number(sellOutLamports);
  if (!Number.isFinite(buyIn) || buyIn <= 0 || !Number.isFinite(sellOut)) {
    return null;
  }
  return sellOut / buyIn;
}

export async function quoteIntendedSize(
  { apiKey, mint, buyLamports = DEFAULT_INTENDED_BUY_LAMPORTS },
  options = {},
) {
  if (typeof mint !== "string" || mint.trim() === "") {
    throw new TypeError("mint is required");
  }
  if (!/^\d+$/.test(String(buyLamports)) || String(buyLamports) === "0") {
    throw new TypeError("buyLamports must be a positive integer string");
  }

  const clock = typeof options.now === "function" ? options.now : () => new Date();
  const { now: _now, quotedAt: legacyQuotedAt, ...requestOptions } = options;
  const buyRequestedAt = legacyQuotedAt ?? observedAt(clock);
  const buy = await requestJupiterQuote(
    {
      apiKey,
      inputMint: NATIVE_SOL_MINT,
      outputMint: mint.trim(),
      amountAtomic: String(buyLamports),
    },
    { ...requestOptions, quotedAt: buyRequestedAt },
  );
  const buyReceivedAt = observedAt(clock);

  const sellRequestedAt = observedAt(clock);
  const sell = await requestJupiterQuote(
    {
      apiKey,
      inputMint: mint.trim(),
      outputMint: NATIVE_SOL_MINT,
      amountAtomic: buy.output.amountAtomic,
    },
    { ...requestOptions, quotedAt: sellRequestedAt },
  );
  const sellReceivedAt = observedAt(clock);

  return Object.freeze({
    schemaVersion: 1,
    source: "jupiter",
    sourceMethodVersion: "jupiter-intended-size.v1",
    mint: mint.trim(),
    intendedBuyLamports: String(buyLamports),
    buy,
    sell,
    quoteSequence: Object.freeze({
      buyRequestedAt,
      buyReceivedAt,
      sellRequestedAt,
      sellReceivedAt,
    }),
    roundTripLamportsRecovered: sell.output.amountAtomic,
    roundTripRetention: ratio(
      buy.output.amountAtomic,
      sell.output.amountAtomic,
      buy.input.amountAtomic,
    ),
    buyPriceImpactPercent: buy.execution.priceImpactPercent,
    sellPriceImpactPercent: sell.execution.priceImpactPercent,
    runtimeAuthority: false,
  });
}
