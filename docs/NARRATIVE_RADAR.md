# Observation-only meme narrative radar

## Outcome and boundary

The narrative radar is integrated into the existing Node.js observer. It detects
emerging attention, extracts candidate entities, clusters observations, and
matches new canonical Pump mints to those narratives. Matching evidence is
written to the same append-only JSONL ledger and can use the same Telegram Bot
delivery path as other observation alerts.

It does not create tokens, choose a winner, paper trade, or live trade. Its
`priorityScore` is an uncalibrated alert-routing score—not a probability of
success or permission to buy. Every source, match, score, and alert has
`runtimeAuthority: false`. No default keyword, KOL, wallet, or token list is
shipped.

## Two-clock architecture

The integration separates the slower attention clock from the slot-sensitive
chain clock:

1. Configured attention adapters poll in parallel and isolate failures.
2. A shared entity extractor converts tags, quoted phrases, concise topic names,
   and bounded proper-noun runs into normalized candidates.
3. Candidates cluster by canonical key and fuzzy similarity. Direct and
   aggregated social feeds collapse to one social evidence channel so one
   network cannot masquerade as independent corroboration.
4. The existing Helius listener observes Pump lifecycle logs, resolves each mint
   from the canonical transaction, and obtains metadata through Helius DAS.
5. DexScreener optionally adds pair links, attached social links, and liquidity;
   it cannot determine lifecycle state.
6. Name, symbol, and description matching joins a new mint to the current
   narrative index. The 15-minute competing-mint count penalizes crowded names.
7. A candidate that clears the alert floor and pair dedupe may receive bounded,
   parallel Birdeye, GMGN, and Solscan read-only enrichment. A provider timeout, quota
   exhaustion, or plan restriction is recorded but does not suppress the base
   narrative alert.
8. The ledger receives the match, provider evidence, delivery latency, and
   explicit failure records. A dedupe gate sends at most one alert per
   narrative/mint pair during the in-memory TTL. Generic opportunity alerts are
   off by default in narrative mode to prevent duplicate Telegram traffic.
9. When an alert-time provider price exists, a durable tracker observes the same
   mint after 1, 5, 15, and 60 minutes. It records point-to-point price change
   and may send concise `RESULT` notifications.

Adapter failure does not fabricate a zero. If every configured discovery source
fails, narrative readiness becomes unhealthy. Helius metadata is required for a
mint candidate; DexScreener is optional. If a detected Pump mint cannot be
enriched, the failure is written to the ledger and readiness remains unhealthy
until restart. A later social poll cannot erase that coverage gap.

## Implemented adapters

| Role | Adapter | Credential | Default |
|---|---|---|---|
| Broad discovery | X trends by WOEID | `X_BEARER_TOKEN` | Enabled when key exists |
| Broad discovery | LunarCrush topics | `LUNARCRUSH_API_KEY` | Production only when `LUNARCRUSH_PLAN` is not `hobby` |
| Broad discovery | NewsAPI top headlines | `NEWSAPI_KEY` | Production only when `NEWSAPI_PLAN` is not `developer` |
| Broad discovery | Explicit HTTPS RSS/Atom feeds | None | Enabled when URLs exist |
| Targeted confirmation | X recent search | `X_BEARER_TOKEN` | Off |
| Targeted confirmation | GDELT DOC API | None | Off |
| Mint birth and identity | Helius Pump logs, transaction resolution, DAS | `HELIUS_API_KEY` | Existing observer path |
| Pair enrichment | DexScreener token pairs | None | Best effort |
| Threshold-triggered evidence | Birdeye token overview and security | `BIRDEYE_API_KEY` | Enabled when key exists |
| Threshold-triggered evidence | GMGN token intelligence through exact-locked CLI | `GMGN_API_KEY` | Enabled when key exists |
| Threshold-triggered evidence | Solscan token metadata and holders | `SOLSCAN_API_KEY` | Enabled when key exists |
| Post-alert measurement | Birdeye, then GMGN, then Solscan price | Any provider key | Enabled when a key exists |
| Delivery | Telegram Bot `sendMessage` | Bot token and allowed chat ID | Existing optional path |

Birdeye, GMGN, and Solscan are supplemental. Their values are kept provider-labeled and
are not averaged into invented consensus. The alert prefers Birdeye for market
fields when both are available and keeps GMGN-specific smart-money, KOL, and
bundler labels explicit. Solscan supplies a slower independent metadata,
authority, and holder cross-check. None changes the narrative score or grants
trading authority.

