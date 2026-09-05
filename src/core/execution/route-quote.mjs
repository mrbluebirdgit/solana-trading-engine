const SCHEMA_VERSION = 1;

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }

  return value.trim();
}

function atomicAmount(value, field) {
  const amount = requiredText(value, field);

  if (!/^\d+$/.test(amount)) {
    throw new TypeError(`${field} must be an unsigned integer string`);
  }

  return amount;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalText(value) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : null;
}

export function createRouteQuote({
  provider,
  chain,
  quotedAt,
  providerQuoteId = null,
  input,
  output,
  execution = {},
  route = [],
}) {
  const timestamp = new Date(quotedAt);

  if (Number.isNaN(timestamp.valueOf())) {
    throw new TypeError("quotedAt must be a valid timestamp");
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    provider: requiredText(provider, "provider"),
    chain: requiredText(chain, "chain"),
    quotedAt: timestamp.toISOString(),
    providerQuoteId: optionalText(providerQuoteId),
    input: Object.freeze({
      mint: requiredText(input?.mint, "input.mint"),
      amountAtomic: atomicAmount(input?.amountAtomic, "input.amountAtomic"),
      usdValue: optionalNumber(input?.usdValue),
    }),
    output: Object.freeze({
      mint: requiredText(output?.mint, "output.mint"),
      amountAtomic: atomicAmount(output?.amountAtomic, "output.amountAtomic"),
      minimumAmountAtomic:
        output?.minimumAmountAtomic === null ||
        output?.minimumAmountAtomic === undefined
          ? null
          : atomicAmount(
              output.minimumAmountAtomic,
              "output.minimumAmountAtomic",
            ),
      usdValue: optionalNumber(output?.usdValue),
    }),
    execution: Object.freeze({
      swapMode: optionalText(execution.swapMode),
      router: optionalText(execution.router),
      priceImpactPercent: optionalNumber(execution.priceImpactPercent),
      slippageBps: optionalNumber(execution.slippageBps),
      totalFeeBps: optionalNumber(execution.totalFeeBps),
      signatureFeeLamports: optionalNumber(execution.signatureFeeLamports),
      prioritizationFeeLamports: optionalNumber(
        execution.prioritizationFeeLamports,
      ),
      rentFeeLamports: optionalNumber(execution.rentFeeLamports),
      gasless: typeof execution.gasless === "boolean" ? execution.gasless : null,
    }),
    route: Object.freeze(
      route.map((step) =>
        Object.freeze({
          venue: optionalText(step.venue),
          inputMint: optionalText(step.inputMint),
          outputMint: optionalText(step.outputMint),
          percent: optionalNumber(step.percent),
          bps: optionalNumber(step.bps),
        }),
      ),
    ),
  });
}

