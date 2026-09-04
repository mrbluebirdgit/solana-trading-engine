import assert from "node:assert/strict";
import test from "node:test";

import {
  AGGREGATION_SCOPES,
  createTrafficSnapshot,
  LAUNCH_COHORT_METHODS,
  MARKET_CAP_DEFINITIONS,
  PROVIDER_RATIO_DENOMINATORS,
  TRAFFIC_WINDOWS,
} from "../src/core/intelligence/traffic-snapshot.mjs";

const base = {
  mint: "ExampleMint",
  observedAt: "2026-09-04T04:30:00.000Z",
  decisionCutoff: "2026-09-04T04:30:01.000Z",
  cutoffSlot: 370_000_000,
  venueStage: "unknown",
};

function observed(fields, {
  source = "test-provider",
  sourceMethodVersion = "test-provider.v1",
  kind = "PROVIDER_OBSERVATION",
  slot = null,
} = {}) {
  return fields.map((field) => ({
    field,
    source,
    sourceMethodVersion,
    kind,
    observedAt: "2026-09-04T04:29:59.000Z",
    eventTime: "2026-09-04T04:29:58.000Z",
    ...(slot === null ? {} : { slot }),
  }));
}

test("derives breadth and flow features without inventing a verdict", () => {
  const snapshot = createTrafficSnapshot({
    ...base,
    windows: {
      "5m": {
        buyVolumeUsd: 12_000,
        sellVolumeUsd: 3_000,
        buyTransactions: 120,
        sellTransactions: 30,
        rawUniqueMakers: 100,
        entityAdjustedMakers: 70,
        newAcquiringWallets: 55,
        holderCountStart: 100,
        holderCountEnd: 150,
        medianTradeUsd: 50,
      },
    },
    provenance: observed([
      "windows.5m.buyVolumeUsd",
      "windows.5m.sellVolumeUsd",
      "windows.5m.buyTransactions",
      "windows.5m.sellTransactions",
      "windows.5m.rawUniqueMakers",
      "windows.5m.entityAdjustedMakers",
      "windows.5m.newAcquiringWallets",
      "windows.5m.holderCountStart",
      "windows.5m.holderCountEnd",
      "windows.5m.medianTradeUsd",
    ]),
  });

  assert.deepEqual(Object.keys(snapshot.windows), TRAFFIC_WINDOWS);
  assert.equal(snapshot.windows["5m"].totalVolumeUsd, 15_000);
  assert.equal(snapshot.windows["5m"].netBuyVolumeUsd, 9_000);
  assert.equal(snapshot.windows["5m"].buyVolumeShare, 0.8);
  assert.equal(snapshot.windows["5m"].entityIndependenceRatio, 0.7);
  assert.equal(snapshot.windows["5m"].holderGrowthRate, 0.5);
  assert.equal(snapshot.decision, undefined);
  assert.equal(snapshot.runtimeAuthority, false);
});

test("keeps missing measurements null instead of treating them as zero", () => {
  const snapshot = createTrafficSnapshot(base);

  assert.equal(snapshot.windows["30s"].totalVolumeUsd, null);
  assert.equal(snapshot.windows["30s"].rawUniqueMakers, null);
  assert.equal(snapshot.market.liquidityToMarketCap, null);
  assert.equal(snapshot.social.uniqueAuthorShare, null);
  assert.equal(snapshot.ownership.launchCohorts, null);
  assert.equal(snapshot.providerLabels, null);
});

test("does not infer venue stage from market cap", () => {
  const snapshot = createTrafficSnapshot({
    ...base,
    venueStage: "unknown",
    market: {
      marketCapUsd: 69_000,
      marketCapDefinition: "provider_unspecified",
    },
    provenance: observed([
      "market.marketCapUsd",
      "market.marketCapDefinition",
    ]),
  });

  assert.equal(snapshot.venueStage, "unknown");
  assert.equal(snapshot.market.marketCapDefinition, "provider_unspecified");
});

