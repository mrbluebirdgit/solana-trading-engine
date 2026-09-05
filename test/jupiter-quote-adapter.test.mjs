import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeJupiterQuote,
  requestJupiterQuote,
} from "../src/integrations/jupiter/quote.mjs";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const fixture = Object.freeze({
  inputMint: SOL_MINT,
  outputMint: USDC_MINT,
  inAmount: "10000000",
  outAmount: "1500000",
  inUsdValue: 1.51,
  outUsdValue: 1.5,
  otherAmountThreshold: "1492500",
  swapMode: "ExactIn",
  slippageBps: 50,
  priceImpact: -0.04,
  feeBps: 10,
  signatureFeeLamports: 5000,
  prioritizationFeeLamports: 1000,
  rentFeeLamports: 0,
  gasless: false,
  router: "metis",
  requestId: "quote-request-id",
  transaction: "must-not-cross-the-read-only-boundary",
  routePlan: [
    {
      swapInfo: {
        label: "Orca Whirlpool",
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
      },
      percent: 100,
      bps: 10_000,
    },
  ],
});

test("normalizes Jupiter data into a provider-neutral route quote", () => {
  const quote = normalizeJupiterQuote(fixture, "2026-09-04T00:00:00.000Z");

  assert.equal(quote.provider, "jupiter");
  assert.equal(quote.input.amountAtomic, "10000000");
  assert.equal(quote.output.minimumAmountAtomic, "1492500");
  assert.equal(quote.execution.priceImpactPercent, -0.04);
  assert.equal(quote.route[0].venue, "Orca Whirlpool");
  assert.equal("transaction" in quote, false);
});

test("requests a quote without wallet or transaction parameters", async () => {
  let requestedUrl;

  const quote = await requestJupiterQuote(
    {
      apiKey: "jupiter_api_key_for_testing",
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amountAtomic: "10000000",
    },
    {
      quotedAt: "2026-09-04T00:00:00.000Z",
      fetchImpl: async (url) => {
        requestedUrl = url;
        return { ok: true, json: async () => fixture };
      },
    },
  );

  assert.equal(requestedUrl.searchParams.get("amount"), "10000000");
  assert.equal(requestedUrl.searchParams.has("taker"), false);
  assert.equal(requestedUrl.searchParams.has("receiver"), false);
  assert.equal(requestedUrl.searchParams.has("payer"), false);
  assert.equal(quote.providerQuoteId, "quote-request-id");
});

test("rejects a response that does not match the requested route", async () => {
  await assert.rejects(
    requestJupiterQuote(
      {
        apiKey: "jupiter_api_key_for_testing",
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amountAtomic: "10000000",
      },
      {
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ ...fixture, outputMint: SOL_MINT }),
        }),
      },
    ),
    /did not match/,
  );
});

test("classifies a missing route as a candidate abstention", async () => {
  await assert.rejects(
    requestJupiterQuote(
      {
        apiKey: "jupiter_api_key_for_testing",
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amountAtomic: "10000000",
      },
      {
        fetchImpl: async () => ({
          ok: false,
          status: 400,
          json: async () => ({ errorCode: "NO_ROUTES_FOUND" }),
        }),
      },
    ),
    (error) =>
      error.code === "route_unavailable" &&
      error.scope === "candidate",
  );
});

test("does not hide an endpoint HTTP failure as a candidate no-route", async () => {
  await assert.rejects(
    requestJupiterQuote(
      {
        apiKey: "jupiter_api_key_for_testing",
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amountAtomic: "10000000",
      },
      {
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          json: async () => ({ message: "not found" }),
        }),
      },
    ),
    (error) => error.code === "http_error" && error.scope === "provider",
  );
});
