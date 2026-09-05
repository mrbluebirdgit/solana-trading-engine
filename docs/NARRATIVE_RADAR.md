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
7. The ledger receives `narrative_tick`, `narrative_mint_match`, and explicit
   failure records. A dedupe gate sends at most one alert per narrative/mint pair
   during the in-memory TTL.

Adapter failure does not fabricate a zero. If every configured discovery source
fails, narrative readiness becomes unhealthy. Helius metadata is required for a
mint candidate; DexScreener is optional. If a detected Pump mint cannot be
enriched, the failure is written to the ledger and readiness remains unhealthy
until restart. A later social poll cannot erase that coverage gap.

## Implemented adapters

| Role | Adapter | Credential | Default |
|---|---|---|---|
| Broad discovery | X trends by WOEID | `X_BEARER_TOKEN` | Enabled when key exists |
| Broad discovery | LunarCrush topics | `LUNARCRUSH_API_KEY` | Enabled when key exists |
| Broad discovery | NewsAPI top headlines | `NEWSAPI_KEY` | Enabled when key exists |
| Broad discovery | Explicit HTTPS RSS/Atom feeds | None | Enabled when URLs exist |
| Targeted confirmation | X recent search | `X_BEARER_TOKEN` | Off |
| Targeted confirmation | GDELT DOC API | None | Off |
| Mint birth and identity | Helius Pump logs, transaction resolution, DAS | `HELIUS_API_KEY` | Existing observer path |
| Pair enrichment | DexScreener token pairs | None | Best effort |
| Delivery | Telegram Bot `sendMessage` | Bot token and allowed chat ID | Existing optional path |

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
X_BEARER_TOKEN=
LUNARCRUSH_API_KEY=
NEWSAPI_KEY=
NARRATIVE_RSS_FEEDS=https://example.com/feed.xml

NARRATIVE_X_RECENT_SEARCH_ENABLED=false
NARRATIVE_GDELT_ENABLED=false
NARRATIVE_X_WOEIDS=1
NARRATIVE_NEWS_COUNTRIES=us
NARRATIVE_POLL_INTERVAL_MS=60000
NARRATIVE_CONFIRMATION_MAX_TERMS=3
NARRATIVE_ALERT_MIN_PRIORITY=70
```

At least one of X, LunarCrush, NewsAPI, or an approved RSS feed is required when
the radar is enabled. The recent-search and GDELT switches add targeted calls for
only the top configured number of terms. Review provider costs and quotas before
enabling them. NewsAPI top-headline discovery requires one to five explicit ISO
alpha-2 country codes and defaults to `us`.

Run without outbound alerts to validate collection and inspect the ledger:

```bash
npm test
npm run observe:run:local
```

Run with the existing Telegram Bot channel after both Bot values are configured:

```bash
npm run observe:run:local -- --notify
```

Manual read-only credential checks are available as `npm run verify:x:local`,
`npm run verify:lunarcrush:local`, and `npm run verify:newsapi:local`. The GitHub
workflow has equivalent owner-triggered checks. GitHub repository secrets do
not automatically become deployment-host secrets.

## Operational limitations

- The index and alert dedupe are in memory; restarts preserve ledger evidence but
  rebuild live clustering from new samples.
- The JSONL ledger is not a transactional database or a complete market archive.
- Helius reconnect gaps are recorded but not yet backfilled.
- Metadata or provider lag can miss a just-created mint. Failure is recorded,
  latches readiness unhealthy until restart, and does not create an inferred
  match.
- RSS XML handling is deliberately small and bounded; only operator-approved
  HTTPS feeds should be configured.
- No unauthenticated public `/top` endpoint is exposed.
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