The complete assessment—including deferred Google Trends, TikTok, Reddit,
Santiment, YouTube, Bitquery, and Dune candidates, plus rejected undocumented
frontend/scraper routes—is machine-readable in
[`config/narrative-source-catalog.v1.json`](../config/narrative-source-catalog.v1.json).

Important audit results:

- The official Google Trends API is still an access-limited alpha, so the engine
  does not substitute a scraper silently.
- TikTok's official Research API can lag newly published videos by up to 48
  hours, so it belongs in retrospective research, not a live launch trigger.
- Reddit access must use an approved developer integration; the engine does not
  depend on unauthenticated `.json` scraping.
- Santiment arbitrary-term social volume is useful for research but has
  plan/interval and historical-supplementation limitations.
- The suggested Pump frontend `/coins` routes are undocumented application
  internals. Canonical Pump program events plus Helius DAS replace them.

## Shared contracts

`AttentionSample` preserves provider, method version, source item, original
text/link, author when available, occurrence time, observation time, upstream
networks, and raw metrics. `MintCandidate` preserves the canonical mint event,
slot, observed lifecycle stage, metadata, and optional attached socials.

Velocity is emitted only when the same provider and source-method version have
both a recent window and an older baseline. Snapshot metrics compare their
recent and baseline medians directly; item-count feeds normalize counts by
window duration. This avoids turning a flat rolling metric into artificial
acceleration. Missing baseline, author identity, metadata, or social links is
reported as missing evidence rather than zero. Source timestamps later than the
observation clock are rejected.

The current `narrative-research-priority.v1` components are:

| Component | Maximum points | Meaning |
|---|---:|---|
| Mint/name fit | 35 | Exact or fuzzy packaging match |
| Independent evidence channels | 20 | Social, news, search, video, community—not provider count |
| Freshness | 15 | Decays across the one-hour in-memory horizon |
| Measured velocity | 15 | Requires a provider-specific baseline |
| Token packaging | 15 | Name, symbol, image, and attached social presence |
| Overcrowding | −20 | Penalizes additional matching mints seen in 15 minutes |

These weights and the default alert floor of `70` route research attention only.
They are not empirically calibrated and cannot be promoted into order logic
without chronological replay and the repository's research-governance process.

## Configuration

Copy `.env.example` to an untracked `.env`. Keep real credentials out of commits,
issues, pull requests, screenshots, and chat.

```dotenv
NARRATIVE_RADAR_ENABLED=true
GENERIC_OPPORTUNITY_ALERTS_ENABLED=false
X_BEARER_TOKEN=
LUNARCRUSH_API_KEY=
LUNARCRUSH_PLAN=hobby
NEWSAPI_KEY=
NEWSAPI_PLAN=developer
NARRATIVE_RSS_FEEDS=https://example.com/feed.xml

NARRATIVE_X_RECENT_SEARCH_ENABLED=false
NARRATIVE_GDELT_ENABLED=false
NARRATIVE_X_WOEIDS=1
NARRATIVE_NEWS_COUNTRIES=us
NARRATIVE_POLL_INTERVAL_MS=1200000
NARRATIVE_CONFIRMATION_MAX_TERMS=3
NARRATIVE_ALERT_MIN_PRIORITY=70
LUNARCRUSH_DAILY_REQUEST_LIMIT=100
LUNARCRUSH_DAILY_REQUEST_RESERVE=10
NEWSAPI_DAILY_REQUEST_LIMIT=100
NEWSAPI_DAILY_REQUEST_RESERVE=10

BIRDEYE_API_KEY=
GMGN_API_KEY=
SOLSCAN_API_KEY=
CANDIDATE_PROVIDER_TIMEOUT_MS=6000
BIRDEYE_DAILY_REQUEST_LIMIT=100
BIRDEYE_DAILY_REQUEST_RESERVE=10
GMGN_DAILY_REQUEST_LIMIT=50
GMGN_DAILY_REQUEST_RESERVE=5
SOLSCAN_DAILY_REQUEST_LIMIT=250
SOLSCAN_DAILY_REQUEST_RESERVE=25
NARRATIVE_OUTCOME_TRACKING_ENABLED=true
NARRATIVE_OUTCOME_NOTIFICATIONS_ENABLED=true
NARRATIVE_OUTCOME_CHECKPOINTS_MS=60000,300000,900000,3600000
```