test("keeps pair scope and canonical venue state explicit", () => {
  const snapshot = createTrafficSnapshot({
    ...base,
    venueStage: "pump_curve_active",
    aggregationScope: "pair",
    pairAddress: "ExamplePool",
    venue: {
      programId: "PumpProgram",
      programVersion: "pinned-idl-hash",
      quoteMint: "USDCMint",
      curveProgressRatio: 0.42,
    },
    provenance: observed(
      [
        "venueStage",
        "aggregationScope",
        "pairAddress",
        "venue.programId",
        "venue.programVersion",
        "venue.quoteMint",
        "venue.curveProgressRatio",
      ],
      { source: "canonical_chain", kind: "ON_CHAIN_FACT", slot: base.cutoffSlot },
    ),
  });

  assert.equal(snapshot.aggregationScope, "pair");
  assert.equal(snapshot.pairAddress, "ExamplePool");
  assert.equal(snapshot.venue.quoteMint, "USDCMint");
  assert.ok(AGGREGATION_SCOPES.includes("token_all_venues"));
  assert.ok(MARKET_CAP_DEFINITIONS.includes("circulating"));
  assert.throws(
    () => createTrafficSnapshot({ ...base, aggregationScope: "pair" }),
    /pairAddress is required/,
  );
});

test("rejects impossible entity breadth and future provenance", () => {
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        windows: {
          "5m": { rawUniqueMakers: 10, entityAdjustedMakers: 11 },
        },
      }),
    /cannot exceed/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        provenance: [
          {
            field: "windows.5m.rawUniqueMakers",
            source: "helius",
            sourceMethodVersion: "helius-parser.v1",
            kind: "ON_CHAIN_FACT",
            observedAt: "2026-09-04T04:31:00.000Z",
          },
        ],
      }),
    /later than the decision cutoff/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        provenance: [
          {
            field: "windows.5m.totalVolumeUsd",
            source: "canonical_chain",
            sourceMethodVersion: "canonical-parser.v1",
            kind: "ON_CHAIN_FACT",
            observedAt: "2026-09-04T04:29:59.000Z",
            eventTime: "2026-09-04T04:31:00.000Z",
          },
        ],
      }),
    /event time is later than the decision cutoff/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        provenance: [
          {
            field: "cutoffSlot",
            source: "canonical_chain",
            sourceMethodVersion: "canonical-parser.v1",
            kind: "ON_CHAIN_FACT",
            observedAt: "2026-09-04T04:29:59.000Z",
            slot: base.cutoffSlot + 1,
          },
        ],
      }),
    /slot is later than the cutoff slot/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        provenance: [
          {
            field: "cutoffSlot",
            source: "canonical_chain",
            sourceMethodVersion: "canonical-parser.v1",
            kind: "ON_CHAIN_FACT",
            observedAt: "2026-09-04T04:29:59.000Z",
            eventTime: "2026-09-04T04:30:00.000Z",
            slot: base.cutoffSlot,
          },
        ],
      }),
    /event time is later than its observation time/,
  );
});

test("requires exact provenance for every populated raw field", () => {
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        market: {
          marketCapUsd: 69_000,
          marketCapDefinition: "provider_unspecified",
        },
      }),
    /missing point-in-time provenance for market.marketCapUsd/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        provenance: observed(["not.a.snapshot.field"]),
      }),
    /is not a raw snapshot field/,
  );
});

test("distinguishes provider labels from on-chain facts", () => {
  const snapshot = createTrafficSnapshot({
    ...base,
    providerLabels: [
      {
        source: "gmgn",
        field: "bundler_rate",
        methodVersion: "gmgn-market.trending@cli-1.6.0",
        value: 0.3,
        denominator: "unspecified",
      },
    ],
    provenance: [
      {
        field: "providerLabels[0]",
        source: "gmgn",
        sourceMethodVersion: "gmgn-market.trending@cli-1.6.0",
        kind: "PROVIDER_LABEL",
        observedAt: "2026-09-04T04:29:59.000Z",
        confidence: 0.7,
      },
      {
        field: "cutoffSlot",
        source: "helius",
        sourceMethodVersion: "helius-parser.v1",
        kind: "ON_CHAIN_FACT",
        observedAt: "2026-09-04T04:29:59.500Z",
        slot: 370_000_000,
        confidence: 1,
      },
    ],
  });

  assert.equal(snapshot.provenance[0].kind, "PROVIDER_LABEL");
  assert.equal(snapshot.provenance[1].kind, "ON_CHAIN_FACT");
});

test("keeps launch-cohort methods and denominators separate", () => {
  const snapshot = createTrafficSnapshot({
    ...base,
    ownership: {
      launchCohorts: [
        {
          method: "same_slot_candidate",
          methodVersion: "slot-parser-v1",
          source: "canonical_chain",
          walletCount: 7,
          initialSupplyShare: 0.12,
          retainedSupplyShare: 0.06,
        },
        {
          method: "exact_jito_bundle",
          methodVersion: "jito-status-v1",
          source: "jito",
          bundleId: "example-bundle-id",
          bundleStatus: "landed",
          landingSlot: base.cutoffSlot,
          transactionSignatures: ["CreateSignature", "BuySignature"],
          containsLaunchActivity: true,
          containsBuyActivity: true,
          initialSupplyShare: 0.04,
        },
      ],
    },
    providerLabels: [
      {
        source: "gmgn",
        field: "bundler_rate",
        methodVersion: "gmgn-market.trending@cli-1.6.0",
        value: 0.3,
        denominator: "unspecified",
      },
      {
        source: "gmgn",
        field: "bundler_trader_amount_rate",
        methodVersion: "gmgn-market.trenches@cli-1.6.0",
        value: 0.2,
        denominator: "trading_volume",
      },
    ],
    provenance: [
      ...observed(
        ["ownership.launchCohorts[0]"],
        { source: "canonical_chain", kind: "ON_CHAIN_FACT", slot: base.cutoffSlot },
      ),
      ...observed(["ownership.launchCohorts[1]"], {
        source: "jito",
        kind: "PROVIDER_OBSERVATION",
      }),
      ...observed(["providerLabels[0]", "providerLabels[1]"], {
        source: "gmgn",
        kind: "PROVIDER_LABEL",
      }),
    ],
  });

  assert.deepEqual(
    snapshot.ownership.launchCohorts.map(({ method }) => method),
    ["same_slot_candidate", "exact_jito_bundle"],
  );
  assert.equal(snapshot.ownership.launchCohorts[0].retentionRatio, 0.5);
  assert.equal(snapshot.providerLabels[0].field, "bundler_rate");
  assert.equal(snapshot.providerLabels[0].denominator, "unspecified");
  assert.equal(snapshot.providerLabels[1].denominator, "trading_volume");
  assert.ok(PROVIDER_RATIO_DENOMINATORS.includes("trading_volume"));
  assert.ok(LAUNCH_COHORT_METHODS.includes("funding_linked_cluster"));
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        ownership: {
          launchCohorts: [
            {
              method: "exact_jito_bundle",
              methodVersion: "jito-status-v1",
              source: "jito",
            },
          ],
        },
      }),
    /requires landed Jito evidence/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        ownership: {
          launchCohorts: [
            {
              method: "exact_jito_bundle",
              methodVersion: "jito-status-v1",
              source: "jito",
              bundleId: "accepted-but-not-landed",
              bundleStatus: "pending",
              landingSlot: base.cutoffSlot,
              transactionSignatures: ["CreateSignature", "BuySignature"],
              containsLaunchActivity: true,
              containsBuyActivity: true,
            },
          ],
        },
      }),
    /requires landed Jito evidence/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        providerLabels: [
          {
            source: "gmgn",
            field: "bundler_rate",
            methodVersion: "gmgn-market.trending@cli-1.6.0",
            value: 0.3,
            denominator: "trading_volume",
          },
        ],
      }),
    /denominator contradicts the provider field/,
  );
});

test("allows social attention to decelerate", () => {
  const snapshot = createTrafficSnapshot({
    ...base,
    social: { mentionVelocityVsPrior3h: -0.4 },
    provenance: observed(["social.mentionVelocityVsPrior3h"]),
  });

  assert.equal(snapshot.social.mentionVelocityVsPrior3h, -0.4);
});

test("rejects impossible social count relationships", () => {
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        social: { mentionCount3h: 5, uniqueAuthors3h: 6 },
      }),
    /uniqueAuthors3h cannot exceed mentionCount3h/,
  );

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        social: {
          mentionCount3h: 10,
          uniqueAuthors3h: 5,
          holderAuthors3h: 6,
        },
      }),
    /holderAuthors3h cannot exceed uniqueAuthors3h/,
  );
});