At least one production-eligible source—X API, a social-enabled LunarCrush plan,
a production NewsAPI plan, or an approved RSS feed—is required when the radar is
enabled. Under the operator's recorded Hobby and Developer plans, LunarCrush
topics and NewsAPI are deliberately disabled in the production container; their
stored keys remain available for verification and local development. The
recent-search and GDELT switches add targeted calls for
only the top configured number of terms. Review provider costs and quotas before
enabling them. NewsAPI top-headline discovery requires one to five explicit ISO
alpha-2 country codes and defaults to `us`.

The provider limits are conservative safety ceilings, not claims about the
account's purchased plan. LunarCrush and NewsAPI count each actual HTTP request;
multiple NewsAPI countries therefore spend multiple calls per tick. All configured
provider counters, exponential failure backoff, and `429` `Retry-After` deadlines
are persisted beside the observation ledger,
and attention adapters also back off for a day after `401`/`402`/`403` plan or
key rejection. Reserved calls remain unavailable to routine collection so the
process fails quiet before consuming the entire configured allowance. The
outcome tracker auto-enables when any candidate-provider key exists; setting
it explicitly to `true` is shown above for clarity.

Run without outbound alerts to validate collection and inspect the ledger:

```bash
npm test
npm run observe:run:local
```

Run with the existing Telegram Bot channel after both Bot values are configured:

```bash
npm run observe:run:local -- --notify
```

Manual read-only credential checks include `npm run verify:birdeye:local`,
`npm run verify:gmgn:local`, `npm run verify:solscan:local`, `npm run verify:x:local`,
`npm run verify:lunarcrush:local`, and `npm run verify:newsapi:local`. The GitHub
workflow has equivalent owner-triggered checks. GitHub repository secrets do
not automatically become deployment-host secrets.

## Operational limitations

- The index and alert dedupe are in memory; restarts preserve ledger evidence and
  pending outcome checkpoints but rebuild live clustering from new samples.
- The JSONL ledger is not a transactional database or a complete market archive.
- Helius reconnect gaps are recorded but not yet backfilled.
- Metadata or provider lag can miss a just-created mint. Failure is recorded,
  latches readiness unhealthy until restart, and does not create an inferred
  match.
- RSS XML handling is deliberately small and bounded; only operator-approved
  HTTPS feeds should be configured.
- No unauthenticated public `/top` endpoint is exposed.
- Outcome percentages are point-to-point token-price observations, not simulated
  or realized P&L. They exclude fees, price impact, slippage, latency, failed
  exits, and liquidity changes. One appreciating token does not validate the
  strategy; the ledger exists so many chronological alerts can be evaluated.
- Social manipulation, bought engagement, repeated syndicated headlines, and
  token copycats remain adversarial inputs. The alert is a prompt for research.

## Primary references

- [X trends by WOEID](https://docs.x.com/x-api/trends/trends-by-woeid/introduction)
- [X recent search](https://docs.x.com/x-api/posts/search-recent-posts)
- [X filtered stream](https://docs.x.com/x-api/posts/filtered-stream/introduction)
- [Google Trends API alpha](https://developers.google.com/search/apis/trends)
- [TikTok Research API video query](https://developers.tiktok.com/doc/research-api-specs-query-videos/)
- [TikTok Research API FAQ](https://developers.tiktok.com/docs/en/research-api-faq)
- [Reddit developer API](https://developers.reddit.com/docs/capabilities/server/reddit-api)
- [YouTube search API](https://developers.google.com/youtube/v3/docs/search/list)
- [LunarCrush API](https://lunarcrush.com/en/developers/api)
- [Santiment social volume](https://academy.santiment.net/metrics/social-volume/)
- [GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [NewsAPI top headlines](https://newsapi.org/docs/endpoints/top-headlines)
- [Helius DAS `getAsset`](https://www.helius.dev/docs/api-reference/das/getasset)
- [DexScreener API reference](https://docs.dexscreener.com/api/reference)
- [Telegram Bot `sendMessage`](https://core.telegram.org/bots/api#sendmessage)
- [Birdeye authentication](https://data.birdeye.so/docs/authentication)
- [Birdeye rate limiting](https://data.birdeye.so/docs/guides/api-access/rate-limiting)
- [GMGN official skills and CLI](https://github.com/GMGNAI/gmgn-skills)
- [Solscan token metadata](https://pro-api.solscan.io/pro-api-docs/v2.0/reference/v2-token-meta)
- [Solscan token holders](https://pro-api.solscan.io/pro-api-docs/v2.0/reference/v2-token-holders)