test("rejects malformed structures, time, chain and numeric coercions", () => {
  assert.throws(
    () => createTrafficSnapshot({ ...base, cutoffSlot: null }),
    /cutoffSlot is required/,
  );
  assert.throws(
    () => createTrafficSnapshot({ ...base, chain: "sol" }),
    /canonical solana identifier/,
  );
  assert.throws(
    () => createTrafficSnapshot({ ...base, observedAt: "2026-02-30T00:00:00Z" }),
    /valid timestamp/,
  );
  assert.throws(
    () => createTrafficSnapshot({ ...base, windows: [] }),
    /windows must be an object/,
  );
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        windows: { "5m": { buyTransactions: true } },
      }),
    /must be numeric/,
  );
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        windows: {
          "5m": { buyVolumeUsd: 1e308, sellVolumeUsd: 1e308 },
        },
      }),
    /derived numeric value must be finite/,
  );
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        windows: { "5m": { buyVolumUsd: 10 } },
      }),
    /not a recognized field/,
  );
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        provenance: [
          {
            field: "cutoffSlot",
            source: "canonical_chain",
            sourceMethodVersion: "canonical-parser.v1",
            kind: "ON_CHAIN_FACT",
            observedAt: "2026-09-04T04:29:59.000Z",
            eventTime: false,
            slot: base.cutoffSlot,
          },
        ],
      }),
    /RFC 3339/,
  );
});

test("requires scope, cap definition and quote notional for derived market fields", () => {
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        market: { liquidityUsd: 50_000 },
      }),
    /aggregationScope is required/,
  );
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        market: { marketCapUsd: 100_000 },
      }),
    /marketCapDefinition is required/,
  );
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        market: { executableBuyImpactBps: 100 },
      }),
    /quoteNotionalUsd must be positive/,
  );
  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        aggregationScope: "token_all_venues",
        pairAddress: "ContradictoryPair",
      }),
    /only valid for pair aggregation/,
  );
});

test("requires confidence for model-derived cohort evidence", () => {
  const cohort = {
    method: "funding_linked_cluster",
    methodVersion: "funding-graph-v1",
    source: "entity-model",
    walletCount: 4,
    retainedSupplyShare: 0.08,
  };
  const provenance = observed(["ownership.launchCohorts[0]"], {
    source: "entity-model",
    kind: "MODEL_INFERENCE",
  });

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        ownership: { launchCohorts: [cohort] },
        provenance,
      }),
    /confidence is required for model inference/,
  );

  const snapshot = createTrafficSnapshot({
    ...base,
    ownership: { launchCohorts: [cohort] },
    provenance: provenance.map((item) => ({ ...item, confidence: 0.75 })),
  });
  assert.equal(snapshot.provenance[0].confidence, 0.75);
});

test("accepts a one-transaction landed Jito bundle only with launch and buy evidence", () => {
  const exact = {
    method: "exact_jito_bundle",
    methodVersion: "jito-status-v1",
    source: "jito",
    bundleId: "single-transaction-bundle",
    bundleStatus: "landed",
    landingSlot: base.cutoffSlot,
    transactionSignatures: ["AtomicLaunchAndBuySignature"],
    containsLaunchActivity: true,
    containsBuyActivity: true,
  };
  const provenance = observed(["ownership.launchCohorts[0]"], {
    source: "jito",
    kind: "PROVIDER_OBSERVATION",
  });

  const snapshot = createTrafficSnapshot({
    ...base,
    ownership: { launchCohorts: [exact] },
    provenance,
  });
  assert.equal(snapshot.ownership.launchCohorts[0].transactionSignatures.length, 1);

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        ownership: {
          launchCohorts: [{ ...exact, containsBuyActivity: false }],
        },
        provenance,
      }),
    /launch-plus-buy activity/,
  );
});

test("requires union cohorts to retain component and overlap evidence", () => {
  const union = {
    method: "union_model",
    methodVersion: "cohort-union-v1",
    source: "entity-model",
    walletCount: 8,
    initialSupplyShare: 0.15,
  };
  const provenance = observed(["ownership.launchCohorts[0]"], {
    source: "entity-model",
    kind: "MODEL_INFERENCE",
  }).map((item) => ({ ...item, confidence: 0.7 }));

  assert.throws(
    () =>
      createTrafficSnapshot({
        ...base,
        ownership: { launchCohorts: [union] },
        provenance,
      }),
    /requires distinct component methods and overlap evidence/,
  );

  const snapshot = createTrafficSnapshot({
    ...base,
    ownership: {
      launchCohorts: [
        {
          ...union,
          componentMethods: ["same_slot_candidate", "funding_linked_cluster"],
          overlapEvidenceRef: "event-ledger://cohort-overlap/example/v1",
        },
      ],
    },
    provenance,
  });
  assert.deepEqual(snapshot.ownership.launchCohorts[0].componentMethods, [
    "same_slot_candidate",
    "funding_linked_cluster",
  ]);
});
